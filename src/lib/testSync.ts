// ABA Worker test sync functionality
// This file contains test sync operations for verifying service functionality

import { StatusUpdateScheduler } from '../services/StatusUpdateScheduler';
import { RdwSyncService } from '../services/RdwSyncService';
import { ApkStatusService } from '../services/ApkStatusService';
import { MaintenanceReminderService } from '../services/MaintenanceReminderService';
import { QuarterlyReportService } from '../services/QuarterlyReportService';
import { MonthlyInsightsService } from '../services/MonthlyInsightsService';
import db from './db';

/**
 * Performs selective test syncs for individual services to verify they work correctly
 * Each service can be enabled/disabled independently via environment variables
 *
 * Environment Variables:
 * - TEST_SYNC_STATUS_UPDATE=true: Enable document expiry check test
 * - TEST_SYNC_APK_STATUS=true: Enable APK status check test (notifications only, no RDW sync)
 * - TEST_SYNC_MAINTENANCE=true: Enable maintenance reminder test
 * - TEST_SYNC_RDW=true: Enable RDW sync test
 * - TEST_SYNC_QUARTERLY_REPORT=true: Enable quarterly report email test
 * - TEST_SYNC_MONTHLY_INSIGHTS=true: Enable monthly insights email test
 * - TEST_SYNC_COMPANY_ID=<company_id>: Specify company ID for testing (optional)
 */
export async function runTestSync(): Promise<void> {
	const testFlags = {
		statusUpdate: process.env.TEST_SYNC_STATUS_UPDATE === 'true',
		apkStatus: process.env.TEST_SYNC_APK_STATUS === 'true',
		maintenance: process.env.TEST_SYNC_MAINTENANCE === 'true',
		rdw: process.env.TEST_SYNC_RDW === 'true',
		quarterlyReport: process.env.TEST_SYNC_QUARTERLY_REPORT === 'true',
		monthlyInsights: process.env.TEST_SYNC_MONTHLY_INSIGHTS === 'true',
	};

	// Get test company ID from environment
	const testCompanyId = process.env.TEST_SYNC_COMPANY_ID;

	console.log('testFlags', testFlags);
	if (testCompanyId) {
		console.log(`Test Company ID: ${testCompanyId}`);
	}

	// Check if any test syncs are enabled
	const hasAnyTestSync = Object.values(testFlags).some(enabled => enabled);

	if (!hasAnyTestSync) {
		console.log('⏭️  Skipping all test syncs (no TEST_SYNC_* flags enabled)');
		return;
	}

	console.log('🧪 Starting selective test syncs...');
	console.log(`   Document Expiry Check: ${testFlags.statusUpdate ? '✅' : '❌'}`);
	console.log(`   APK Status Check: ${testFlags.apkStatus ? '✅' : '❌'}`);
	console.log(`   Maintenance: ${testFlags.maintenance ? '✅' : '❌'}`);
	console.log(`   RDW Sync: ${testFlags.rdw ? '✅' : '❌'}`);
	console.log(`   Quarterly Report: ${testFlags.quarterlyReport ? '✅' : '❌'}`);
	console.log(`   Monthly Insights: ${testFlags.monthlyInsights ? '✅' : '❌'}`);

	try {
		let completedTests = 0;

		// Test 1: Document Expiry Check - Run a manual document expiry update
		if (testFlags.statusUpdate) {
			console.log('📅 Testing Document Expiry Check (StatusUpdateScheduler)...');
			const scheduler = StatusUpdateScheduler.getInstance();
			await scheduler.runManualUpdate();
			console.log('✅ Document expiry check test completed');
			completedTests++;
		}

		// Test 2: APK Status Check - Check APK expiry status and create notifications (no RDW sync)
		if (testFlags.apkStatus) {
			console.log('🚗 Testing APK Status Check (ApkStatusService)...');
			const apkStatusService = ApkStatusService.getInstance();
			await apkStatusService.checkApkExpiryForAllCompanies();
			console.log('✅ APK status check test completed');
			completedTests++;
		}

		// Test 3: Maintenance Reminder Service - Check for one company (limited test)
		if (testFlags.maintenance) {
			console.log('🔧 Testing MaintenanceReminderService...');
			const maintenanceService = MaintenanceReminderService.getInstance();

			let testCompany = null;

			if (testCompanyId) {
				// Use specified company if provided
				testCompany = await db.models.Company.findById(testCompanyId).select('_id name').lean();
				if (testCompany) {
					// Validate that the company has APK enabled
					const fullCompany = await db.models.Company.findById(testCompanyId).select('serviceModules');
					if (fullCompany?.serviceModules?.apkEnabled === false) {
						console.log(`⚠️  Specified company ${testCompany.name} has APK disabled, skipping maintenance test...`);
						testCompany = null;
					}
				} else {
					console.log(`⚠️  Specified company ID ${testCompanyId} not found, falling back to automatic selection...`);
				}
			}

			// Fallback to automatic selection if no valid company specified
			if (!testCompany) {
				// Get companies with APK enabled, then filter by size constraints
				const candidateCompanies = await db.models.Company.find({
					'serviceModules.apkEnabled': { $ne: false }
				}).select('_id name').lean();

				for (const company of candidateCompanies) {
					const [invoiceCount, vehicleCount] = await Promise.all([
						db.models.Invoice.countDocuments({ companyId: company._id, deleted: { $ne: true } }),
						db.models.Vehicle.countDocuments({ companyId: company._id, deleted: { $ne: true } })
					]);

					if (invoiceCount < 50 && vehicleCount < 50) {
						testCompany = company;
						break;
					}
				}
			}

			if (testCompany) {
				console.log(`   Testing with company: ${testCompany.name} (${testCompany._id})`);
				await maintenanceService.checkCompanyMaintenanceReminders(testCompany._id.toString());
				console.log('✅ MaintenanceReminderService test completed');
				completedTests++;
			} else {
				console.log('⚠️  No suitable companies found for maintenance test, skipping...');
			}
		}

		// Test 4: RDW Sync Service - Test with one company (limited test)
		if (testFlags.rdw) {
			console.log('🚗 Testing RdwSyncService...');
			const rdwService = RdwSyncService.getInstance();

			let rdwTestCompany = null;

			if (testCompanyId) {
				// Use specified company if provided
				rdwTestCompany = await db.models.Company.findById(testCompanyId).select('_id name').lean();
				if (rdwTestCompany) {
					// Validate that the company has RDW sync enabled
					const fullCompany = await db.models.Company.findById(testCompanyId).select('serviceModules');
					if (fullCompany?.serviceModules?.rdwSyncEnabled === false) {
						console.log(`⚠️  Specified company ${rdwTestCompany.name} has RDW sync disabled, skipping RDW test...`);
						rdwTestCompany = null;
					}
				} else {
					console.log(`⚠️  Specified company ID ${testCompanyId} not found, falling back to automatic selection...`);
				}
			}

			// Fallback to automatic selection if no valid company specified
			if (!rdwTestCompany) {
				// Get companies with RDW sync enabled, then filter by size constraints
				const candidateCompanies = await db.models.Company.find({
					'serviceModules.rdwSyncEnabled': { $ne: false }
				}).select('_id name').lean();

				for (const company of candidateCompanies) {
					const [invoiceCount, vehicleCount] = await Promise.all([
						db.models.Invoice.countDocuments({ companyId: company._id, deleted: { $ne: true } }),
						db.models.Vehicle.countDocuments({ companyId: company._id, deleted: { $ne: true } })
					]);

					if (invoiceCount < 50 && vehicleCount < 50) {
						rdwTestCompany = company;
						break;
					}
				}
			}

			if (rdwTestCompany) {
				console.log(`   Testing RDW sync with company: ${rdwTestCompany.name} (${rdwTestCompany._id})`);
				const syncedVehicles = await rdwService.syncCompanyVehicles(rdwTestCompany._id.toString());
				console.log(`✅ RdwSyncService test completed - synced ${syncedVehicles} vehicles`);
				completedTests++;
			} else {
				console.log('⚠️  No suitable companies found for RDW test, skipping...');
			}
		}

		// Test 5: Quarterly Report - Send quarterly report email for a specific company
		if (testFlags.quarterlyReport) {
			console.log('📊 Testing QuarterlyReportService...');
			const quarterlyService = QuarterlyReportService.getInstance();

			if (testCompanyId) {
				const company = await db.models.Company.findById(testCompanyId).select('_id name serviceModules').lean();
				if (company) {
					if (company.serviceModules?.quarterlyReportEnabled === false) {
						console.log(`⚠️  Company ${company.name} has quarterly reports disabled, skipping...`);
					} else {
						console.log(`   Sending quarterly report to company: ${company.name} (${company._id})`);
						await quarterlyService.sendReportForCompany(testCompanyId);
						console.log('✅ QuarterlyReportService test completed');
						completedTests++;
					}
				} else {
					console.log(`⚠️  Company ID ${testCompanyId} not found, skipping quarterly report test...`);
				}
			} else {
				console.log('⚠️  TEST_SYNC_COMPANY_ID required for quarterly report test, skipping...');
			}
		}

		// Test 6: Monthly Insights - Send monthly insights email for a specific company
		if (testFlags.monthlyInsights) {
			console.log('📈 Testing MonthlyInsightsService...');
			const monthlyService = MonthlyInsightsService.getInstance();

			if (testCompanyId) {
				const company = await db.models.Company.findById(testCompanyId).select('_id name serviceModules').lean();
				if (company) {
					if (company.serviceModules?.monthlyInsightsEnabled === false) {
						console.log(`⚠️  Company ${company.name} has monthly insights disabled, skipping...`);
					} else {
						console.log(`   Sending monthly insights to company: ${company.name} (${company._id})`);
						await monthlyService.sendInsightsForCompany(testCompanyId);
						console.log('✅ MonthlyInsightsService test completed');
						completedTests++;
					}
				} else {
					console.log(`⚠️  Company ID ${testCompanyId} not found, skipping monthly insights test...`);
				}
			} else {
				console.log('⚠️  TEST_SYNC_COMPANY_ID required for monthly insights test, skipping...');
			}
		}

		console.log(`🎉 Completed ${completedTests} service test(s) successfully!`);

	} catch (error) {
		console.error('❌ Test sync failed:', error);
		// Don't throw error - test sync failure shouldn't prevent startup
		console.log('⚠️  Continuing with startup despite test sync failure...');
	}
}
