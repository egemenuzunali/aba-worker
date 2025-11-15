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

		console.log('🔧 Starting maintenance reminder check for all active companies...');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalNotified = 0;

		try {
			// Find all companies with APK enabled
			const activeCompanies = await db.default.models.Company.find({
				'serviceModules.apkEnabled': { $ne: false }
			}).select('_id name');

			console.log(`📊 Found ${activeCompanies.length} active companies to check`);

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

								// Update lastNotified for these reminders
								for (const vehicle of overdueVehicles) {
									const reminders = vehicle.maintenanceReminders || [];
									let updated = false;
									for (const reminder of reminders) {
										if (!reminder.completed && !reminder.dismissed && reminder.dueDate && reminder.dueDate < today) {
											reminder.lastNotified = new Date();
											updated = true;
										}
									}
									if (updated) {
										await vehicle.save();
									}
								}

								notificationCount++;
								console.log(`⚠️  ${company.name}: ${overdueVehicles.length} vehicles with overdue maintenance`);
							}

							// Create notification for upcoming maintenance
							if (dueSoonVehicles.length > 0) {
								const vehicleIds = dueSoonVehicles.map(v => v._id.toString());
								await NotificationService.createMaintenanceDueNotification(
									company._id.toString(),
									dueSoonVehicles.length,
									vehicleIds
								);

								// Update lastNotified for these reminders
								for (const vehicle of dueSoonVehicles) {
									const reminders = vehicle.maintenanceReminders || [];
									let updated = false;
									for (const reminder of reminders) {
										if (!reminder.completed && !reminder.dismissed && reminder.dueDate && reminder.dueDate >= today && reminder.dueDate <= fourteenDaysFromNow) {
											reminder.lastNotified = new Date();
											updated = true;
										}
									}
									if (updated) {
										await vehicle.save();
									}
								}

								notificationCount++;
								console.log(`📅 ${company.name}: ${dueSoonVehicles.length} vehicles with upcoming maintenance`);
							}

							return { company, notificationCount };
						} catch (err) {
							console.error(`❌ Error checking maintenance for company ${company.name}:`, err);
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
						console.error('❌', errorMsg);
						errors.push(errorMsg);
					}
				});
			}

			const duration = ((Date.now() - startTime) / 1000).toFixed(2);
			console.log(`✅ Maintenance reminder check completed in ${duration}s`);
			console.log(`📊 Results: ${totalNotified} notifications created across ${activeCompanies.length} companies`);

			if (errors.length > 0) {
				console.log(`⚠️  ${errors.length} errors encountered`);
			}

			return { notified: totalNotified, errors };
		} catch (error) {
			console.error('❌ Fatal error during maintenance reminder check:', error);
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

		console.log(`🔧 Checking maintenance reminders for company ${companyId}...`);

		const today = new Date();
		const fourteenDaysFromNow = new Date();
		fourteenDaysFromNow.setDate(today.getDate() + 14);

		let notificationCount = 0;

		// Find vehicles with overdue maintenance
		const overdueVehicles = await db.default.models.Vehicle.find({
			companyId,
			deleted: { $ne: true },
			maintenanceReminders: {
				$elemMatch: {
					completed: false,
					dismissed: false,
					dueDate: { $lt: today, $ne: null, $exists: true }
				}
			}
		}).limit(50);

		// Find vehicles with maintenance due soon
		const dueSoonVehicles = await db.default.models.Vehicle.find({
			companyId,
			deleted: { $ne: true },
			maintenanceReminders: {
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
		}).limit(50);

		// Create notification for overdue maintenance
		if (overdueVehicles.length > 0) {
			const vehicleIds = overdueVehicles.map(v => v._id.toString());
			await NotificationService.createMaintenanceOverdueNotification(
				companyId,
				overdueVehicles.length,
				vehicleIds
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
			notificationCount++;
		}

		console.log(`✅ Created ${notificationCount} notifications for company ${companyId}`);

		return { notified: notificationCount };
	}
}
