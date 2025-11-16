import mongoose from 'mongoose';

/**
 * ApkStatusService - Responsible for checking APK status and creating notifications
 * Separate from RdwSyncService which handles RDW API data fetching
 */
export class ApkStatusService {
	private static instance: ApkStatusService;

	private constructor() { }

	public static getInstance(): ApkStatusService {
		if (!ApkStatusService.instance) {
			ApkStatusService.instance = new ApkStatusService();
		}
		return ApkStatusService.instance;
	}

	/**
	 * Check for APK expiry and create notifications for all companies
	 */
	async checkApkExpiryForAllCompanies(): Promise<{ notifications: number; errors: string[] }> {
		const db = await import('../lib/db');
		console.log('🔄 Checking APK expiry status for all companies...');
		const startTime = Date.now();
		const errors: string[] = [];
		let notificationsCreated = 0;

		try {
			// Find all companies with APK notifications enabled
			const companies = await db.default.models.Company.find({
				'serviceModules.apkNotificationsEnabled': { $ne: false }
			}).select('_id name');

			console.log(`📊 Found ${companies.length} companies with APK notifications enabled`);

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

			// Update system weekly APK check date
			await this.updateApkCheckDate();

			const duration = Date.now() - startTime;
			console.log(`✅ APK expiry status check completed in ${duration}ms`);
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
	 * Uses pagination to prevent memory issues with large fleets
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

		// Configuration for pagination
		const CLIENT_BATCH_SIZE = 1000; // Process 1000 clients at a time
		const MAX_VEHICLE_IDS_PER_NOTIFICATION = 5000; // Limit vehicle IDs in notification metadata

		// First, count total clients to determine pagination
		const totalClients = await db.default.models.Client.countDocuments({
			companyId: new mongoose.Types.ObjectId(companyId),
			deleted: { $ne: true },
			apkNotificationsDisabled: { $ne: true }
		});

		if (totalClients === 0) {
			console.log(`📊 No clients with APK notifications enabled for company ${companyId}`);
			return 0;
		}

		console.log(`📊 Processing ${totalClients} clients in batches of ${CLIENT_BATCH_SIZE} for company ${companyId}`);

		// Accumulate counts and vehicle IDs across all batches
		let totalExpiredCount = 0;
		let totalExpiringCount = 0;
		const expiredVehicleIds: string[] = [];
		const expiringVehicleIds: string[] = [];

		// Process clients in batches to avoid loading all into memory
		for (let skip = 0; skip < totalClients; skip += CLIENT_BATCH_SIZE) {
			const batchNum = Math.floor(skip / CLIENT_BATCH_SIZE) + 1;
			const totalBatches = Math.ceil(totalClients / CLIENT_BATCH_SIZE);
			console.log(`   Processing client batch ${batchNum}/${totalBatches}...`);

			// Get batch of client IDs
			const enabledClientsBatch = await db.default.models.Client.find({
				companyId: new mongoose.Types.ObjectId(companyId),
				deleted: { $ne: true },
				apkNotificationsDisabled: { $ne: true }
			})
				.select('_id')
				.skip(skip)
				.limit(CLIENT_BATCH_SIZE)
				.lean();

			const enabledClientIds = enabledClientsBatch.map(c => c._id);

			if (enabledClientIds.length === 0) {
				continue;
			}

			// Use aggregation pipeline for this batch of clients
			const result = await db.default.models.Vehicle.aggregate([
				{
					$match: {
						companyId: new mongoose.Types.ObjectId(companyId),
						deleted: { $ne: true },
						geexporteerd: { $ne: true },
						clientId: { $in: enabledClientIds },
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
				},
				{
					// Limit vehicle IDs array to prevent memory issues
					$project: {
						_id: 1,
						count: 1,
						vehicleIds: { $slice: ['$vehicleIds', MAX_VEHICLE_IDS_PER_NOTIFICATION] }
					}
				}
			]);

			// Accumulate results from this batch
			for (const group of result) {
				if (group._id === 'expired') {
					totalExpiredCount += group.count;
					// Only add vehicle IDs if we haven't exceeded the limit
					if (expiredVehicleIds.length < MAX_VEHICLE_IDS_PER_NOTIFICATION) {
						const remainingSlots = MAX_VEHICLE_IDS_PER_NOTIFICATION - expiredVehicleIds.length;
						const idsToAdd = group.vehicleIds
							.slice(0, remainingSlots)
							.map((id: mongoose.Types.ObjectId) => id.toString());
						expiredVehicleIds.push(...idsToAdd);
					}
				} else if (group._id === 'expiring') {
					totalExpiringCount += group.count;
					// Only add vehicle IDs if we haven't exceeded the limit
					if (expiringVehicleIds.length < MAX_VEHICLE_IDS_PER_NOTIFICATION) {
						const remainingSlots = MAX_VEHICLE_IDS_PER_NOTIFICATION - expiringVehicleIds.length;
						const idsToAdd = group.vehicleIds
							.slice(0, remainingSlots)
							.map((id: mongoose.Types.ObjectId) => id.toString());
						expiringVehicleIds.push(...idsToAdd);
					}
				}
			}
		}

		// Create notifications with accumulated data
		if (totalExpiredCount > 0) {
			await NotificationService.createApkExpiredNotification(
				companyId,
				totalExpiredCount,
				expiredVehicleIds
			);
			notificationsCreated++;
			console.log(`📢 Created expired APK notification for company ${companyId}: ${totalExpiredCount} vehicles (${expiredVehicleIds.length} IDs in metadata)`);

			if (expiredVehicleIds.length < totalExpiredCount) {
				console.log(`   ⚠️  Note: ${totalExpiredCount - expiredVehicleIds.length} vehicle IDs omitted from notification metadata to prevent memory issues`);
			}
		}

		if (totalExpiringCount > 0) {
			await NotificationService.createApkExpiringNotification(
				companyId,
				totalExpiringCount,
				expiringVehicleIds
			);
			notificationsCreated++;
			console.log(`📢 Created expiring APK notification for company ${companyId}: ${totalExpiringCount} vehicles (${expiringVehicleIds.length} IDs in metadata)`);

			if (expiringVehicleIds.length < totalExpiringCount) {
				console.log(`   ⚠️  Note: ${totalExpiringCount - expiringVehicleIds.length} vehicle IDs omitted from notification metadata to prevent memory issues`);
			}
		}

		return notificationsCreated;
	}

	/**
	 * Update APK check date in system document
	 */
	private async updateApkCheckDate(): Promise<void> {
		const db = await import('../lib/db');
		try {
			let systemDoc = await db.default.models.System.findOne();

			if (!systemDoc) {
				systemDoc = await db.default.models.System.create({
					lastApkStatusCheck: new Date(),
				});
			} else {
				systemDoc.lastApkStatusCheck = new Date();
				await systemDoc.save();
			}

			console.log(`📅 APK status check date updated: ${systemDoc.lastApkStatusCheck}`);
		} catch (error) {
			console.error('❌ Failed to update APK status check date:', error);
		}
	}

	/**
	 * Run APK status check manually (for testing or admin triggers)
	 */
	async runManualCheck(): Promise<void> {
		console.log('🔧 Running manual APK status check...');
		await this.checkApkExpiryForAllCompanies();
	}
}
