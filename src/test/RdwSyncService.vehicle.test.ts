import mongoose from 'mongoose';
import { ApkStatusService } from '../services/ApkStatusService';
import db from '../lib/db';

describe('ApkStatusService - Vehicle-Level Filtering', () => {
	let apkStatusService: ApkStatusService;

	beforeAll(async () => {
		// Initialize APK status service (database connection is handled by test setup)
		apkStatusService = ApkStatusService.getInstance();
	});

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = mongoose.connection.collections;
		for (const key in collections) {
			await collections[key].deleteMany({});
		}
	});

	describe('apkRemindersDismissed Filtering', () => {
		it('should exclude vehicles with apkRemindersDismissed: true', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Create client with notifications enabled
			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: false
			});

			// Create vehicles - one with dismissed reminders, one normal
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1); // 1 year ago = expired

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					apkRemindersDismissed: true, // Should be excluded
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					apkRemindersDismissed: false, // Should be included
					deleted: false
				}
			]);

			// Run APK expiry check
			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification (only for the non-dismissed vehicle)
			expect(notificationsCreated).toBe(1);

			// Verify the notification was created
			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications).toHaveLength(1);
			expect(notifications[0]?.metadata?.vehicleCount).toBe(1);
		});

		it('should include vehicles with apkRemindersDismissed: false', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				apkRemindersDismissed: false,
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});

		it('should include vehicles where apkRemindersDismissed is undefined', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				// apkRemindersDismissed not set (undefined - default behavior)
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});
	});

	describe('apkRemindersDisabledUntil Filtering', () => {
		it('should exclude vehicles with apkRemindersDisabledUntil in the future', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			const futureDate = new Date();
			futureDate.setDate(futureDate.getDate() + 30); // 30 days in future

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					apkRemindersDisabledUntil: futureDate, // Should be excluded
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					// No apkRemindersDisabledUntil - should be included
					deleted: false
				}
			]);

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification (only for vehicle without disabled until date)
			expect(notificationsCreated).toBe(1);

			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications[0]?.metadata?.vehicleCount).toBe(1);
		});

		it('should include vehicles with apkRemindersDisabledUntil in the past', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			const pastDate = new Date();
			pastDate.setDate(pastDate.getDate() - 30); // 30 days ago

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				apkRemindersDisabledUntil: pastDate, // Expired disable - should be included
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});

		it('should include vehicles where apkRemindersDisabledUntil is null', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				apkRemindersDisabledUntil: null,
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});
	});

	describe('geexporteerd (Exported) Filtering', () => {
		it('should exclude vehicles with geexporteerd: true', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					geexporteerd: true, // Exported - should be excluded
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					geexporteerd: false, // Not exported - should be included
					deleted: false
				}
			]);

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification (only for non-exported vehicle)
			expect(notificationsCreated).toBe(1);

			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications[0]?.metadata?.vehicleCount).toBe(1);
		});

		it('should include vehicles with geexporteerd: false', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				geexporteerd: false,
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});

		it('should include vehicles where geexporteerd is undefined', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				// geexporteerd not set (undefined)
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});
	});

	describe('deleted Filtering', () => {
		it('should exclude vehicles with deleted: true', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: true // Deleted - should be excluded
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false // Active - should be included
				}
			]);

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification (only for active vehicle)
			expect(notificationsCreated).toBe(1);

			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications[0]?.metadata?.vehicleCount).toBe(1);
		});

		it('should include vehicles with deleted: false', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: client._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				apk_expiry: expiredDate,
				deleted: false
			});

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			expect(notificationsCreated).toBe(1);
		});
	});

	describe('Combined Vehicle Filters', () => {
		it('should correctly apply multiple vehicle-level filters together', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			const futureDate = new Date();
			futureDate.setDate(futureDate.getDate() + 10);

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: true, // Should exclude
					geexporteerd: false,
					apkRemindersDismissed: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false,
					geexporteerd: true, // Should exclude
					apkRemindersDismissed: false
				},
				{
					license_plate: 'CC-03-DD',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false,
					geexporteerd: false,
					apkRemindersDismissed: true // Should exclude
				},
				{
					license_plate: 'DD-04-EE',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false,
					geexporteerd: false,
					apkRemindersDismissed: false,
					apkRemindersDisabledUntil: futureDate // Should exclude
				},
				{
					license_plate: 'EE-05-FF',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false,
					geexporteerd: false,
					apkRemindersDismissed: false
					// This one should be INCLUDED
				}
			]);

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification with only 1 vehicle (EE-05-FF)
			expect(notificationsCreated).toBe(1);

			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications).toHaveLength(1);
			expect(notifications[0]?.metadata?.vehicleCount).toBe(1);
			expect(notifications[0]?.metadata?.vehicleIds).toHaveLength(1);
		});

		it('should return 0 notifications when all vehicles are filtered out', async () => {
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			// Create vehicles that should all be filtered out
			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: true
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					geexporteerd: true
				},
				{
					license_plate: 'CC-03-DD',
					companyId: company._id,
					clientId: client._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					apkRemindersDismissed: true
				}
			]);

			const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 0 notifications
			expect(notificationsCreated).toBe(0);

			const notifications = await db.models.Notification.find({ companyId: company._id });
			expect(notifications).toHaveLength(0);
		});
	});
});
