import { logger } from '../lib/logger';

export class MaintenanceReminderService {
	private static instance: MaintenanceReminderService;

	private constructor() { }

	public static getInstance(): MaintenanceReminderService {
		if (!MaintenanceReminderService.instance) {
			MaintenanceReminderService.instance = new MaintenanceReminderService();
		}
		return MaintenanceReminderService.instance;
	}

	/**
	 * Check all vehicles for upcoming and overdue maintenance reminders
	 * Creates notifications for companies with vehicles requiring attention
	 */
	async checkMaintenanceReminders(): Promise<{ notified: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { NotificationService } = await import('../lib/notificationService');

		logger.info('Starting maintenance reminder check for all active companies');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalNotified = 0;

		try {
			// Find all companies with APK enabled
			const activeCompanies = await db.default.models.Company.find({
				'serviceModules.apkEnabled': { $ne: false }
			}).select('_id name');

			logger.info(`Found ${activeCompanies.length} active companies to check`);

			const today = new Date();
			const fourteenDaysFromNow = new Date();
			fourteenDaysFromNow.setDate(today.getDate() + 14);

			// Process companies in parallel
			const COMPANY_BATCH_SIZE = 5;
			for (let i = 0; i < activeCompanies.length; i += COMPANY_BATCH_SIZE) {
				const companyBatch = activeCompanies.slice(i, i + COMPANY_BATCH_SIZE);

				const results = await Promise.allSettled(
					companyBatch.map(async (company) => {
						try {
							const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

							// Find vehicles with overdue maintenance
							const overdueVehicles = await db.default.models.Vehicle.find({
								companyId: company._id,
								deleted: { $ne: true },
								$or: [
									{
										maintenanceReminders: {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: { $lt: today, $ne: null, $exists: true },
												lastNotified: { $exists: false }
											}
										}
									},
									{
										maintenanceReminders: {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: { $lt: today, $ne: null, $exists: true },
												lastNotified: { $lt: sevenDaysAgo }
											}
										}
									}
								]
							}).limit(50);

							// Find vehicles with maintenance due soon (within 14 days)
							const dueSoonVehicles = await db.default.models.Vehicle.find({
								companyId: company._id,
								deleted: { $ne: true },
								$or: [
									{
										maintenanceReminders: {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: {
													$gte: today,
													$lte: fourteenDaysFromNow,
													$ne: null,
													$exists: true
												},
												lastNotified: { $exists: false }
											}
										}
									},
									{
										maintenanceReminders: {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: {
													$gte: today,
													$lte: fourteenDaysFromNow,
													$ne: null,
													$exists: true
												},
												lastNotified: { $lt: sevenDaysAgo }
											}
										}
									}
								]
							}).limit(50);

							let notificationCount = 0;

							// Create notification for overdue maintenance
							if (overdueVehicles.length > 0) {
								const vehicleIds = overdueVehicles.map(v => v._id.toString());
								await NotificationService.createMaintenanceOverdueNotification(
									company._id.toString(),
									overdueVehicles.length,
									vehicleIds
								);

								// Bulk update lastNotified for overdue reminders (much more efficient)
								const now = new Date();
								await db.default.models.Vehicle.updateMany(
									{
										_id: { $in: overdueVehicles.map(v => v._id) },
										'maintenanceReminders': {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: { $lt: today, $ne: null, $exists: true }
											}
										}
									},
									{
										$set: {
											'maintenanceReminders.$[elem].lastNotified': now
										}
									},
									{
										arrayFilters: [
											{
												'elem.completed': false,
												'elem.dismissed': false,
												'elem.dueDate': { $lt: today, $ne: null, $exists: true }
											}
										]
									}
								);

								notificationCount++;
								logger.debug(`${company.name}: ${overdueVehicles.length} vehicles with overdue maintenance`);
							}

							// Create notification for upcoming maintenance
							if (dueSoonVehicles.length > 0) {
								const vehicleIds = dueSoonVehicles.map(v => v._id.toString());
								await NotificationService.createMaintenanceDueNotification(
									company._id.toString(),
									dueSoonVehicles.length,
									vehicleIds
								);

								// Bulk update lastNotified for due soon reminders (much more efficient)
								const now = new Date();
								await db.default.models.Vehicle.updateMany(
									{
										_id: { $in: dueSoonVehicles.map(v => v._id) },
										'maintenanceReminders': {
											$elemMatch: {
												completed: false,
												dismissed: false,
												dueDate: {
													$gte: today,
													$lte: fourteenDaysFromNow,
													$ne: null,
													$exists: true
												}
											}
										}
									},
									{
										$set: {
											'maintenanceReminders.$[elem].lastNotified': now
										}
									},
									{
										arrayFilters: [
											{
												'elem.completed': false,
												'elem.dismissed': false,
												'elem.dueDate': { $gte: today, $lte: fourteenDaysFromNow, $ne: null, $exists: true }
											}
										]
									}
								);

								notificationCount++;
								logger.debug(`${company.name}: ${dueSoonVehicles.length} vehicles with upcoming maintenance`);
							}

							return { company, notificationCount };
						} catch (err) {
							logger.error(`Error checking maintenance for company ${company.name}`, { error: (err as Error).message });
							throw err;
						}
					})
				);

				// Process results
				results.forEach((result) => {
					if (result.status === 'fulfilled') {
						totalNotified += result.value.notificationCount;
					} else {
						const errorMsg = `Failed to check maintenance for company: ${result.reason}`;
						logger.error(errorMsg);
						errors.push(errorMsg);
					}
				});
			}

			const duration = Date.now() - startTime;
			logger.serviceComplete('Maintenance reminder check', duration, {
				total: totalNotified,
				successful: totalNotified,
				failed: errors.length,
				skipped: 0,
				duration
			});

			return { notified: totalNotified, errors };
		} catch (error) {
			logger.error('Fatal error during maintenance reminder check', { error: (error as Error).message });
			errors.push((error as Error).message || 'Unknown error');
			return { notified: totalNotified, errors };
		}
	}

	/**
	 * Check maintenance reminders for a specific company
	 */
	async checkCompanyMaintenanceReminders(companyId: string): Promise<{ notified: number }> {
		const db = await import('../lib/db');
		const { NotificationService } = await import('../lib/notificationService');

		logger.debug(`Checking maintenance reminders for company ${companyId}`);

		const today = new Date();
		const fourteenDaysFromNow = new Date();
		fourteenDaysFromNow.setDate(today.getDate() + 14);
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

		let notificationCount = 0;

		// Find vehicles with overdue maintenance (not notified or notified > 7 days ago)
		const overdueVehicles = await db.default.models.Vehicle.find({
			companyId,
			deleted: { $ne: true },
			$or: [
				{
					maintenanceReminders: {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: { $lt: today, $ne: null, $exists: true },
							lastNotified: { $exists: false }
						}
					}
				},
				{
					maintenanceReminders: {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: { $lt: today, $ne: null, $exists: true },
							lastNotified: { $lt: sevenDaysAgo }
						}
					}
				}
			]
		}).limit(50);

		// Find vehicles with maintenance due soon (not notified or notified > 7 days ago)
		const dueSoonVehicles = await db.default.models.Vehicle.find({
			companyId,
			deleted: { $ne: true },
			$or: [
				{
					maintenanceReminders: {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: {
								$gte: today,
								$lte: fourteenDaysFromNow,
								$ne: null,
								$exists: true
							},
							lastNotified: { $exists: false }
						}
					}
				},
				{
					maintenanceReminders: {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: {
								$gte: today,
								$lte: fourteenDaysFromNow,
								$ne: null,
								$exists: true
							},
							lastNotified: { $lt: sevenDaysAgo }
						}
					}
				}
			]
		}).limit(50);

		// Create notification for overdue maintenance
		if (overdueVehicles.length > 0) {
			const vehicleIds = overdueVehicles.map(v => v._id.toString());
			await NotificationService.createMaintenanceOverdueNotification(
				companyId,
				overdueVehicles.length,
				vehicleIds
			);

			// Bulk update lastNotified for overdue reminders
			const now = new Date();
			await db.default.models.Vehicle.updateMany(
				{
					_id: { $in: overdueVehicles.map(v => v._id) },
					'maintenanceReminders': {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: { $lt: today, $ne: null, $exists: true }
						}
					}
				},
				{
					$set: {
						'maintenanceReminders.$[elem].lastNotified': now
					}
				},
				{
					arrayFilters: [
						{
							'elem.completed': false,
							'elem.dismissed': false,
							'elem.dueDate': { $lt: today, $ne: null, $exists: true }
						}
					]
				}
			);

			notificationCount++;
		}

		// Create notification for upcoming maintenance
		if (dueSoonVehicles.length > 0) {
			const vehicleIds = dueSoonVehicles.map(v => v._id.toString());
			await NotificationService.createMaintenanceDueNotification(
				companyId,
				dueSoonVehicles.length,
				vehicleIds
			);

			// Bulk update lastNotified for due soon reminders
			const now = new Date();
			await db.default.models.Vehicle.updateMany(
				{
					_id: { $in: dueSoonVehicles.map(v => v._id) },
					'maintenanceReminders': {
						$elemMatch: {
							completed: false,
							dismissed: false,
							dueDate: {
								$gte: today,
								$lte: fourteenDaysFromNow,
								$ne: null,
								$exists: true
							}
						}
					}
				},
				{
					$set: {
						'maintenanceReminders.$[elem].lastNotified': now
					}
				},
				{
					arrayFilters: [
						{
							'elem.completed': false,
							'elem.dismissed': false,
							'elem.dueDate': { $gte: today, $lte: fourteenDaysFromNow, $ne: null, $exists: true }
						}
					]
				}
			);

			notificationCount++;
		}

		logger.debug(`Created ${notificationCount} notifications for company ${companyId}`);

		return { notified: notificationCount };
	}
}
