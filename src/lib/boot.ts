// ABA Worker microservice initialization
// This file will be used to initialize background jobs and scheduled tasks
// for APK sync, RDW integration, and notification services

import { StatusUpdateScheduler } from '../services/StatusUpdateScheduler';
import { RdwSyncService } from '../services/RdwSyncService';
import { MaintenanceReminderService } from '../services/MaintenanceReminderService';
import db from './db';
import { config } from './config';

// Store interval and timeout references for cleanup
const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];

// Cleanup function to clear all intervals and timeouts
async function cleanup() {
	console.log('🧹 Cleaning up intervals and timeouts...');
	// Stop the scheduler
	const scheduler = StatusUpdateScheduler.getInstance();
	scheduler.stopScheduler();

	intervals.forEach(clearInterval);
	timeouts.forEach(clearTimeout);
	intervals.length = 0;
	timeouts.length = 0;
	console.log('✅ Cleanup completed');
}

// Add process termination handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGHUP', cleanup);

/**
 * Performs selective test syncs for individual services to verify they work correctly
 * Each service can be enabled/disabled independently via environment variables
 */
async function runTestSync(): Promise<void> {
	const testFlags = {
		statusUpdate: process.env.TEST_SYNC_STATUS_UPDATE === 'true',
		maintenance: process.env.TEST_SYNC_MAINTENANCE === 'true',
		rdw: process.env.TEST_SYNC_RDW === 'true'
	};

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

			// Get just one active company for testing
			const oneYearAgo = new Date();
			oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

			const testCompany = await db.models.Company.findOne({
				lastActiveAt: { $gte: oneYearAgo }
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

			// Get one year ago date for active company filter
			const rdwOneYearAgo = new Date();
			rdwOneYearAgo.setFullYear(rdwOneYearAgo.getFullYear() - 1);

			const rdwTestCompany = await db.models.Company.findOne({
				lastActiveAt: { $gte: rdwOneYearAgo }
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

export async function boot() {
	try {
		// Initialize database connection
		await db.connect();

		// Run test sync to verify all services are working
		await runTestSync();

		// Initialize all scheduled tasks
		const scheduler = StatusUpdateScheduler.getInstance();
		scheduler.startScheduler();

		console.log('🚀 ABA Worker microservice initialized with scheduled tasks');
	} catch (error) {
		console.error('❌ Failed to initialize ABA Worker:', error);
		throw error;
	}
}

