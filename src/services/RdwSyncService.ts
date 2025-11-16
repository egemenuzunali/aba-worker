// TODO: Import when models are available
// import { models } from '../models';
// import { fetchRDWVehicleData, isValidDutchLicensePlate, determineFieldsToUpdate, formatDutchLicensePlate } from '../lib/rdwService';
// import { NotificationService } from '../lib/notificationService';
import mongoose from 'mongoose';
import { logger } from '../lib/logger';

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
	 *
	 * PERFORMANCE NOTE: At 50,000+ vehicles, this sync will exceed RDW API rate limits (10,000 calls/day).
	 * When reaching 50k vehicles, implement sharded sync across 3 days:
	 * - Day 1: Sync vehicles with ID % 3 === 0 (~16,667 vehicles)
	 * - Day 2: Sync vehicles with ID % 3 === 1 (~16,667 vehicles)
	 * - Day 3: Sync vehicles with ID % 3 === 2 (~16,667 vehicles)
	 * This spreads the load to ~8,333 API calls per day (with 4-week skip rule).
	 * Run shards on Wed/Thu/Fri to avoid overlapping with daily sync (Mon-Sun: ~7,500 calls).
	 */
	async syncAllCompaniesVehicles(force = false): Promise<{ synced: number; errors: string[]; companies: number }> {
		const db = await import('../lib/db');
		logger.info('Starting RDW vehicle sync for all active companies');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalSynced = 0;
		let companiesProcessed = 0;

		try {
			// Check if it's been 3 months since last sync (unless forced)
			if (!force) {
				const systemDoc = await db.default.models.System.findOne();
				if (systemDoc?.lastRdwSync) {
					const threeMonthsAgo = new Date();
					threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90); // 3 months = ~90 days

					if (systemDoc.lastRdwSync > threeMonthsAgo) {
						logger.info('Skipping RDW sync - last sync was less than 3 months ago', {
							lastSync: systemDoc.lastRdwSync.toISOString()
						});
						return { synced: 0, errors: [], companies: 0 };
					}
				}
			}

			// Find all companies with RDW sync enabled
			const activeCompanies = await db.default.models.Company.find({
				'serviceModules.rdwSyncEnabled': { $ne: false }
			}).select('_id name');

			logger.info(`Found ${activeCompanies.length} active companies`);

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

				// Process results and track company sync summary
				let batchSynced = 0;
				let batchErrors = 0;

				results.forEach((result) => {
					if (result.status === 'fulfilled') {
						totalSynced += result.value.syncedCount;
						companiesProcessed++;
						batchSynced += result.value.syncedCount;
					} else {
						const errorMsg = `Failed to sync vehicles for company: ${result.reason}`;
						logger.error(errorMsg);
						errors.push(errorMsg);
						batchErrors++;
					}
				});

				logger.debug(`Company batch processed: ${batchSynced} vehicles synced, ${batchErrors} companies failed`);
			}

			// Update system sync date
			await this.updateSystemSyncDate();

			const duration = Date.now() - startTime;
			logger.serviceComplete('RDW full sync', duration, {
				total: totalSynced,
				successful: totalSynced,
				failed: errors.length,
				skipped: 0,
				duration
			});

			return { synced: totalSynced, errors, companies: companiesProcessed };
		} catch (error) {
			logger.error('Unexpected error during RDW sync', { error: (error as Error).message });
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
		const PAGE_SIZE = 500; // Fetch vehicles in pages to avoid memory issues

		// Get total count first
		const totalVehicles = await db.default.models.Vehicle.countDocuments({
			companyId: companyId,
			deleted: { $ne: true },
			license_plate: { $exists: true, $nin: [null, ''] }
		});

		// Adaptive batch sizing and delays based on fleet size to prevent API rate limiting
		const BATCH_SIZE = totalVehicles > 10000 ? 10 :
		                    totalVehicles > 5000  ? 15 :
		                    totalVehicles > 1000  ? 20 : 25;

		const BATCH_DELAY = totalVehicles > 10000 ? 2000 :
		                    totalVehicles > 5000  ? 1500 :
		                    totalVehicles > 1000  ? 1000 : 500;

		logger.debug(`Processing company vehicles`, {
			companyId,
			totalVehicles,
			pageSize: PAGE_SIZE,
			batchSize: BATCH_SIZE,
			batchDelay: BATCH_DELAY
		});

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

				// Track batch statistics for summary logging
				let batchProcessed = 0;
				let batchUpdated = 0;
				let batchSkipped = 0;
				let batchErrors = 0;
				const batchErrorDetails: string[] = [];

				// Process batch in parallel
				const batchResults = await Promise.allSettled(
					batch.map(async (vehicle) => {
						try {
							batchProcessed++;

							// Skip if no license plate
							if (!vehicle.license_plate) {
								batchSkipped++;
								return { synced: false, reason: 'no_license_plate' };
							}

							// Validate Dutch license plate format
							if (!isValidDutchLicensePlate(vehicle.license_plate)) {
								batchSkipped++;
								return { synced: false, reason: 'invalid_plate' };
							}

							// Skip if recently synced (within 4 weeks) to avoid unnecessary API calls
							if (vehicle.last_rdw_sync) {
								const fourWeeksAgo = new Date();
								fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

								if (vehicle.last_rdw_sync > fourWeeksAgo) {
									batchSkipped++;
									return { synced: false, reason: 'recently_synced' };
								}
							}

							// Fetch RDW data
							const rdwData = await fetchRDWVehicleData(vehicle.license_plate);

							if (!rdwData) {
								batchSkipped++;
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

								batchUpdated++;
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
							batchErrors++;
							const errorMsg = `Error syncing vehicle ${vehicle.license_plate}: ${(error as Error).message}`;
							batchErrorDetails.push(errorMsg);
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

				// Log batch progress for large operations
				logger.batchProgress('RDW vehicle sync', overallProgress + batch.length, totalVehicles, BATCH_SIZE);

				// Log batch summary if there were errors or significant activity
				if (batchErrors > 0 || batchUpdated > 0) {
					logger.summary(`RDW batch ${batchNumber}/${totalBatches}`, {
						total: batch.length,
						successful: batchUpdated,
						failed: batchErrors,
						skipped: batchSkipped,
						errors: batchErrors > 0 ? batchErrorDetails : undefined
					});
				}

				// Delay between batches (except for the last batch)
				if (i + BATCH_SIZE < vehicles.length || page < Math.ceil(totalVehicles / PAGE_SIZE) - 1) {
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

			logger.debug('System sync date updated', { lastRdwSync: systemDoc.lastRdwSync.toISOString() });
		} catch (error) {
			logger.error('Failed to update system sync date', { error: (error as Error).message });
		}
	}


	/**
	 * Sync only expired and expiring vehicles with RDW data (runs daily)
	 *
	 * Syncs vehicles within a rolling 160-day window:
	 * - Expired within last 80 days (likely getting renewed soon)
	 * - Expiring within next 80 days (notification window)
	 *
	 * PERFORMANCE NOTE: This sync is designed to handle fleets up to ~200,000 vehicles safely.
	 * With a typical APK cycle of 1 year, the 160-day window contains ~4% of fleet.
	 * Examples:
	 * - 10,000 vehicles: ~400 calls/day
	 * - 50,000 vehicles: ~2,000 calls/day
	 * - 200,000 vehicles: ~8,000 calls/day (under 10k RDW API limit)
	 */
	async syncExpiredAndExpiringVehicles(): Promise<{ synced: number; errors: string[]; totalVehicles: number }> {
		const db = await import('../lib/db');
		const { fetchRDWVehicleData, isValidDutchLicensePlate, determineFieldsToUpdate, formatDutchLicensePlate } = await import('../lib/rdwService');
		const { NotificationService } = await import('../lib/notificationService');

		logger.info('Starting daily RDW sync for expired/expiring vehicles');
		const startTime = Date.now();
		const errors: string[] = [];
		let totalSynced = 0;
		let totalVehiclesFound = 0;

		try {
			const today = new Date();
			const eightyDaysFromNow = new Date();
			eightyDaysFromNow.setDate(today.getDate() + 80); // Future: expiring within 80 days
			const eightyDaysAgo = new Date();
			eightyDaysAgo.setDate(today.getDate() - 80); // Past: expired within last 80 days

			// Find ONLY vehicles with APK expired/expiring within 80-day window (past or future)
			// This creates a rolling 160-day window (-80 to +80 days from today)
			// Vehicles outside this window are excluded - they will be caught by the
			// full sync (every 3 months) which updates all vehicle data periodically
			// Only select fields needed for sync - no population to reduce memory usage
			const criticalVehicles = await db.default.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: eightyDaysAgo,  // Expired within last 80 days (likely getting renewed)
					$lte: eightyDaysFromNow  // Expiring within next 80 days (notification window)
				}
			})
				.select('_id license_plate companyId last_rdw_sync apk_expiry clientId datum_tenaamstelling')
				.lean();

			totalVehiclesFound = criticalVehicles.length;
			logger.info(`Found ${totalVehiclesFound} vehicles with expired or expiring APK`);

			if (totalVehiclesFound === 0) {
				logger.debug('No vehicles need syncing');
				return { synced: 0, errors: [], totalVehicles: 0 };
			}

			// Adaptive batch sizing based on number of critical vehicles to prevent API rate limiting
			const BATCH_SIZE = totalVehiclesFound > 2000 ? 10 :
			                    totalVehiclesFound > 1000 ? 15 :
			                    totalVehiclesFound > 500  ? 20 : 25;

			const BATCH_DELAY = totalVehiclesFound > 2000 ? 2000 :
			                    totalVehiclesFound > 1000 ? 1500 :
			                    totalVehiclesFound > 500  ? 1000 : 500;

			logger.debug(`Using adaptive batching for critical vehicles`, {
				batchSize: BATCH_SIZE,
				batchDelay: BATCH_DELAY,
				totalVehicles: totalVehiclesFound
			});

			for (let i = 0; i < criticalVehicles.length; i += BATCH_SIZE) {
				const batch = criticalVehicles.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(criticalVehicles.length / BATCH_SIZE);

				// Track batch statistics for summary logging
				let batchUpdated = 0;
				let batchSkipped = 0;
				let batchErrors = 0;
				const batchErrorDetails: string[] = [];

				// Process batch in parallel
				const batchResults = await Promise.allSettled(
					batch.map(async (vehicle) => {
						try {
							// Skip if no license plate
							if (!vehicle.license_plate) {
								batchSkipped++;
								return { synced: false, reason: 'no_license_plate' };
							}

							// Validate Dutch license plate format
							if (!isValidDutchLicensePlate(vehicle.license_plate)) {
								batchSkipped++;
								return { synced: false, reason: 'invalid_plate' };
							}

							// Fetch RDW data
							const rdwData = await fetchRDWVehicleData(vehicle.license_plate);

							if (!rdwData) {
								batchSkipped++;
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

								batchUpdated++;
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
							batchErrors++;
							const errorMsg = `Error syncing vehicle ${vehicle.license_plate}: ${(error as Error).message}`;
							batchErrorDetails.push(errorMsg);
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

				// Log batch progress for large operations
				logger.batchProgress('RDW critical vehicle sync', i + batch.length, totalVehiclesFound, BATCH_SIZE);

				// Log batch summary if there were errors or significant activity
				if (batchErrors > 0 || batchUpdated > 0) {
					logger.summary(`RDW critical batch ${batchNumber}/${totalBatches}`, {
						total: batch.length,
						successful: batchUpdated,
						failed: batchErrors,
						skipped: batchSkipped,
						errors: batchErrors > 0 ? batchErrorDetails : undefined
					});
				}

				// Delay between batches (except for the last batch)
				if (i + BATCH_SIZE < criticalVehicles.length) {
					await this.delay(BATCH_DELAY);
				}
			}

			const duration = Date.now() - startTime;
			logger.serviceComplete('RDW daily critical sync', duration, {
				total: totalVehiclesFound,
				successful: totalSynced,
				failed: errors.length,
				skipped: 0,
				duration
			});

			return { synced: totalSynced, errors, totalVehicles: totalVehiclesFound };
		} catch (error) {
			logger.error('Unexpected error during daily expired/expiring vehicle sync', { error: (error as Error).message });
			errors.push(`Unexpected error: ${(error as Error).message}`);
			return { synced: totalSynced, errors, totalVehicles: totalVehiclesFound };
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
						logger.debug(`Skipping tenaamstelling notification for ${vehicle.license_plate} - client has notifications disabled`);
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
			logger.error(`Failed to create tenaamstelling notification for ${vehicle.license_plate}`, {
				error: (notificationError as Error).message,
				licensePlate: vehicle.license_plate
			});
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
		logger.info('Running manual RDW sync');
		await this.syncAllCompaniesVehicles();
	}
}
