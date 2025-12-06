import cron from 'node-cron';
import { RdwSyncService } from './RdwSyncService';
import { ApkStatusService } from './ApkStatusService';
import { MaintenanceReminderService } from './MaintenanceReminderService';
import { QuarterlyReportService } from './QuarterlyReportService';
import { logger } from '../lib/logger';

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
			const startTime = Date.now();
			logger.debug('Checking for expired quotes using system-wide date tracking');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastQuoteExpiryCheck || new Date('2020-01-01');

			logger.debug('Quote expiry check details', { lastCheckDate: lastCheckDate.toISOString() });

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			logger.debug(`Processing ${enabledCompanies.length} companies for expired quotes`);

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
					logger.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('quote');

			logger.serviceComplete('Quote expiry check', Date.now() - startTime, {
				total: totalUpdated,
				successful: totalUpdated,
				failed: errors.length,
				skipped: 0,
				duration: Date.now() - startTime
			});

		} catch (error) {
			const errorMsg = `Failed to update expired quotes: ${(error as Error).message}`;
			logger.error(errorMsg);
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
			const startTime = Date.now();
			logger.debug('Checking for expired invoices using system-wide date tracking');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastInvoiceExpiryCheck || new Date('2020-01-01');

			logger.debug('Invoice expiry check details', { lastCheckDate: lastCheckDate.toISOString() });

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			logger.debug(`Processing ${enabledCompanies.length} companies for expired invoices`);

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
					logger.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('invoice');

			logger.serviceComplete('Invoice expiry check', Date.now() - startTime, {
				total: totalUpdated,
				successful: totalUpdated,
				failed: errors.length,
				skipped: 0,
				duration: Date.now() - startTime
			});

		} catch (error) {
			const errorMsg = `Failed to update expired invoices: ${(error as Error).message}`;
			logger.error(errorMsg);
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
			const startTime = Date.now();
			logger.debug('Checking for expired purchase invoices using system-wide date tracking');

			const tomorrowStartOfDay = this.getStartOfTomorrow();

			// Get system-wide last check date
			const systemDoc = await db.default.models.System.findOne();
			const lastCheckDate = systemDoc?.lastPurchaseInvoiceExpiryCheck || new Date('2020-01-01');

			logger.debug('Purchase invoice expiry check details', { lastCheckDate: lastCheckDate.toISOString() });

			// Get all companies with invoice status checking enabled
			const enabledCompanies = await db.default.models.Company.find({
				'serviceModules.invoiceStatusCheckingEnabled': { $ne: false }
			}).select('_id name');

			logger.debug(`Processing ${enabledCompanies.length} companies for expired purchase invoices`);

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
					logger.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system-wide timestamp once after all companies processed
			await this.updateSystemExpiryCheckDate('purchaseInvoice');

			logger.serviceComplete('Purchase invoice expiry check', Date.now() - startTime, {
				total: totalUpdated,
				successful: totalUpdated,
				failed: errors.length,
				skipped: 0,
				duration: Date.now() - startTime
			});

		} catch (error) {
			const errorMsg = `Failed to update expired purchase invoices: ${(error as Error).message}`;
			logger.error(errorMsg);
			errors.push(errorMsg);
		}

		return { updated: totalUpdated, errors };
	}

	/**
	 * Runs expiry checks for all document types (based on configuration)
	 */
	private async runExpiryCheck(): Promise<void> {
		const { config } = require('../lib/config');
		logger.debug('Starting scheduled expiry check');
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
				logger.info('All document expiry checks disabled, skipping');
				return;
			}

			logger.info(`Running expiry checks for: ${types.join(', ')}`);

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
					logger.error(errorMsg);
					allErrors.push(errorMsg);
				}
			});

			const duration = Date.now() - startTime;
			logger.serviceComplete('Scheduled expiry check', duration, {
				total: totalExpired,
				successful: totalExpired,
				failed: allErrors.length,
				skipped: 0,
				duration
			});

		} catch (error) {
			logger.error('Unexpected error during expiry check', { error: (error as Error).message });
		}
	}

	/**
	 * Run RDW vehicle data sync for all active companies
	 */
	private async runRdwSync(): Promise<void> {
		logger.info('Starting scheduled RDW vehicle sync');
		const startTime = Date.now();

		try {
			const rdwService = RdwSyncService.getInstance();
			const result = await rdwService.syncAllCompaniesVehicles();

			const duration = Date.now() - startTime;
			logger.serviceComplete('Scheduled RDW vehicle sync', duration, {
				total: result.synced,
				successful: result.synced,
				failed: result.errors.length,
				skipped: 0,
				duration
			});
		} catch (error) {
			logger.error('Unexpected error during RDW sync', { error: (error as Error).message });
		}
	}

	/**
	 * Run weekly APK status check and create notifications
	 * This checks the current APK expiry status and creates notifications
	 * Separate from RDW sync which fetches fresh data from the RDW API
	 */
	private async runApkStatusCheck(): Promise<void> {
		logger.info('Starting scheduled APK status check');
		const startTime = Date.now();

		try {
			const apkStatusService = ApkStatusService.getInstance();
			const result = await apkStatusService.checkApkExpiryForAllCompanies();

			const duration = Date.now() - startTime;
			logger.serviceComplete('Scheduled APK status check', duration, {
				total: result.notifications,
				successful: result.notifications,
				failed: result.errors.length,
				skipped: 0,
				duration
			});
		} catch (error) {
			logger.error('Unexpected error during APK status check', { error: (error as Error).message });
		}
	}

	/**
	 * Run daily RDW sync for expired and expiring vehicles
	 */
	private async runDailyExpiredVehiclesSync(): Promise<void> {
		logger.info('Starting scheduled daily sync for expired/expiring vehicles');
		const startTime = Date.now();

		try {
			const rdwService = RdwSyncService.getInstance();
			const result = await rdwService.syncExpiredAndExpiringVehicles();

			const duration = Date.now() - startTime;
			logger.serviceComplete('Scheduled daily expired/expiring vehicles sync', duration, {
				total: result.totalVehicles,
				successful: result.synced,
				failed: result.errors.length,
				skipped: 0,
				duration
			});
		} catch (error) {
			logger.error('Unexpected error during daily expired/expiring vehicles sync', { error: (error as Error).message });
		}
	}

	/**
	 * Run weekly maintenance reminder check
	 */
	private async runMaintenanceReminderCheck(): Promise<void> {
		logger.info('Starting scheduled maintenance reminder check');
		const startTime = Date.now();

		try {
			const maintenanceService = MaintenanceReminderService.getInstance();
			const result = await maintenanceService.checkMaintenanceReminders();

			const duration = Date.now() - startTime;
			logger.serviceComplete('Scheduled maintenance reminder check', duration, {
				total: result.notified,
				successful: result.notified,
				failed: result.errors.length,
				skipped: 0,
				duration
			});
		} catch (error) {
			logger.error('Unexpected error during maintenance reminder check', { error: (error as Error).message });
		}
	}

	/**
	 * Run quarterly report email to company owners
	 * Sends overview of open invoices with PDF attachment
	 */
	private async runQuarterlyReports(): Promise<void> {
		logger.info('Starting quarterly report generation');
		const startTime = Date.now();

		try {
			const quarterlyReportService = QuarterlyReportService.getInstance();

			// Check if it's actually the first day of a quarter
			if (!quarterlyReportService.isFirstDayOfQuarter()) {
				logger.info('Not the first day of a quarter, skipping quarterly reports');
				return;
			}

			const result = await quarterlyReportService.sendQuarterlyReports();

			const duration = Date.now() - startTime;
			logger.serviceComplete('Quarterly report generation', duration, {
				total: result.companiesProcessed,
				successful: result.emailsSent,
				failed: result.errors.length,
				skipped: result.companiesProcessed - result.emailsSent,
				duration
			});
		} catch (error) {
			logger.error('Unexpected error during quarterly report generation', { error: (error as Error).message });
		}
	}

	/**
	 * Check if quarterly reports were missed while the worker was down
	 * Only sends if we're within the first 7 days of a quarter
	 */
	private async checkMissedQuarterlyReports(): Promise<void> {
		try {
			const quarterlyReportService = QuarterlyReportService.getInstance();
			const shouldSend = await quarterlyReportService.shouldSendMissedQuarterlyReport();

			if (shouldSend) {
				logger.info('Detected missed quarterly report, sending now...');
				const result = await quarterlyReportService.sendQuarterlyReports();
				logger.info('Missed quarterly report catch-up completed', {
					companiesProcessed: result.companiesProcessed,
					emailsSent: result.emailsSent,
					errors: result.errors.length
				});
			} else {
				logger.debug('No missed quarterly reports detected');
			}
		} catch (error) {
			logger.error('Failed to check/send missed quarterly reports', { error: (error as Error).message });
		}
	}

	/**
	 * Start all schedulers based on configuration
	 */
	public startScheduler(): void {
		const { config } = require('../lib/config');

		logger.info('Starting schedulers based on configuration');

		const activeSchedulers: string[] = [];

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
			activeSchedulers.push('Document expiry check');
			logger.debug('Document expiry check scheduler started');
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
			activeSchedulers.push('RDW daily sync');
			logger.debug('RDW daily sync scheduler started');
		}

		// Schedule RDW sync every 3 months (every Sunday at 2 AM)
		if (config.enableRdwFullSync) {
			const rdwSyncJob = cron.schedule('0 2 * * 0', async () => {
				// This runs every Sunday at 2 AM
				// Checks internally if 3+ months have passed since last sync
				await this.runRdwSync();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('rdw-sync', rdwSyncJob);
			rdwSyncJob.start();
			activeSchedulers.push('RDW full sync');
			logger.debug('RDW full sync scheduler started');
		}

		// Schedule daily APK status check (every day at 1:30 AM)
		if (config.enableApkStatusCheck) {
			const dailyApkStatusCheckJob = cron.schedule('30 1 * * *', () => {
				this.runApkStatusCheck();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('daily-apk-status-check', dailyApkStatusCheckJob);
			dailyApkStatusCheckJob.start();
			activeSchedulers.push('APK status check');
			logger.debug('APK status check scheduler started');
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
			activeSchedulers.push('Maintenance reminder');
			logger.debug('Maintenance reminder scheduler started');
		}

		// Schedule quarterly reports (every day at 8:00 AM - checks internally if it's first day of quarter)
		// Runs on Jan 1, Apr 1, Jul 1, Oct 1
		if (config.enableQuarterlyReports) {
			const quarterlyReportJob = cron.schedule('0 8 1 1,4,7,10 *', () => {
				this.runQuarterlyReports();
			}, {
				scheduled: false,
				timezone: 'Europe/Amsterdam'
			});

			this.jobs.set('quarterly-reports', quarterlyReportJob);
			quarterlyReportJob.start();
			activeSchedulers.push('Quarterly reports');
			logger.debug('Quarterly reports scheduler started');

			// Check for missed quarterly reports on startup
			this.checkMissedQuarterlyReports();
		}

		logger.info(`Scheduler initialization complete. Active schedulers: ${activeSchedulers.join(', ')}`);
	}

	/**
	 * Stop the scheduler
	 */
	public stopScheduler(): void {
		logger.info(`Stopping ${this.jobs.size} schedulers`);
		this.jobs.forEach((job, name) => {
			job.stop();
			logger.debug(`Stopped scheduler: ${name}`);
		});
		this.jobs.clear();
		logger.info('All schedulers stopped');
	}

	/**
	 * Run expiry check manually (for testing or admin triggers)
	 */
	public async runManualUpdate(): Promise<void> {
		logger.info('Running manual expiry check');
		await this.runExpiryCheck();
	}

	/**
	 * Run RDW sync manually (for testing or admin triggers)
	 */
	public async runManualRdwSync(): Promise<void> {
		logger.info('Running manual RDW sync');
		await this.runRdwSync();
	}

	/**
	 * Run APK status check manually (for testing or admin triggers)
	 */
	public async runManualApkStatusCheck(): Promise<void> {
		logger.info('Running manual APK status check');
		await this.runApkStatusCheck();
	}

	/**
	 * Run daily expired/expiring vehicles sync manually (for testing or admin triggers)
	 */
	public async runManualDailyExpiredVehiclesSync(): Promise<void> {
		logger.info('Running manual daily expired/expiring vehicles sync');
		await this.runDailyExpiredVehiclesSync();
	}

	/**
	 * Run maintenance reminder check manually (for testing or admin triggers)
	 */
	public async runManualMaintenanceCheck(): Promise<void> {
		logger.info('Running manual maintenance reminder check');
		await this.runMaintenanceReminderCheck();
	}

	/**
	 * Run quarterly reports manually (for testing or admin triggers)
	 * This bypasses the first-day-of-quarter check
	 */
	public async runManualQuarterlyReports(): Promise<void> {
		logger.info('Running manual quarterly reports');
		const quarterlyReportService = QuarterlyReportService.getInstance();
		await quarterlyReportService.sendQuarterlyReports();
	}

	/**
	 * Run quarterly report for a specific company (for testing)
	 */
	public async runManualQuarterlyReportForCompany(companyId: string): Promise<void> {
		logger.info(`Running manual quarterly report for company ${companyId}`);
		const quarterlyReportService = QuarterlyReportService.getInstance();
		await quarterlyReportService.sendReportForCompany(companyId);
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

			logger.debug(`System ${type} expiry check date updated`, { date: (systemDoc as any)[fieldName].toISOString() });
		} catch (error) {
			logger.error(`Failed to update system ${type} expiry check date`, { error: (error as Error).message, type });
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
