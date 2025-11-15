// ABA Worker test sync functionality
// This file contains test sync operations for verifying service functionality

import { StatusUpdateScheduler } from '../services/StatusUpdateScheduler';
import { RdwSyncService } from '../services/RdwSyncService';
import { MaintenanceReminderService } from '../services/MaintenanceReminderService';
import db from './db';

/**
 * Performs selective test syncs for individual services to verify they work correctly
 * Each service can be enabled/disabled independently via environment variables
 */
export async function runTestSync(): Promise<void> {
	const testFlags = {
		statusUpdate: process.env.TEST_SYNC_STATUS_UPDATE === 'true',
		maintenance: process.env.TEST_SYNC_MAINTENANCE === 'true',
		rdw: process.env.TEST_SYNC_RDW === 'true',
	};

	console.log('testFlags', testFlags);

	// Check if any test syncs are enabled
	const hasAnyTestSync = Object.values(testFlags).some(enabled => enabled);

	if (!hasAnyTestSync) {
		console.log('⏭️  Skipping all test syncs (no TEST_SYNC_* flags enabled)');
		return;
	}

	console.log('🧪 Starting selective test syncs...');
	console.log(`   Status Update: ${testFlags.statusUpdate ? '✅' : '❌'}`);
	console.log(`   Maintenance: ${testFlags.maintenance ? '✅' : '❌'}`);
	console.log(`   RDW Sync: ${testFlags.rdw ? '✅' : '❌'}`);

	try {
		let completedTests = 0;

		// Test 1: Status Update Scheduler - Run a small manual update check
		if (testFlags.statusUpdate) {
			console.log('📅 Testing StatusUpdateScheduler...');
			const scheduler = StatusUpdateScheduler.getInstance();
			await scheduler.runManualUpdate();
			console.log('✅ StatusUpdateScheduler test completed');
			completedTests++;
		}

		// Test 2: Maintenance Reminder Service - Check for one company (limited test)
		if (testFlags.maintenance) {
			console.log('🔧 Testing MaintenanceReminderService...');
			const maintenanceService = MaintenanceReminderService.getInstance();

			// Get just one company with APK enabled for testing
			const testCompany = await db.models.Company.findOne({
				'serviceModules.apkEnabled': { $ne: false }
			}).select('_id name').lean();

			if (testCompany) {
				console.log(`   Testing with company: ${testCompany.name}`);
				await maintenanceService.checkCompanyMaintenanceReminders(testCompany._id.toString());
				console.log('✅ MaintenanceReminderService test completed');
				completedTests++;
			} else {
				console.log('⚠️  No active companies found for maintenance test, skipping...');
			}
		}

		// Test 3: RDW Sync Service - Test with one company (limited test)
		if (testFlags.rdw) {
			console.log('🚗 Testing RdwSyncService...');
			const rdwService = RdwSyncService.getInstance();

			// Get one company with RDW sync enabled for testing
			const rdwTestCompany = await db.models.Company.findOne({
				'serviceModules.rdwSyncEnabled': { $ne: false }
			}).select('_id name').lean();

			if (rdwTestCompany) {
				console.log(`   Testing RDW sync with company: ${rdwTestCompany.name}`);
				const syncedVehicles = await rdwService.syncCompanyVehicles(rdwTestCompany._id.toString());
				console.log(`✅ RdwSyncService test completed - synced ${syncedVehicles} vehicles`);
				completedTests++;
			} else {
				console.log('⚠️  No active companies found for RDW test, skipping...');
			}
		}

		console.log(`🎉 Completed ${completedTests} service test(s) successfully!`);

	} catch (error) {
		console.error('❌ Test sync failed:', error);
		// Don't throw error - test sync failure shouldn't prevent startup
		console.log('⚠️  Continuing with startup despite test sync failure...');
	}
}
