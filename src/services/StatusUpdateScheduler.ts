import cron from 'node-cron';
import { RdwSyncService } from './RdwSyncService';
import { ApkStatusService } from './ApkStatusService';
import { MaintenanceReminderService } from './MaintenanceReminderService';

export class StatusUpdateScheduler {
	private static instance: StatusUpdateScheduler;
	private jobs: Map<string, cron.ScheduledTask> = new Map();

	private constructor() { }

	public static getInstance(): StatusUpdateScheduler {
		if (!StatusUpdateScheduler.instance) {
			StatusUpdateScheduler.instance = new StatusUpdateScheduler();
		}
		return StatusUpdateScheduler.instance;
	}

	/**
	 * Normalizes a date to the start of the day (00:00:00.000Z) for date-only comparisons
	 */
	private normalizeDateToStartOfDay(date: Date): Date {
		const normalized = new Date(date);
		normalized.setUTCHours(0, 0, 0, 0);
		return normalized;
	}

	/**
	 * Gets the start of tomorrow for comparison - invoices expiring today should be considered expired
	 */
	private getStartOfTomorrow(): Date {
		const tomorrow = new Date();
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		return this.normalizeDateToStartOfDay(tomorrow);
	}

	/**
	 * Updates expired quotes only - other statuses are handled during API usage
	 * Uses system-wide date tracking for consistency with RDW sync pattern
	 */
	private async updateExpiredQuotes(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { QUOTE_STATUS } = await import('../constants/quoteConstants');
		const errors: string[] = [];
		let totalUpdated = 0;

		try {
			console.log('🔄 Checking for expired quotes using system-wide date tracking...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastQuoteExpiryCheck || new Date('2020-01-01');

			console.log(`📅 Last quote expiry check: ${lastCheckDate.toISOString()}`);

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			console.log(`📊 Processing ${enabledCompanies.length} companies for expired quotes`);

			// Process each company using system-wide last check date
			for (const company of enabledCompanies) {
				try {
					// Find expired quotes for this company that are newer than last check
					const expiredQuotes = await db.default.models.Quote.find(
						{
							deleted: { $ne: true },
							companyId: company._id,
							status: { $nin: [QUOTE_STATUS.COMPLETED, QUOTE_STATUS.CONFIRMED, QUOTE_STATUS.EXPIRED] },
							expiration_date: {
								$lt: tomorrowStartOfDay,
								$gt: lastCheckDate // System-wide check date
							}
						},
						{
							_id: 1,
							quote_number: 1,
							clientId: 1,
							companyId: 1
						}
					).populate('clientId', 'name');

					if (expiredQuotes.length > 0) {
						// Update expired quotes for this company
						const expiredResult = await db.default.models.Quote.updateMany(
							{
								deleted: { $ne: true },
								companyId: company._id,
								status: { $nin: [QUOTE_STATUS.COMPLETED, QUOTE_STATUS.CONFIRMED, QUOTE_STATUS.EXPIRED] },
								expiration_date: {
									$lt: tomorrowStartOfDay,
									$gt: lastCheckDate
								}
							},
							{ $set: { status: QUOTE_STATUS.EXPIRED } }
						);

						totalUpdated += expiredResult.modifiedCount;

						// Create notifications for expired quotes
						for (const quote of expiredQuotes) {
							try {
								await this.createNotificationForExpiredQuote(quote, company.name);
							} catch (notificationError) {
								errors.push(`Failed to create notification for quote ${quote.quote_number}: ${notificationError}`);
							}
						}
					}

				} catch (companyError) {
					const errorMsg = `Failed to process expired quotes for company ${company.name}: ${companyError}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('quote');

			console.log(`✅ Quote expiry check completed: ${totalUpdated} quotes marked as expired across ${enabledCompanies.length} companies`);

		} catch (error) {
			const errorMsg = `Failed to update expired quotes: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated: totalUpdated, errors };
	}

	/**
	 * Updates expired invoices only - other statuses are handled during API usage
	 * Uses system-wide date tracking for consistency with RDW sync pattern
	 */
	private async updateExpiredInvoices(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { INVOICE_STATUS } = await import('../constants/invoiceConstants');
		const errors: string[] = [];
		let totalUpdated = 0;

		try {
			console.log('🔄 Checking for expired invoices using system-wide date tracking...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastInvoiceExpiryCheck || new Date('2020-01-01');

			console.log(`📅 Last invoice expiry check: ${lastCheckDate.toISOString()}`);

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			console.log(`📊 Processing ${enabledCompanies.length} companies for expired invoices`);

			// Process each company using system-wide last check date
			for (const company of enabledCompanies) {
				try {
					// Find expired invoices for this company that are newer than last check
					const expiredInvoices = await db.default.models.Invoice.find(
						{
							deleted: { $ne: true },
							companyId: company._id,
							status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.COMPLETED, INVOICE_STATUS.EXPIRED] },
							expiration_date: {
								$lt: tomorrowStartOfDay,
								$gt: lastCheckDate // System-wide check date
							},
							$expr: {
								$lt: [
									{ $sum: "$payments.amount" },
									"$total_incl_vat"
								]
							}
						},
						{
							_id: 1,
							invoice_number: 1,
							clientId: 1,
							companyId: 1
						}
					).populate('clientId', 'name');

					if (expiredInvoices.length > 0) {
						// Update expired invoices for this company
						const expiredResult = await db.default.models.Invoice.updateMany(
							{
								deleted: { $ne: true },
								companyId: company._id,
								status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.COMPLETED, INVOICE_STATUS.EXPIRED] },
								expiration_date: {
									$lt: tomorrowStartOfDay,
									$gt: lastCheckDate
								},
								$expr: {
									$lt: [
										{ $sum: { $ifNull: ["$payments.amount", []] } },
										"$total_incl_vat"
									]
								}
							},
							{ $set: { status: INVOICE_STATUS.EXPIRED } }
						);

						totalUpdated += expiredResult.modifiedCount;

						// Create notifications for expired invoices
						for (const invoice of expiredInvoices) {
							try {
								await this.createNotificationForExpiredInvoice(invoice, company.name);
							} catch (notificationError) {
								errors.push(`Failed to create notification for invoice ${invoice.invoice_number}: ${notificationError}`);
							}
						}
					}

				} catch (companyError) {
					const errorMsg = `Failed to process expired invoices for company ${company.name}: ${companyError}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('invoice');

			console.log(`✅ Invoice expiry check completed: ${totalUpdated} invoices marked as expired across ${enabledCompanies.length} companies`);

		} catch (error) {
			const errorMsg = `Failed to update expired invoices: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated: totalUpdated, errors };
	}

	/**
	 * Updates expired purchase invoices only - other statuses are handled during API usage
	 * Uses system-wide date tracking for consistency with RDW sync pattern
	 */
	private async updateExpiredPurchaseInvoices(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { PURCHASE_INVOICE_STATUS } = await import('../constants/purchaseInvoiceConstants');
		const errors: string[] = [];
		let totalUpdated = 0;

		try {
			console.log('🔄 Checking for expired purchase invoices using system-wide date tracking...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastPurchaseInvoiceExpiryCheck || new Date('2020-01-01');

			console.log(`📅 Last purchase invoice expiry check: ${lastCheckDate.toISOString()}`);

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			console.log(`📊 Processing ${enabledCompanies.length} companies for expired purchase invoices`);

			// Process each company using system-wide last check date
			for (const company of enabledCompanies) {
				try {
					// Update expired purchase invoices for this company that are newer than last check
					const expiredResult = await db.default.models.PurchaseInvoice.updateMany(
						{
							deleted: { $ne: true },
							companyId: company._id,
							status: { $nin: [PURCHASE_INVOICE_STATUS.COMPLETED, PURCHASE_INVOICE_STATUS.EXPIRED] },
							expiration_date: {
								$lt: tomorrowStartOfDay,
								$gt: lastCheckDate // System-wide check date
							},
							$expr: {
								$lt: [
									{ $sum: "$payments.amount" },
									"$total_incl_vat"
								]
							}
						},
						{ $set: { status: PURCHASE_INVOICE_STATUS.EXPIRED } }
					);

					totalUpdated += expiredResult.modifiedCount;

				} catch (companyError) {
					const errorMsg = `Failed to process expired purchase invoices for company ${company.name}: ${companyError}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('purchaseInvoice');

			console.log(`✅ Purchase invoice expiry check completed: ${totalUpdated} purchase invoices marked as expired across ${enabledCompanies.length} companies`);

		} catch (error) {
			const errorMsg = `Failed to update expired purchase invoices: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated: totalUpdated, errors };
	}

	/**
	 * Runs expiry checks for all document types (based on configuration)
	 */
	private async runExpiryCheck(): Promise<void> {
		const { config } = require('../lib/config');
		console.log('🚀 Starting scheduled expiry check...');
		const startTime = Date.now();

		try {
			const tasks = [];
			const types: string[] = [];

			// Only run checks that are enabled
			if (config.enableQuoteExpiryCheck) {
				tasks.push(this.updateExpiredQuotes());
				types.push('quotes');
			}
			if (config.enableInvoiceExpiryCheck) {
				tasks.push(this.updateExpiredInvoices());
				types.push('invoices');
			}
			if (config.enablePurchaseInvoiceExpiryCheck) {
				tasks.push(this.updateExpiredPurchaseInvoices());
				types.push('purchase invoices');
			}

			if (tasks.length === 0) {
				console.log('⏭️  All document expiry checks disabled, skipping...');
				return;
			}

			console.log(`📋 Running expiry checks for: ${types.join(', ')}`);

			const results = await Promise.allSettled(tasks);

			let totalExpired = 0;
			const allErrors: string[] = [];

			results.forEach((result, index) => {
				const type = types[index];

				if (result.status === 'fulfilled') {
					totalExpired += result.value.updated;
					allErrors.push(...result.value.errors);
				} else {
					const errorMsg = `Failed to check expiry for ${type}: ${result.reason}`;
					console.error('❌', errorMsg);
					allErrors.push(errorMsg);
				}
			});

			const duration = Date.now() - startTime;
			console.log(`🎉 Expiry check completed in ${duration}ms`);
			console.log(`📊 Summary: ${totalExpired} documents marked as expired, ${allErrors.length} errors`);

			if (allErrors.length > 0) {
				console.error('⚠️  Errors occurred:');
				allErrors.forEach(error => console.error(`   - ${error}`));
			}

		} catch (error) {
			console.error('❌ Unexpected error during expiry check:', error);
		}
	}

	/**
	 * Run RDW vehicle data sync for all active companies
	 */
	private async runRdwSync(): Promise<void> {
		console.log('🚀 Starting scheduled RDW vehicle sync...');
		const startTime = Date.now();

		try {
			const rdwService = RdwSyncService.getInstance();
			const result = await rdwService.syncAllCompaniesVehicles();

			const duration = Date.now() - startTime;
			console.log(`🎉 RDW sync completed in ${duration}ms`);
			console.log(`📊 Summary: ${result.synced} vehicles synced across ${result.companies} companies, ${result.errors.length} errors`);

			if (result.errors.length > 0) {
				console.error('⚠️  Errors occurred during RDW sync:');
				result.errors.forEach((error: string) => console.error(`   - ${error}`));
			}
		} catch (error) {
			console.error('❌ Unexpected error during RDW sync:', error);
		}
	}

	/**
	 * Run weekly APK status check and create notifications
	 * This checks the current APK expiry status and creates notifications
	 * Separate from RDW sync which fetches fresh data from the RDW API
	 */
	private async runApkStatusCheck(): Promise<void> {
		console.log('🔄 Starting scheduled APK status check...');
		const startTime = Date.now();

		try {
			const apkStatusService = ApkStatusService.getInstance();
			const result = await apkStatusService.checkApkExpiryForAllCompanies();

			const duration = Date.now() - startTime;
			console.log(`✅ APK status check completed in ${duration}ms`);
			console.log(`📊 Summary: ${result.notifications} notifications created, ${result.errors.length} errors`);

			if (result.errors.length > 0) {
				console.error('⚠️  Errors occurred during APK status check:');
				result.errors.forEach((error: string) => console.error(`   - ${error}`));
			}
		} catch (error) {
			console.error('❌ Unexpected error during APK status check:', error);
		}
	}

	/**
	 * Run daily RDW sync for expired and expiring vehicles
	 */
	private async runDailyExpiredVehiclesSync(): Promise<void> {
		console.log('🚀 Starting scheduled daily sync for expired/expiring vehicles...');
		const startTime = Date.now();

		try {
			const rdwService = RdwSyncService.getInstance();
			const result = await rdwService.syncExpiredAndExpiringVehicles();

			const duration = Date.now() - startTime;
			console.log(`🎉 Daily expired/expiring vehicles sync completed in ${duration}ms`);
			console.log(`📊 Summary: ${result.synced}/${result.totalVehicles} vehicles synced, ${result.errors.length} errors`);

			if (result.errors.length > 0) {
				console.error('⚠️  Errors occurred during daily expired/expiring vehicles sync:');
				result.errors.forEach((error: string) => console.error(`   - ${error}`));
			}
		} catch (error) {
			console.error('❌ Unexpected error during daily expired/expiring vehicles sync:', error);
		}
	}

	/**
	 * Run weekly maintenance reminder check
	 */
	private async runMaintenanceReminderCheck(): Promise<void> {
		console.log('🔧 Starting scheduled maintenance reminder check...');
		const startTime = Date.now();

		try {
			const maintenanceService = MaintenanceReminderService.getInstance();
			const result = await maintenanceService.checkMaintenanceReminders();

			const duration = Date.now() - startTime;
			console.log(`✅ Maintenance reminder check completed in ${duration}ms`);
			console.log(`📊 Summary: ${result.notified} notifications created, ${result.errors.length} errors`);

			if (result.errors.length > 0) {
				console.error('⚠️  Errors occurred during maintenance reminder check:');
				result.errors.forEach(error => console.error(`   - ${error}`));
			}
		} catch (error) {
			console.error('❌ Unexpected error during maintenance reminder check:', error);
		}
	}

	/**
	 * Start all schedulers based on configuration
	 */
	public startScheduler(): void {
		const { config } = require('../lib/config');

		console.log('⏰ Starting schedulers based on configuration...');

		// Schedule daily at midnight for document expiry checks
		if (config.enableDocumentExpiryCheck) {
			const dailyJob = cron.schedule('0 0 * * *', () => {
				this.runExpiryCheck();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('daily-expiry-check', dailyJob);
			dailyJob.start();
			console.log('✅ Document expiry check scheduler started');
		} else {
			console.log('⏭️  Document expiry check scheduler disabled');
		}

		// Schedule daily sync for expired/expiring vehicles (every day at 1:00 AM)
		if (config.enableRdwDailySync) {
			const dailyExpiredVehiclesSyncJob = cron.schedule('0 1 * * *', async () => {
				// This runs every day at 1:00 AM
				// Syncs only vehicles with expired or expiring APK
				// Runs BEFORE the APK status check so notifications are based on fresh data
				await this.runDailyExpiredVehiclesSync();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('daily-expired-vehicles-sync', dailyExpiredVehiclesSyncJob);
			dailyExpiredVehiclesSyncJob.start();
			console.log('✅ RDW daily sync scheduler started');
		} else {
			console.log('⏭️  RDW daily sync scheduler disabled');
		}

		// Schedule RDW sync every 6 weeks (every Sunday at 2 AM)
		if (config.enableRdwFullSync) {
			const rdwSyncJob = cron.schedule('0 2 * * 0', async () => {
				// This runs every Sunday at 2 AM
				// Checks internally if 6+ weeks have passed since last sync
				await this.runRdwSync();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('rdw-sync', rdwSyncJob);
			rdwSyncJob.start();
			console.log('✅ RDW full sync (6-week) scheduler started');
		} else {
			console.log('⏭️  RDW full sync scheduler disabled');
		}

		// Schedule weekly APK status check (every Sunday at 1:30 AM)
		if (config.enableApkStatusCheck) {
			const weeklyApkStatusCheckJob = cron.schedule('30 1 * * 0', () => {
				this.runApkStatusCheck();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('weekly-apk-status-check', weeklyApkStatusCheckJob);
			weeklyApkStatusCheckJob.start();
			console.log('✅ APK status check scheduler started');
		} else {
			console.log('⏭️  APK status check scheduler disabled');
		}

		// Schedule weekly maintenance reminder check (every Sunday at 3:00 AM)
		if (config.enableMaintenanceReminders) {
			const weeklyMaintenanceCheckJob = cron.schedule('0 3 * * 0', () => {
				this.runMaintenanceReminderCheck();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('weekly-maintenance-check', weeklyMaintenanceCheckJob);
			weeklyMaintenanceCheckJob.start();
			console.log('✅ Maintenance reminder scheduler started');
		} else {
			console.log('⏭️  Maintenance reminder scheduler disabled');
		}

		console.log('\n⏰ Active schedulers summary (chronological order):');
		if (config.enableDocumentExpiryCheck) {
			console.log('   12:00 AM - Daily       - Document expiry check (quotes, invoices, purchase invoices)');
		}
		if (config.enableRdwDailySync) {
			console.log('   1:00 AM  - Daily       - Expired/expiring vehicles RDW sync (fetches fresh APK data from RDW API)');
		}
		if (config.enableApkStatusCheck) {
			console.log('   1:30 AM  - Weekly      - APK status check (creates notifications based on current APK status)');
		}
		if (config.enableRdwFullSync) {
			console.log('   2:00 AM  - Every 6wks  - Full RDW vehicle sync (only if 6+ weeks since last sync)');
		}
		if (config.enableMaintenanceReminders) {
			console.log('   3:00 AM  - Weekly      - Maintenance reminder check');
		}
		console.log('');
	}

	/**
	 * Stop the scheduler
	 */
	public stopScheduler(): void {
		this.jobs.forEach((job, name) => {
			job.stop();
			console.log(`🛑 Stopped scheduler: ${name}`);
		});
		this.jobs.clear();
	}

	/**
	 * Run expiry check manually (for testing or admin triggers)
	 */
	public async runManualUpdate(): Promise<void> {
		console.log('🔧 Running manual expiry check...');
		await this.runExpiryCheck();
	}

	/**
	 * Run RDW sync manually (for testing or admin triggers)
	 */
	public async runManualRdwSync(): Promise<void> {
		console.log('🔧 Running manual RDW sync...');
		await this.runRdwSync();
	}

	/**
	 * Run APK status check manually (for testing or admin triggers)
	 */
	public async runManualApkStatusCheck(): Promise<void> {
		console.log('🔧 Running manual APK status check...');
		await this.runApkStatusCheck();
	}

	/**
	 * Run daily expired/expiring vehicles sync manually (for testing or admin triggers)
	 */
	public async runManualDailyExpiredVehiclesSync(): Promise<void> {
		console.log('🔧 Running manual daily expired/expiring vehicles sync...');
		await this.runDailyExpiredVehiclesSync();
	}

	/**
	 * Run maintenance reminder check manually (for testing or admin triggers)
	 */
	public async runManualMaintenanceCheck(): Promise<void> {
		console.log('🔧 Running manual maintenance reminder check...');
		await this.runMaintenanceReminderCheck();
	}

	/**
	 * Get scheduler status
	 */
	public getSchedulerStatus(): { [key: string]: boolean } {
		const status: { [key: string]: boolean } = {};
		this.jobs.forEach((job, name) => {
			// ScheduledTask doesn't have a running property, so we just check if it exists
			status[name] = !!job;
		});
		return status;
	}

	/**
	 * Update system-wide expiry check timestamp
	 */
	private async updateSystemExpiryCheckDate(type: 'quote' | 'invoice' | 'purchaseInvoice'): Promise<void> {
		const db = await import('../lib/db');
		try {
			const fieldMap = {
				quote: 'lastQuoteExpiryCheck',
				invoice: 'lastInvoiceExpiryCheck',
				purchaseInvoice: 'lastPurchaseInvoiceExpiryCheck'
			};

			const fieldName = fieldMap[type];

			// Find or create system document
			let systemDoc = await db.default.models.System.findOne();

			if (!systemDoc) {
				systemDoc = await db.default.models.System.create({
					[fieldName]: new Date(),
				});
			} else {
				(systemDoc as any)[fieldName] = new Date();
				await systemDoc.save();
			}

			console.log(`📅 System ${type} expiry check date updated: ${(systemDoc as any)[fieldName]}`);
		} catch (error) {
			console.error(`❌ Failed to update system ${type} expiry check date:`, error);
		}
	}

	/**
	 * Create notification for expired quote
	 */
	private async createNotificationForExpiredQuote(quote: any, companyName: string): Promise<void> {
		const { NotificationService } = await import('../lib/notificationService');
		await NotificationService.createQuoteExpiredNotification(
			quote.companyId.toString(),
			quote.quote_number?.toString() || '',
			(quote.clientId as any)?.name || 'Onbekende klant',
			quote._id.toString()
		);
	}

	/**
	 * Create notification for expired invoice
	 */
	private async createNotificationForExpiredInvoice(invoice: any, companyName: string): Promise<void> {
		const { NotificationService } = await import('../lib/notificationService');
		await NotificationService.createInvoiceExpiredNotification(
			invoice.companyId.toString(),
			invoice.invoice_number.toString(),
			(invoice.clientId as any)?.name || 'Onbekende klant',
			invoice._id.toString()
		);
	}
}
