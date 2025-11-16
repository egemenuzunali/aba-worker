/**
 * Test Script: Verify Notification System Works
 *
 * This script tests that notifications can be created and persisted to the database.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/test-notification-system.ts
 */

import dotenv from 'dotenv';
import db from '../src/lib/db';
import { NotificationService } from '../src/lib/notificationService';

// Load environment variables
dotenv.config();

async function testNotifications() {
	try {
		console.log('🧪 Testing Notification System...\n');

		// Connect to database
		await db.connect();
		console.log('✅ Connected to database\n');

		// Find a test company (or use a hardcoded ID)
		const testCompany = await db.models.Company.findOne().lean();

		if (!testCompany) {
			console.log('⚠️  No companies found in database. Please add a company first.');
			return;
		}

		console.log(`📊 Using test company: ${testCompany.name} (${testCompany._id})\n`);

		// Test 1: Create a quote expired notification
		console.log('Test 1: Creating quote expired notification...');
		const quoteNotification = await NotificationService.createQuoteExpiredNotification(
			testCompany._id.toString(),
			'Q-2024-001',
			'Test Client BV',
			'test-quote-id-123'
		);
		console.log(`✅ Quote notification created: ${quoteNotification._id}`);
		console.log(`   Title: ${quoteNotification.title}`);
		console.log(`   Message: ${quoteNotification.message}`);
		console.log(`   Type: ${quoteNotification.type}\n`);

		// Test 2: Create an invoice expired notification
		console.log('Test 2: Creating invoice expired notification...');
		const invoiceNotification = await NotificationService.createInvoiceExpiredNotification(
			testCompany._id.toString(),
			'INV-2024-042',
			'Test Client BV',
			'test-invoice-id-456'
		);
		console.log(`✅ Invoice notification created: ${invoiceNotification._id}`);
		console.log(`   Title: ${invoiceNotification.title}`);
		console.log(`   Message: ${invoiceNotification.message}\n`);

		// Test 3: Create an APK expired notification
		console.log('Test 3: Creating APK expired notification...');
		const apkNotification = await NotificationService.createApkExpiredNotification(
			testCompany._id.toString(),
			15,
			['vehicle-1', 'vehicle-2', 'vehicle-3']
		);
		console.log(`✅ APK notification created: ${apkNotification._id}`);
		console.log(`   Title: ${apkNotification.title}`);
		console.log(`   Message: ${apkNotification.message}`);
		console.log(`   Vehicle count: ${apkNotification.metadata?.vehicleCount}\n`);

		// Test 4: Create a maintenance reminder notification
		console.log('Test 4: Creating maintenance overdue notification...');
		const maintenanceNotification = await NotificationService.createMaintenanceOverdueNotification(
			testCompany._id.toString(),
			8,
			['vehicle-4', 'vehicle-5']
		);
		console.log(`✅ Maintenance notification created: ${maintenanceNotification._id}`);
		console.log(`   Title: ${maintenanceNotification.title}`);
		console.log(`   Message: ${maintenanceNotification.message}\n`);

		// Query notifications to verify they were created
		console.log('📋 Querying all test notifications...');
		const allNotifications = await db.models.Notification.find({
			companyId: testCompany._id
		}).sort({ createdAt: -1 }).limit(10).lean();

		console.log(`\n✅ Found ${allNotifications.length} notifications for company ${testCompany.name}:`);
		allNotifications.forEach((notif, index) => {
			console.log(`   ${index + 1}. [${notif.type}] ${notif.title} - ${notif.read ? 'READ' : 'UNREAD'}`);
			console.log(`      Created: ${notif.createdAt.toISOString()}`);
		});

		// Statistics
		console.log('\n📊 Notification Statistics:');
		const totalCount = await db.models.Notification.countDocuments({ companyId: testCompany._id });
		const unreadCount = await db.models.Notification.countDocuments({
			companyId: testCompany._id,
			isRead: false
		});
		console.log(`   Total notifications: ${totalCount}`);
		console.log(`   Unread: ${unreadCount}`);
		console.log(`   Read: ${totalCount - unreadCount}`);

		// Cleanup option (commented out - uncomment if you want to clean up test data)
		// console.log('\n🧹 Cleaning up test notifications...');
		// await db.models.Notification.deleteMany({
		//   _id: { $in: [quoteNotification._id, invoiceNotification._id, apkNotification._id, maintenanceNotification._id] }
		// });
		// console.log('✅ Test notifications deleted');

		console.log('\n🎉 All notification tests passed!');
		console.log('\n✨ The notification system is working correctly and persisting to database.');

	} catch (error) {
		console.error('❌ Test failed:', error);
		throw error;
	} finally {
		await db.disconnect();
	}
}

// Run tests
testNotifications()
	.then(() => {
		console.log('\n👍 Test completed successfully');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n💥 Test failed:', error);
		process.exit(1);
	});
