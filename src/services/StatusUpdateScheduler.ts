import cron from 'node-cron';
import { RdwSyncService } from './RdwSyncService';
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
	 */
	private async updateExpiredQuotes(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { QUOTE_STATUS } = await import('../constants/quoteConstants');
		const errors: string[] = [];
		let updated = 0;

		try {
			console.log('🔄 Checking for expired quotes (last 2 years)...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(new Date().getFullYear() - 2);
			const twoYearsAgoStartOfDay = this.normalizeDateToStartOfDay(twoYearsAgo);

			// First, find expired quotes to create notifications
			const expiredQuotes = await db.default.models.Quote.find(
				{
					deleted: { $ne: true },
					status: { $nin: [QUOTE_STATUS.COMPLETED, QUOTE_STATUS.CONFIRMED, QUOTE_STATUS.EXPIRED] },
					expiration_date: {
						$lt: tomorrowStartOfDay,
						$gte: twoYearsAgoStartOfDay
					}
				},
				{
					_id: 1,
					quote_number: 1,
					clientId: 1
				}
			).populate('clientId', 'name');

			// Update expired quotes
			const expiredResult = await db.default.models.Quote.updateMany(
				{
					deleted: { $ne: true },
					status: { $nin: [QUOTE_STATUS.COMPLETED, QUOTE_STATUS.CONFIRMED, QUOTE_STATUS.EXPIRED] },
					expiration_date: {
						$lt: tomorrowStartOfDay,
						$gte: twoYearsAgoStartOfDay
					}
				},
				{ $set: { status: QUOTE_STATUS.EXPIRED } }
			);

			updated = expiredResult.modifiedCount;

			// Create notifications for expired quotes
			const { NotificationService } = await import('../lib/notificationService');
			for (const quote of expiredQuotes) {
				try {
					await NotificationService.createQuoteExpiredNotification(
						quote.companyId.toString(),
						quote.quote_number?.toString() || '',
						(quote.clientId as any)?.name || 'Onbekende klant',
						quote._id.toString()
					);
				} catch (notificationError) {
					const errorMsg = `Failed to create notification for expired quote ${quote.quote_number}: ${(notificationError as Error).message}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			console.log(`✅ Quote expiry check completed: ${updated} quotes marked as expired, ${expiredQuotes.length} notifications created`);

		} catch (error) {
			const errorMsg = `Failed to update expired quotes: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated, errors };
	}

	/**
	 * Updates expired invoices only - other statuses are handled during API usage
	 */
	private async updateExpiredInvoices(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { INVOICE_STATUS } = await import('../constants/invoiceConstants');
		const errors: string[] = [];
		let updated = 0;

		try {
			console.log('🔄 Checking for expired invoices (last 2 years)...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(new Date().getFullYear() - 2);
			const twoYearsAgoStartOfDay = this.normalizeDateToStartOfDay(twoYearsAgo);

			// First, find expired invoices to create notifications
			const expiredInvoices = await db.default.models.Invoice.find(
				{
					deleted: { $ne: true },
					status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.COMPLETED, INVOICE_STATUS.EXPIRED] },
					expiration_date: {
						$lt: tomorrowStartOfDay,
						$gte: twoYearsAgoStartOfDay
					},
					$expr: {
						$lt: [
							{ $sum: { $ifNull: ["$payments.amount", []] } },
							"$total_incl_vat"
						]
					}
				},
				{
					_id: 1,
					invoice_number: 1,
					clientId: 1
				}
			).populate('clientId', 'name');

			// Update expired invoices
			const expiredResult = await db.default.models.Invoice.updateMany(
				{
					deleted: { $ne: true },
					status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.COMPLETED, INVOICE_STATUS.EXPIRED] },
					expiration_date: {
						$lt: tomorrowStartOfDay,
						$gte: twoYearsAgoStartOfDay
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

			updated = expiredResult.modifiedCount;

			// Create notifications for expired invoices
			const { NotificationService } = await import('../lib/notificationService');
			for (const invoice of expiredInvoices) {
				try {
					await NotificationService.createInvoiceExpiredNotification(
						invoice.companyId.toString(),
						invoice.invoice_number.toString(),
						(invoice.clientId as any)?.name || 'Onbekende klant',
						invoice._id.toString()
					);
				} catch (notificationError) {
					const errorMsg = `Failed to create notification for expired invoice ${invoice.invoice_number}: ${(notificationError as Error).message}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			console.log(`✅ Invoice expiry check completed: ${updated} invoices marked as expired, ${expiredInvoices.length} notifications created`);

		} catch (error) {
			const errorMsg = `Failed to update expired invoices: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated, errors };
	}

	/**
	 * Updates expired purchase invoices only - other statuses are handled during API usage
	 */
	private async updateExpiredPurchaseInvoices(): Promise<{ updated: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { PURCHASE_INVOICE_STATUS } = await import('../constants/purchaseInvoiceConstants');
		const errors: string[] = [];
		let updated = 0;

		try {
			console.log('🔄 Checking for expired purchase invoices (last 2 years)...');

			const tomorrowStartOfDay = this.getStartOfTomorrow();
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(new Date().getFullYear() - 2);
			const twoYearsAgoStartOfDay = this.normalizeDateToStartOfDay(twoYearsAgo);

			// Update expired purchase invoices
			const expiredResult = await db.default.models.PurchaseInvoice.updateMany(
				{
					deleted: { $ne: true },
					status: { $nin: [PURCHASE_INVOICE_STATUS.COMPLETED, PURCHASE_INVOICE_STATUS.EXPIRED] },
					expiration_date: {
						$lt: tomorrowStartOfDay,
						$gte: twoYearsAgoStartOfDay
					},
					$expr: {
						$lt: [
							{ $sum: { $ifNull: ["$payments.amount", []] } },
							"$total_incl_vat"
						]
					}
				},
				{ $set: { status: PURCHASE_INVOICE_STATUS.EXPIRED } }
			);

			updated = expiredResult.modifiedCount;

			console.log(`✅ Purchase invoice expiry check completed: ${updated} purchase invoices marked as expired`);

		} catch (error) {
			const errorMsg = `Failed to update expired purchase invoices: ${(error as Error).message}`;
			console.error('❌', errorMsg);
			errors.push(errorMsg);
		}

		return { updated, errors };
	}

	/**
	 * Runs expiry checks for all document types
	 */
	private async runExpiryCheck(): Promise<void> {
		console.log('🚀 Starting scheduled expiry check...');
		const startTime = Date.now();

		try {
			const results = await Promise.allSettled([
				this.updateExpiredQuotes(),
				this.updateExpiredInvoices(),
				this.updateExpiredPurchaseInvoices()
			]);

			let totalExpired = 0;
			const allErrors: string[] = [];

			results.forEach((result, index) => {
				const type = ['quotes', 'invoices', 'purchase invoices'][index];

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
	 * Run weekly APK expiry check and create notifications
	 */
	private async runApkExpiryCheck(): Promise<void> {
		console.log('🔄 Starting scheduled APK expiry check...');
		const startTime = Date.now();

		try {
			const rdwService = RdwSyncService.getInstance();
			const result = await rdwService.checkApkExpiryForAllCompanies();

			const duration = Date.now() - startTime;
			console.log(`✅ APK expiry check completed in ${duration}ms`);
			console.log(`📊 Summary: ${result.notifications} notifications created, ${result.errors.length} errors`);

			if (result.errors.length > 0) {
				console.error('⚠️  Errors occurred during APK expiry check:');
				result.errors.forEach((error: string) => console.error(`   - ${error}`));
			}
		} catch (error) {
			console.error('❌ Unexpected error during APK expiry check:', error);
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
	 * Start all schedulers
	 */
	public startScheduler(): void {
		// Schedule daily at midnight for document expiry checks
		const dailyJob = cron.schedule('0 0 * * *', () => {
			this.runExpiryCheck();
		}, {
			scheduled: false,
			timezone: 'Europe/Amsterdam'
		});

		this.jobs.set('daily-expiry-check', dailyJob);
		dailyJob.start();

		// Schedule daily sync for expired/expiring vehicles (every day at 1:00 AM)
		const dailyExpiredVehiclesSyncJob = cron.schedule('0 1 * * *', async () => {
			// This runs every day at 1:00 AM
			// Syncs only vehicles with expired or expiring APK
			// Runs BEFORE the APK expiry check so notifications are based on fresh data
			await this.runDailyExpiredVehiclesSync();
		}, {
			scheduled: false,
			timezone: 'Europe/Amsterdam'
		});

		this.jobs.set('daily-expired-vehicles-sync', dailyExpiredVehiclesSyncJob);
		dailyExpiredVehiclesSyncJob.start();

		// Schedule RDW sync every 6 weeks (every Sunday at 2 AM)
		const rdwSyncJob = cron.schedule('0 2 * * 0', async () => {
			// This runs every Sunday at 2 AM
			// We'll implement a check to ensure it only syncs every 6 weeks
			await this.runRdwSync();
		}, {
			scheduled: false,
			timezone: 'Europe/Amsterdam'
		});

		this.jobs.set('rdw-sync', rdwSyncJob);
		rdwSyncJob.start();

		// Schedule weekly APK expiry check (every Sunday at 1:30 AM)
		const weeklyApkCheckJob = cron.schedule('30 1 * * 0', () => {
			this.runApkExpiryCheck();
		}, {
			scheduled: false,
			timezone: 'Europe/Amsterdam'
		});

		this.jobs.set('weekly-apk-check', weeklyApkCheckJob);
		weeklyApkCheckJob.start();

		// Schedule weekly maintenance reminder check (every Sunday at 3:00 AM)
		const weeklyMaintenanceCheckJob = cron.schedule('0 3 * * 0', () => {
			this.runMaintenanceReminderCheck();
		}, {
			scheduled: false,
			timezone: 'Europe/Amsterdam'
		});

		this.jobs.set('weekly-maintenance-check', weeklyMaintenanceCheckJob);
		weeklyMaintenanceCheckJob.start();

		console.log('⏰ All schedulers started (chronological order):');
		console.log('   12:00 AM - Daily       - Document expiry check (quotes, invoices, purchase invoices)');
		console.log('   1:00 AM  - Daily       - Expired/expiring vehicles RDW sync');
		console.log('   1:30 AM  - Weekly      - APK notification check (uses fresh data from 1:00 AM sync)');
		console.log('   2:00 AM  - Every 6wks  - Full RDW vehicle sync (only if 6+ weeks since last sync)');
		console.log('   3:00 AM  - Weekly      - Maintenance reminder check');
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
	 * Run APK expiry check manually (for testing or admin triggers)
	 */
	public async runManualApkCheck(): Promise<void> {
		console.log('🔧 Running manual APK expiry check...');
		await this.runApkExpiryCheck();
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
}
