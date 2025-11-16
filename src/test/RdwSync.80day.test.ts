import mongoose from 'mongoose';
import { RdwSyncService } from '../services/RdwSyncService';
import { ApkStatusService } from '../services/ApkStatusService';
import db from '../lib/db';

describe('RdwSyncService - 80-Day Window Logic', () => {
	let rdwService: RdwSyncService;
	let apkService: ApkStatusService;

	beforeAll(async () => {
		rdwService = RdwSyncService.getInstance();
		apkService = ApkStatusService.getInstance();
	});

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = mongoose.connection.collections;
		for (const key in collections) {
			await collections[key].deleteMany({});
		}
	});

	describe('syncExpiredAndExpiringVehicles - 80-Day Window', () => {
		it('should sync vehicles expired within last 80 days', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const today = new Date();
			const seventyDaysAgo = new Date();
			seventyDaysAgo.setDate(today.getDate() - 70); // Within 80-day window

			// Create vehicle expired 70 days ago (should be included)
			await db.models.Vehicle.create({
				license_plate: 'AA-BB-01',
				companyId: company._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: seventyDaysAgo,
				deleted: false
			});

			// Get list of vehicles that would be synced
			const vehicles = await db.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000),
					$lte: new Date(today.getTime() + 80 * 24 * 60 * 60 * 1000)
				}
			});

			// Vehicle should be in the sync list
			expect(vehicles.length).toBe(1);
			expect(vehicles[0].license_plate).toBe('AA-BB-01');
		});

		it('should NOT sync vehicles expired more than 80 days ago', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const today = new Date();
			const ninetyDaysAgo = new Date();
			ninetyDaysAgo.setDate(today.getDate() - 90); // Outside 80-day window

			// Create vehicle expired 90 days ago (should be excluded)
			await db.models.Vehicle.create({
				license_plate: 'BB-CC-02',
				companyId: company._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: ninetyDaysAgo,
				deleted: false
			});

			// Get list of vehicles that would be synced
			const vehicles = await db.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000),
					$lte: new Date(today.getTime() + 80 * 24 * 60 * 60 * 1000)
				}
			});

			// Vehicle should NOT be in the sync list
			expect(vehicles.length).toBe(0);
		});

		it('should sync vehicles expiring within next 80 days', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const today = new Date();
			const sixtyDaysFromNow = new Date();
			sixtyDaysFromNow.setDate(today.getDate() + 60); // Within 80-day window

			// Create vehicle expiring in 60 days (should be included)
			await db.models.Vehicle.create({
				license_plate: 'CC-DD-03',
				companyId: company._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: sixtyDaysFromNow,
				deleted: false
			});

			// Get list of vehicles that would be synced
			const vehicles = await db.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000),
					$lte: new Date(today.getTime() + 80 * 24 * 60 * 60 * 1000)
				}
			});

			// Vehicle should be in the sync list
			expect(vehicles.length).toBe(1);
			expect(vehicles[0].license_plate).toBe('CC-DD-03');
		});

		it('should NOT sync vehicles expiring more than 80 days in the future', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const today = new Date();
			const hundredDaysFromNow = new Date();
			hundredDaysFromNow.setDate(today.getDate() + 100); // Outside 80-day window

			// Create vehicle expiring in 100 days (should be excluded)
			await db.models.Vehicle.create({
				license_plate: 'DD-EE-04',
				companyId: company._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: hundredDaysFromNow,
				deleted: false
			});

			// Get list of vehicles that would be synced
			const vehicles = await db.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000),
					$lte: new Date(today.getTime() + 80 * 24 * 60 * 60 * 1000)
				}
			});

			// Vehicle should NOT be in the sync list
			expect(vehicles.length).toBe(0);
		});

		it('should handle mixed scenarios - only sync vehicles within 160-day window', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const today = new Date();

			// Create various vehicles
			await db.models.Vehicle.create([
				{
					// Expired 90 days ago - EXCLUDED
					license_plate: 'AA-01-BB',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000),
					deleted: false
				},
				{
					// Expired 70 days ago - INCLUDED
					license_plate: 'BB-02-CC',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() - 70 * 24 * 60 * 60 * 1000),
					deleted: false
				},
				{
					// Expired 10 days ago - INCLUDED
					license_plate: 'CC-03-DD',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
					deleted: false
				},
				{
					// Expires in 30 days - INCLUDED
					license_plate: 'DD-04-EE',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
					deleted: false
				},
				{
					// Expires in 75 days - INCLUDED
					license_plate: 'EE-05-FF',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() + 75 * 24 * 60 * 60 * 1000),
					deleted: false
				},
				{
					// Expires in 120 days - EXCLUDED
					license_plate: 'FF-06-GG',
					companyId: company._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000),
					deleted: false
				}
			]);

			// Get list of vehicles that would be synced
			const vehicles = await db.models.Vehicle.find({
				deleted: { $ne: true },
				license_plate: { $exists: true, $nin: [null, ''] },
				apk_expiry: {
					$gte: new Date(today.getTime() - 80 * 24 * 60 * 60 * 1000),
					$lte: new Date(today.getTime() + 80 * 24 * 60 * 60 * 1000)
				}
			}).sort({ license_plate: 1 });

			// Should have exactly 4 vehicles
			expect(vehicles.length).toBe(4);
			expect(vehicles[0].license_plate).toBe('BB-02-CC'); // Expired 70 days ago
			expect(vehicles[1].license_plate).toBe('CC-03-DD'); // Expired 10 days ago
			expect(vehicles[2].license_plate).toBe('DD-04-EE'); // Expires in 30 days
			expect(vehicles[3].license_plate).toBe('EE-05-FF'); // Expires in 75 days
		});
	});

	describe('APK Notification Deduplication', () => {
		it('should NOT send notification if lastApkEmailSentForExpiring is set', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkNotificationsEnabled: true
				}
			});

			// Create client
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const thirtyDaysFromNow = new Date();
			thirtyDaysFromNow.setDate(today.getDate() + 30);

			// Create vehicle expiring in 30 days with email already sent
			await db.models.Vehicle.create({
				license_plate: 'AA-BB-11',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: thirtyDaysFromNow,
				lastApkEmailSentForExpiring: new Date(), // Email already sent
				deleted: false
			});

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK status check
				await apkService['checkApkExpiryForCompany'](company._id.toString());

				// Should create 0 notifications (email already sent)
				const notifications = await db.models.Notification.find({
					companyId: company._id,
					type: 'apk_expiring'
				});

				expect(notifications.length).toBe(0);
			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should send notification if lastApkEmailSentForExpiring is NOT set', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkNotificationsEnabled: true
				}
			});

			// Create client
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const thirtyDaysFromNow = new Date();
			thirtyDaysFromNow.setDate(today.getDate() + 30);

			// Create vehicle expiring in 30 days WITHOUT email sent
			await db.models.Vehicle.create({
				license_plate: 'BB-CC-22',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: thirtyDaysFromNow,
				// lastApkEmailSentForExpiring: NOT SET
				deleted: false
			});

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK status check
				await apkService['checkApkExpiryForCompany'](company._id.toString());

				// Should create 1 notification
				const notifications = await db.models.Notification.find({
					companyId: company._id,
					type: 'apk_expiring'
				});

				expect(notifications.length).toBe(1);
			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should NOT send notification if lastApkEmailSentForExpired is set', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkNotificationsEnabled: true
				}
			});

			// Create client
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const tenDaysAgo = new Date();
			tenDaysAgo.setDate(today.getDate() - 10);

			// Create vehicle expired 10 days ago with email already sent
			await db.models.Vehicle.create({
				license_plate: 'CC-DD-33',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: tenDaysAgo,
				lastApkEmailSentForExpired: new Date(), // Email already sent for expired
				deleted: false
			});

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK status check
				await apkService['checkApkExpiryForCompany'](company._id.toString());

				// Should create 0 notifications (email already sent)
				const notifications = await db.models.Notification.find({
					companyId: company._id,
					type: 'apk_expired'
				});

				expect(notifications.length).toBe(0);
			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should send notification for expired vehicle if lastApkEmailSentForExpired is NOT set', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkNotificationsEnabled: true
				}
			});

			// Create client
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const tenDaysAgo = new Date();
			tenDaysAgo.setDate(today.getDate() - 10);

			// Create vehicle expired 10 days ago WITHOUT email sent
			await db.models.Vehicle.create({
				license_plate: 'DD-EE-44',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: tenDaysAgo,
				// lastApkEmailSentForExpired: NOT SET
				deleted: false
			});

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK status check
				await apkService['checkApkExpiryForCompany'](company._id.toString());

				// Should create 1 notification
				const notifications = await db.models.Notification.find({
					companyId: company._id,
					type: 'apk_expired'
				});

				expect(notifications.length).toBe(1);
			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should reset email flags when APK is renewed (new expiry date)', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkNotificationsEnabled: true
				}
			});

			// Create client
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const tenDaysAgo = new Date();
			tenDaysAgo.setDate(today.getDate() - 10);

			// Create vehicle with expired APK and email sent
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'EE-FF-55',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: tenDaysAgo,
				lastApkEmailSentForExpired: new Date(),
				lastApkEmailSentForExpiring: new Date(),
				deleted: false
			});

			// Simulate APK renewal (new expiry date)
			const oneYearFromNow = new Date();
			oneYearFromNow.setFullYear(today.getFullYear() + 1);

			await db.models.Vehicle.updateOne(
				{ _id: vehicle._id },
				{
					$set: {
						apk_expiry: oneYearFromNow,
						// These should be reset when APK is updated
						lastApkEmailSentForExpired: null,
						lastApkEmailSentForExpiring: null
					}
				}
			);

			// Verify flags were reset
			const updatedVehicle = await db.models.Vehicle.findById(vehicle._id);
			expect(updatedVehicle).toBeTruthy();
			expect(updatedVehicle?.lastApkEmailSentForExpired).toBeNull();
			expect(updatedVehicle?.lastApkEmailSentForExpiring).toBeNull();
			if (updatedVehicle?.apk_expiry) {
				expect(updatedVehicle.apk_expiry.getTime()).toBe(oneYearFromNow.getTime());
			}
		});
	});
});
