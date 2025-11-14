// TODO: Import when models are available
// import { models } from '../models';
// import { fetchRDWVehicleData, isValidDutchLicensePlate, determineFieldsToUpdate, formatDutchLicensePlate } from '../lib/rdwService';
// import { NotificationService } from '../lib/notificationService';
import mongoose from 'mongoose';

interface PopulatedVehicle {
	_id: mongoose.Types.ObjectId;
	license_plate: string;
	clientId?: {
		_id: mongoose.Types.ObjectId;
		apkNotificationsDisabled?: boolean;
	} | null;
}

export class RdwSyncService {
	private static instance: RdwSyncService;

	private constructor() { }

	public static getInstance(): RdwSyncService {
		if (!RdwSyncService.instance) {
			RdwSyncService.instance = new RdwSyncService();
		}
		return RdwSyncService.instance;
	}

	/**
	 * Sync all vehicles from active companies with RDW data
	 */
	async syncAllCompaniesVehicles(force = false): Promise<{ synced: number; errors: string[]; companies: number }> {
		const db = await import('../lib/db');
		console.log('🚀 Starting RDW vehicle sync for all active companies...');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalSynced = 0;
		let companiesProcessed = 0;

		try {
			// Check if it's been 6 weeks since last sync (unless forced)
			if (!force) {
				const systemDoc = await db.default.models.System.findOne();
				if (systemDoc?.lastRdwSync) {
					const sixWeeksAgo = new Date();
					sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42); // 6 weeks = 42 days

					if (systemDoc.lastRdwSync > sixWeeksAgo) {
						console.log('⏭️  Skipping RDW sync - last sync was less than 6 weeks ago');
						console.log(`   Last sync: ${systemDoc.lastRdwSync}`);
						return { synced: 0, errors: [], companies: 0 };
					}
				}
			}

			// Find all companies active in the last year
			const oneYearAgo = new Date();
			oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

			const activeCompanies = await db.default.models.Company.find({
				lastActiveAt: { $gte: oneYearAgo }
			}).select('_id name');

			console.log(`📊 Found ${activeCompanies.length} active companies`);

			// Process companies in parallel (up to 3 at a time to avoid overwhelming the system)
			const COMPANY_BATCH_SIZE = 3;
			for (let i = 0; i < activeCompanies.length; i += COMPANY_BATCH_SIZE) {
				const companyBatch = activeCompanies.slice(i, i + COMPANY_BATCH_SIZE);

				const results = await Promise.allSettled(
					companyBatch.map(async (company) => {
						const syncedCount = await this.syncCompanyVehicles(company._id.toString());
						return { company, syncedCount };
					})
				);

				// Process results
				results.forEach((result) => {
					if (result.status === 'fulfilled') {
						totalSynced += result.value.syncedCount;
						companiesProcessed++;
						console.log(`✅ Company ${result.value.company.name}: ${result.value.syncedCount} vehicles synced`);
					} else {
						const errorMsg = `Failed to sync vehicles for company: ${result.reason}`;
						console.error('❌', errorMsg);
						errors.push(errorMsg);
					}
				});
			}

			// Update system sync date
			await this.updateSystemSyncDate();

			const duration = Date.now() - startTime;
			console.log(`🎉 RDW sync completed in ${duration}ms`);
			console.log(`📊 Summary: ${totalSynced} vehicles synced across ${companiesProcessed} companies, ${errors.length} errors`);

			return { synced: totalSynced, errors, companies: companiesProcessed };
		} catch (error) {
			console.error('❌ Unexpected error during RDW sync:', error);
			errors.push(`Unexpected error: ${(error as Error).message}`);
			return { synced: totalSynced, errors, companies: companiesProcessed };
		}
	}

	/**
	 * Sync all vehicles for a specific company
	 */
	public async syncCompanyVehicles(companyId: string): Promise<number> {
		const db = await import('../lib/db');
		const { fetchRDWVehicleData, isValidDutchLicensePlate, determineFieldsToUpdate, formatDutchLicensePlate } = await import('../lib/rdwService');
		const { NotificationService } = await import('../lib/notificationService');

		let syncedCount = 0;
		const BATCH_SIZE = 25; // Process 25 vehicles at a time (increased from 10)
		const BATCH_DELAY = 500; // 0.5 second delay between batches (reduced from 2s)
		const PAGE_SIZE = 500; // Fetch vehicles in pages to avoid memory issues

		// Get total count first
		const totalVehicles = await db.default.models.Vehicle.countDocuments({
			companyId: companyId,
			deleted: { $ne: true },
			license_plate: { $exists: true, $nin: [null, ''] }
		});

		console.log(`Processing ${totalVehicles} vehicles in pages of ${PAGE_SIZE}, batches of ${BATCH_SIZE}`);

		// Process vehicles in pages to avoid loading all into memory
		for (let page = 0; page < Math.ceil(totalVehicles / PAGE_SIZE); page++) {
			// Fetch one page of vehicles - no need to populate clientId for sync operations
			const vehicles = await db.default.models.Vehicle.find({
				companyId: companyId,
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] }
			})
				.select('_id license_plate last_rdw_sync apk_expiry datum_tenaamstelling companyId clientId')
				.skip(page * PAGE_SIZE)
				.limit(PAGE_SIZE)
				.lean();

			// Process this page in batches
			for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
				const batch = vehicles.slice(i, i + BATCH_SIZE);
				const overallProgress = page * PAGE_SIZE + i;
				const batchNumber = Math.floor(overallProgress / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(totalVehicles / BATCH_SIZE);

				console.log(`   Processing batch ${batchNumber}/${totalBatches}...`);

					// Process batch in parallel
				const batchResults = await Promise.allSettled(
					batch.map(async (vehicle) => {
						try {
							// Skip if no license plate
							if (!vehicle.license_plate) {
								console.log(`⚠️  Skipping vehicle with no license plate: ${vehicle._id}`);
								return { synced: false, reason: 'no_license_plate' };
							}

							// Validate Dutch license plate format
							if (!isValidDutchLicensePlate(vehicle.license_plate)) {
								console.log(`⚠️  Skipping invalid license plate: ${vehicle.license_plate}`);
								return { synced: false, reason: 'invalid_plate' };
							}

							// Skip if recently synced (within 4 weeks) to avoid unnecessary API calls
							if (vehicle.last_rdw_sync) {
								const fourWeeksAgo = new Date();
								fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

								if (vehicle.last_rdw_sync > fourWeeksAgo) {
									return { synced: false, reason: 'recently_synced' };
								}
							}

							// Fetch RDW data
							const rdwData = await fetchRDWVehicleData(vehicle.license_plate);

							if (!rdwData) {
								console.log(`⚠️  No RDW data found for license plate: ${vehicle.license_plate}`);
								return { synced: false, reason: 'no_data' };
							}

							// Determine which fields need updating
							const { updates, tenaamstellingChanged } = determineFieldsToUpdate(vehicle, rdwData);

							// Format the license plate and check if it needs updating
							const formattedLicensePlate = formatDutchLicensePlate(vehicle.license_plate);
							if (formattedLicensePlate !== vehicle.license_plate) {
								updates.license_plate = formattedLicensePlate;
							}

							// Create notification if tenaamstelling changed (before updating)
							await this.createTenaamstellingNotificationIfNeeded(vehicle, updates, tenaamstellingChanged);

							// Update vehicle if there are changes
							if (Object.keys(updates).length > 0) {
								updates.last_rdw_sync = new Date();

								await db.default.models.Vehicle.updateOne(
									{ _id: vehicle._id },
									{ $set: updates }
								);

								return { synced: true, updated: true };
							} else {
								// Even if no updates, update the sync date
								await db.default.models.Vehicle.updateOne(
									{ _id: vehicle._id },
									{ $set: { last_rdw_sync: new Date() } }
								);

								return { synced: true, updated: false };
							}
						} catch (error) {
							console.error(`❌ Error syncing vehicle ${vehicle.license_plate}:`, (error as Error).message);
							return { synced: false, reason: 'error', error: (error as Error).message };
						}
					})
				);

				// Count successful syncs in this batch
				batchResults.forEach((result) => {
					if (result.status === 'fulfilled' && result.value.synced && result.value.updated) {
						syncedCount++;
					}
				});

				// Delay between batches (except for the last batch)
				if (i + BATCH_SIZE < vehicles.length || page < Math.ceil(totalVehicles / PAGE_SIZE) - 1) {
					console.log(`   Waiting ${BATCH_DELAY}ms before next batch...`);
					await this.delay(BATCH_DELAY);
				}
			}
		}

		return syncedCount;
	}

	/**
	 * Update system sync date
	 */
	private async updateSystemSyncDate(): Promise<void> {
		const db = await import('../lib/db');
		try {
			// Find or create system document
			let systemDoc = await db.default.models.System.findOne();

			if (!systemDoc) {
				systemDoc = await db.default.models.System.create({
					lastRdwSync: new Date(),
				});
			} else {
				systemDoc.lastRdwSync = new Date();
				await systemDoc.save();
			}

			console.log(`📅 System sync date updated: ${systemDoc.lastRdwSync}`);
		} catch (error) {
			console.error('❌ Failed to update system sync date:', error);
		}
	}

	/**
	 * Check for APK expiry and create notifications
	 */
	async checkApkExpiryForAllCompanies(): Promise<{ notifications: number; errors: string[] }> {
		const db = await import('../lib/db');
		const { NotificationService } = await import('../lib/notificationService');
		console.log('🔄 Checking APK expiry for all companies...');
		const startTime = Date.now();
		const errors: string[] = [];
		let notificationsCreated = 0;

		try {
			// Find all companies
			const companies = await db.default.models.Company.find().select('_id name');

			for (const company of companies) {
				try {
					const created = await this.checkApkExpiryForCompany(company._id.toString());
					notificationsCreated += created;
				} catch (error) {
					const errorMsg = `Failed to check APK for company ${company.name}: ${(error as Error).message}`;
					console.error('❌', errorMsg);
					errors.push(errorMsg);
				}
			}

			// Update system weekly maintenance check date
			await this.updateWeeklyMaintenanceDate();

			const duration = Date.now() - startTime;
			console.log(`✅ APK expiry check completed in ${duration}ms`);
			console.log(`📊 Summary: ${notificationsCreated} notifications created, ${errors.length} errors`);

			return { notifications: notificationsCreated, errors };
		} catch (error) {
			console.error('❌ Unexpected error during APK expiry check:', error);
			errors.push(`Unexpected error: ${(error as Error).message}`);
			return { notifications: notificationsCreated, errors };
		}
	}

	/**
	 * Check APK expiry for a specific company and create notifications
	 * Optimized to use a single query with aggregation pipeline
	 */
	private async checkApkExpiryForCompany(companyId: string): Promise<number> {
		const db = await import('../lib/db');
		const { NotificationService } = await import('../lib/notificationService');

		let notificationsCreated = 0;
		const today = new Date();
		const thirtyDaysFromNow = new Date();
		thirtyDaysFromNow.setDate(today.getDate() + 30); // 30 days
		const twoYearsAgo = new Date();
		twoYearsAgo.setFullYear(today.getFullYear() - 2); // 2 years ago

		// First, get all client IDs that have APK notifications enabled
		// Include clients where apkNotificationsDisabled is false, null, or doesn't exist (default is enabled)
		const enabledClients = await db.default.models.Client.find({
			companyId: new mongoose.Types.ObjectId(companyId),
			deleted: { $ne: true },
			$or: [
				{ apkNotificationsDisabled: false },
				{ apkNotificationsDisabled: { $exists: false } },
				{ apkNotificationsDisabled: null }
			]
		}).select('_id');

		const enabledClientIds = enabledClients.map(c => c._id);

		// Use aggregation pipeline to:
		// 1. Filter vehicles with expired or expiring APK from clients with notifications enabled
		// 2. Separate into expired and expiring categories
		const result = await db.default.models.Vehicle.aggregate([
			{
				$match: {
					companyId: new mongoose.Types.ObjectId(companyId),
					deleted: { $ne: true },
					geexporteerd: { $ne: true },
					clientId: { $in: enabledClientIds }, // Only vehicles from clients with notifications enabled
					apkRemindersDismissed: { $ne: true },
					$or: [
						{ apkRemindersDisabledUntil: { $exists: false } },
						{ apkRemindersDisabledUntil: null },
						{ apkRemindersDisabledUntil: { $lt: today } }
					]
				}
			},
			{
				// Add category field based on expiry status
				$addFields: {
					category: {
						$cond: {
							if: {
								$and: [
									{ $lt: ['$apk_expiry', today] },
									{ $gte: ['$apk_expiry', twoYearsAgo] },
									{
										$or: [
											{ $eq: [{ $ifNull: ['$lastApkEmailSentForExpired', null] }, null] },
											{ $not: { $ifNull: ['$lastApkEmailSentForExpired', false] } }
										]
									}
								]
							},
							then: 'expired',
							else: {
								$cond: {
									if: {
										$and: [
											{ $gte: ['$apk_expiry', today] },
											{ $lte: ['$apk_expiry', thirtyDaysFromNow] },
											{
												$or: [
													{ $eq: [{ $ifNull: ['$lastApkEmailSentForExpiring', null] }, null] },
													{ $not: { $ifNull: ['$lastApkEmailSentForExpiring', false] } }
												]
											}
										]
									},
									then: 'expiring',
									else: null
								}
							}
						}
					}
				}
			},
			{
				// Filter out vehicles that don't match either category
				$match: {
					category: { $ne: null }
				}
			},
			{
				// Group by category
				$group: {
					_id: '$category',
					vehicleIds: { $push: '$_id' },
					count: { $sum: 1 }
				}
			}
		]);

		// Process results
		for (const group of result) {
			const vehicleIds = group.vehicleIds.map((id: mongoose.Types.ObjectId) => id.toString());

			if (group._id === 'expired' && vehicleIds.length > 0) {
				await NotificationService.createApkExpiredNotification(
					companyId,
					vehicleIds.length,
					vehicleIds
				);
				notificationsCreated++;
				console.log(`📢 Created expired APK notification for company ${companyId}: ${vehicleIds.length} vehicles`);
			} else if (group._id === 'expiring' && vehicleIds.length > 0) {
				await NotificationService.createApkExpiringNotification(
					companyId,
					vehicleIds.length,
					vehicleIds
				);
				notificationsCreated++;
			}
		}

		return notificationsCreated;
	}

	/**
	 * Sync only expired and expiring vehicles with RDW data (runs daily)
	 */
	async syncExpiredAndExpiringVehicles(): Promise<{ synced: number; errors: string[]; totalVehicles: number }> {
		const db = await import('../lib/db');
		const { fetchRDWVehicleData, isValidDutchLicensePlate, determineFieldsToUpdate, formatDutchLicensePlate } = await import('../lib/rdwService');
		const { NotificationService } = await import('../lib/notificationService');

		console.log('🚀 Starting daily RDW sync for expired/expiring vehicles...');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalSynced = 0;
		let totalVehiclesFound = 0;

		try {
			const today = new Date();
			const thirtyDaysFromNow = new Date();
			thirtyDaysFromNow.setDate(today.getDate() + 30); // 30 days
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(today.getFullYear() - 2); // 2 years ago

			// Find all vehicles with expired or expiring APK
			// Only select fields needed for sync - no population to reduce memory usage
			const criticalVehicles = await db.default.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				$or: [
					{
						// Expired APK (within last 2 years)
						apk_expiry: {
							$lt: today,
							$gte: twoYearsAgo
						}
					},
					{
						// Expiring within 30 days
						apk_expiry: {
							$gte: today,
							$lte: thirtyDaysFromNow
						}
					}
				]
			})
				.select('_id license_plate companyId last_rdw_sync apk_expiry clientId datum_tenaamstelling')
				.lean();

			totalVehiclesFound = criticalVehicles.length;
			console.log(`📊 Found ${totalVehiclesFound} vehicles with expired or expiring APK`);

			if (totalVehiclesFound === 0) {
				console.log('✅ No vehicles need syncing');
				return { synced: 0, errors: [], totalVehicles: 0 };
			}

			// Process vehicles in batches
			const BATCH_SIZE = 25;
			const BATCH_DELAY = 500; // 0.5 second delay between batches

			for (let i = 0; i < criticalVehicles.length; i += BATCH_SIZE) {
				const batch = criticalVehicles.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(criticalVehicles.length / BATCH_SIZE);

				console.log(`   Processing batch ${batchNumber}/${totalBatches} (${batch.length} vehicles)...`);

				// Process batch in parallel
				const batchResults = await Promise.allSettled(
					batch.map(async (vehicle) => {
						try {
							// Skip if no license plate
							if (!vehicle.license_plate) {
								console.log(`⚠️  Skipping vehicle with no license plate: ${vehicle._id}`);
								return { synced: false, reason: 'no_license_plate' };
							}

							// Validate Dutch license plate format
							if (!isValidDutchLicensePlate(vehicle.license_plate)) {
								console.log(`⚠️  Skipping invalid license plate: ${vehicle.license_plate}`);
								return { synced: false, reason: 'invalid_plate' };
							}

							// Fetch RDW data
							const rdwData = await fetchRDWVehicleData(vehicle.license_plate);

							if (!rdwData) {
								console.log(`⚠️  No RDW data found for license plate: ${vehicle.license_plate}`);
								return { synced: false, reason: 'no_data' };
							}

							// Determine which fields need updating
							const { updates, tenaamstellingChanged } = determineFieldsToUpdate(vehicle, rdwData);

							// Format the license plate and check if it needs updating
							const formattedLicensePlate = formatDutchLicensePlate(vehicle.license_plate);
							if (formattedLicensePlate !== vehicle.license_plate) {
								updates.license_plate = formattedLicensePlate;
							}

							// Create notification if tenaamstelling changed (before updating)
							await this.createTenaamstellingNotificationIfNeeded(vehicle, updates, tenaamstellingChanged);

							// Update vehicle if there are changes
							if (Object.keys(updates).length > 0) {
								updates.last_rdw_sync = new Date();

								await db.default.models.Vehicle.updateOne(
									{ _id: vehicle._id },
									{ $set: updates }
								);

								console.log(`✅ Updated ${vehicle.license_plate}: ${Object.keys(updates).join(', ')}`);
								return { synced: true, updated: true };
							} else {
								// Even if no updates, update the sync date
								await db.default.models.Vehicle.updateOne(
									{ _id: vehicle._id },
									{ $set: { last_rdw_sync: new Date() } }
								);

								return { synced: true, updated: false };
							}
						} catch (error) {
							const errorMsg = `Error syncing vehicle ${vehicle.license_plate}: ${(error as Error).message}`;
							console.error(`❌ ${errorMsg}`);
							errors.push(errorMsg);
							return { synced: false, reason: 'error', error: (error as Error).message };
						}
					})
				);

				// Count successful syncs in this batch
				batchResults.forEach((result) => {
					if (result.status === 'fulfilled' && result.value.synced) {
						totalSynced++;
					}
				});

				// Delay between batches (except for the last batch)
				if (i + BATCH_SIZE < criticalVehicles.length) {
					console.log(`   Waiting ${BATCH_DELAY}ms before next batch...`);
					await this.delay(BATCH_DELAY);
				}
			}

			const duration = Date.now() - startTime;
			console.log(`🎉 Daily expired/expiring vehicle sync completed in ${duration}ms`);
			console.log(`📊 Summary: ${totalSynced} vehicles synced, ${errors.length} errors`);

			return { synced: totalSynced, errors, totalVehicles: totalVehiclesFound };
		} catch (error) {
			console.error('❌ Unexpected error during daily expired/expiring vehicle sync:', error);
			errors.push(`Unexpected error: ${(error as Error).message}`);
			return { synced: totalSynced, errors, totalVehicles: totalVehiclesFound };
		}
	}

	/**
	 * Update weekly maintenance check date
	 */
	private async updateWeeklyMaintenanceDate(): Promise<void> {
		const db = await import('../lib/db');
		try {
			// Find or create system document
			let systemDoc = await db.default.models.System.findOne();

			if (!systemDoc) {
				systemDoc = await db.default.models.System.create({
					lastWeeklyMaintenanceCheck: new Date(),
				});
			} else {
				systemDoc.lastWeeklyMaintenanceCheck = new Date();
				await systemDoc.save();
			}

			console.log(`📅 Weekly maintenance date updated: ${systemDoc.lastWeeklyMaintenanceCheck}`);
		} catch (error) {
			console.error('❌ Failed to update weekly maintenance date:', error);
		}
	}

	/**
	 * Create tenaamstelling notification if changed
	 * Optimized to fetch client data only when needed
	 * Skip notification if client has apkNotificationsDisabled (applies to all vehicle notifications)
	 */
	private async createTenaamstellingNotificationIfNeeded(
		vehicle: any,
		updates: any,
		tenaamstellingChanged: boolean
	): Promise<void> {
		const db = await import('../lib/db');
		const { NotificationService } = await import('../lib/notificationService');

		if (!tenaamstellingChanged || !updates.datum_tenaamstelling) {
			return;
		}

		try {
			// Fetch client data to check notification settings and get name
			let clientName = 'Onbekende klant';
			let clientIdStr: string | undefined = undefined;

			if (vehicle.clientId) {
				const client = await db.default.models.Client.findById(vehicle.clientId).select('name apkNotificationsDisabled').lean();

				if (client) {
					// Skip notification if client has notifications disabled
					if (client.apkNotificationsDisabled === true) {
						console.log(`⏭️  Skipping tenaamstelling notification for ${vehicle.license_plate} - client has notifications disabled`);
						return;
					}

					clientName = client.name;
					clientIdStr = vehicle.clientId.toString();
				}
			}

			const formattedDate = new Date(updates.datum_tenaamstelling).toLocaleDateString('nl-NL', {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			});

			await NotificationService.createTenaamstellingChangedNotification(
				vehicle.companyId.toString(),
				vehicle.license_plate,
				clientName,
				formattedDate,
				vehicle._id.toString(),
				clientIdStr
			);

			// Mark that we've notified about this tenaamstelling date and reset dismissal
			updates.lastTenaamstellingNotified = new Date();
			updates.tenaamstellingNotificationDismissed = false;
		} catch (notificationError) {
			console.error(`❌ Failed to create tenaamstelling notification for ${vehicle.license_plate}:`, (notificationError as Error).message);
		}
	}

	/**
	 * Utility function to add delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Run sync manually (for testing or admin triggers)
	 */
	async runManualSync(): Promise<void> {
		console.log('🔧 Running manual RDW sync...');
		await this.syncAllCompaniesVehicles();
	}

	/**
	 * Run APK check manually (for testing or admin triggers)
	 */
	async runManualApkCheck(): Promise<void> {
		console.log('🔧 Running manual APK expiry check...');
		await this.checkApkExpiryForAllCompanies();
	}
}
