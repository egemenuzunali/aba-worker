/**
 * Migration Script: Move expiry tracking from per-company to system-wide
 *
 * This script migrates the expiry check tracking from Company.serviceModules.lastExpiryCheckDate
 * to System.lastQuoteExpiryCheck, lastInvoiceExpiryCheck, lastPurchaseInvoiceExpiryCheck
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/migrate-expiry-tracking.ts
 *
 * Safety: This is a non-destructive migration. The old Company field is kept for rollback.
 */

import dotenv from 'dotenv';
import db from '../src/lib/db';

// Load environment variables
dotenv.config();

async function migrate() {
	try {
		console.log('🚀 Starting expiry tracking migration...');
		console.log('📊 This will migrate from per-company to system-wide tracking');

		// Connect to database
		await db.connect();
		console.log('✅ Connected to database');

		// Find the earliest lastExpiryCheckDate across all companies
		// Use this as the initial system-wide date to ensure no documents are missed
		const companiesWithDates = await db.models.Company.find({
			'serviceModules.lastExpiryCheckDate': { $exists: true }
		})
			.sort({ 'serviceModules.lastExpiryCheckDate': 1 })
			.limit(1)
			.lean();

		const earliestDate = companiesWithDates[0]?.serviceModules?.lastExpiryCheckDate
			? new Date(companiesWithDates[0].serviceModules.lastExpiryCheckDate)
			: new Date('2020-01-01');

		console.log(`📅 Earliest company check date found: ${earliestDate.toISOString()}`);
		console.log('   Using this as initial system-wide date to prevent missing any documents');

		// Check if System document exists
		let systemDoc = await db.models.System.findOne();

		if (!systemDoc) {
			console.log('📝 Creating new System document...');
			systemDoc = await db.models.System.create({
				lastQuoteExpiryCheck: earliestDate,
				lastInvoiceExpiryCheck: earliestDate,
				lastPurchaseInvoiceExpiryCheck: earliestDate,
			});
			console.log('✅ System document created');
		} else {
			console.log('📝 Updating existing System document...');

			// Only set if not already set (to avoid overwriting if migration run multiple times)
			const updates: any = {};

			if (!systemDoc.lastQuoteExpiryCheck) {
				updates.lastQuoteExpiryCheck = earliestDate;
			}
			if (!systemDoc.lastInvoiceExpiryCheck) {
				updates.lastInvoiceExpiryCheck = earliestDate;
			}
			if (!systemDoc.lastPurchaseInvoiceExpiryCheck) {
				updates.lastPurchaseInvoiceExpiryCheck = earliestDate;
			}

			if (Object.keys(updates).length > 0) {
				await db.models.System.updateOne({}, { $set: updates });
				console.log('✅ System document updated with new fields');
			} else {
				console.log('ℹ️  System document already has expiry check dates - no update needed');
			}
		}

		// Display final state
		const updatedSystemDoc = await db.models.System.findOne();
		console.log('\n📋 System-wide expiry check dates:');
		console.log(`   Quote expiry:            ${updatedSystemDoc?.lastQuoteExpiryCheck?.toISOString() || 'Not set'}`);
		console.log(`   Invoice expiry:          ${updatedSystemDoc?.lastInvoiceExpiryCheck?.toISOString() || 'Not set'}`);
		console.log(`   Purchase invoice expiry: ${updatedSystemDoc?.lastPurchaseInvoiceExpiryCheck?.toISOString() || 'Not set'}`);

		// Count companies with the old field for reference
		const companiesWithOldField = await db.models.Company.countDocuments({
			'serviceModules.lastExpiryCheckDate': { $exists: true }
		});
		console.log(`\nℹ️  ${companiesWithOldField} companies still have the old lastExpiryCheckDate field (kept for rollback)`);

		console.log('\n✅ Migration completed successfully!');
		console.log('\nNext steps:');
		console.log('1. Deploy the updated code');
		console.log('2. Monitor the first few runs to ensure system-wide tracking works correctly');
		console.log('3. After 1-2 weeks of stable operation, you can remove Company.serviceModules.lastExpiryCheckDate');

	} catch (error) {
		console.error('❌ Migration failed:', error);
		throw error;
	} finally {
		await db.disconnect();
		console.log('👋 Disconnected from database');
	}
}

// Run migration
migrate()
	.then(() => {
		console.log('\n🎉 All done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('\n💥 Migration failed:', error);
		process.exit(1);
	});
