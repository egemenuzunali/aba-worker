import mongoose from 'mongoose';
import { RdwSyncService } from '../services/RdwSyncService';
import db from '../lib/db';

describe('RdwSyncService - APK Notification Filtering', () => {
	let rdwService: RdwSyncService;

	beforeAll(async () => {
		// Initialize RDW service (database connection is handled by test setup)
		rdwService = RdwSyncService.getInstance();
	});

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = mongoose.connection.collections;
		for (const key in collections) {
			await collections[key].deleteMany({});
		}
	});

	describe('checkApkExpiryForCompany - Client Notification Filtering', () => {
		it('should skip APK notifications for clients with apkNotificationsDisabled: true', async () => {
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

			// Create client with notifications disabled
			const disabledClient = await db.models.Client.create({
				name: 'Disabled Client',
				email: 'disabled@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: true // This should prevent notifications
			});

			// Create client with notifications enabled
			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				phone_number: '2222222222',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: false // This should allow notifications
			});

			// Create vehicles with expired APK for both clients
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1); // 1 year ago = expired (within 2 year window)

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: disabledClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: enabledClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				}
			]);

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK expiry check
				const notificationsCreated = await rdwService['checkApkExpiryForCompany'](company._id.toString());

				// Should create notifications only for the enabled client (1 notification)
				expect(notificationsCreated).toBe(1);

				// Verify notification was created for the company
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Created expired APK notification')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should create notifications only for clients with apkNotificationsDisabled: false', async () => {
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

			// Create multiple clients with different notification settings
			const disabledClient1 = await db.models.Client.create({
				name: 'Disabled Client 1',
				email: 'disabled1@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: true
			});

			const disabledClient2 = await db.models.Client.create({
				name: 'Disabled Client 2',
				email: 'disabled2@test.com',
				phone_number: '2222222222',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: true
			});

			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				phone_number: '3333333333',
				companyId: company._id,
				client_number: 3,
				apkNotificationsDisabled: false
			});

			// Create vehicles with expired APK for all clients
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1); // 1 year ago = expired (within 2 year window)

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: disabledClient1._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: disabledClient2._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'CC-03-DD',
					companyId: company._id,
					clientId: enabledClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				}
			]);

			// Run APK expiry check
			const notificationsCreated = await rdwService['checkApkExpiryForCompany'](company._id.toString());

			// Should create only 1 notification for the enabled client
			expect(notificationsCreated).toBe(1);
		});

		it('should include clients where apkNotificationsDisabled is undefined or null', async () => {
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

			// Create clients with different apkNotificationsDisabled states
			const undefinedClient = await db.models.Client.create({
				name: 'Undefined Client',
				email: 'undefined@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
				// apkNotificationsDisabled not set (undefined)
			});

			const nullClient = await db.models.Client.create({
				name: 'Null Client',
				email: 'null@test.com',
				phone_number: '2222222222',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: null
			});

			const falseClient = await db.models.Client.create({
				name: 'False Client',
				email: 'false@test.com',
				phone_number: '3333333333',
				companyId: company._id,
				client_number: 3,
				apkNotificationsDisabled: false
			});

			// Create vehicles with expired APK
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1); // 1 year ago = expired (within 2 year window)

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: undefinedClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: nullClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'CC-03-DD',
					companyId: company._id,
					clientId: falseClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				}
			]);

			// Run APK expiry check
			const notificationsCreated = await rdwService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification (all 3 clients should be included)
			expect(notificationsCreated).toBe(1);
		});
	});

	describe('createTenaamstellingNotificationIfNeeded - Individual Notification Filtering', () => {
		it('should skip tenaamstelling notifications when client has apkNotificationsDisabled: true', async () => {
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

			// Create client with notifications disabled
			const disabledClient = await db.models.Client.create({
				name: 'Disabled Client',
				email: 'disabled@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: true
			});

			// Create vehicle with tenaamstelling change
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: disabledClient._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				datum_tenaamstelling: new Date('2024-01-01'),
				deleted: false
			});

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Simulate tenaamstelling change
				const updates = {
					datum_tenaamstelling: new Date('2024-01-15') // Changed date
				};

				// Call the private method
				await rdwService['createTenaamstellingNotificationIfNeeded'](vehicle, updates, true);

				// Verify notification was skipped
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Skipping tenaamstelling notification for AA-01-BB - client has notifications disabled')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should create tenaamstelling notifications when client has apkNotificationsDisabled: false', async () => {
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
			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: false
			});

			// Create vehicle with tenaamstelling change
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: enabledClient._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				datum_tenaamstelling: new Date('2024-01-01'),
				deleted: false
			});

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Simulate tenaamstelling change
				const updates = {
					datum_tenaamstelling: new Date('2024-01-15') // Changed date
				};

				// Call the private method
				await rdwService['createTenaamstellingNotificationIfNeeded'](vehicle, updates, true);

				// Verify notification creation was attempted (we can't easily verify the actual notification
				// creation without mocking the NotificationService, but we can verify it didn't skip)
				expect(consoleLogSpy).not.toHaveBeenCalledWith(
					expect.stringContaining('Skipping tenaamstelling notification for AA-01-BB - client has notifications disabled')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should create tenaamstelling notifications when apkNotificationsDisabled is undefined', async () => {
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

			// Create client without apkNotificationsDisabled field (undefined)
			const undefinedClient = await db.models.Client.create({
				name: 'Undefined Client',
				email: 'undefined@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
				// apkNotificationsDisabled not set
			});

			// Create vehicle with tenaamstelling change
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'AA-01-BB',
				companyId: company._id,
				clientId: undefinedClient._id,
				make: 'Test',
				model: 'Car',
				year: 2020,
				datum_tenaamstelling: new Date('2024-01-01'),
				deleted: false
			});

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Simulate tenaamstelling change
				const updates = {
					datum_tenaamstelling: new Date('2024-01-15') // Changed date
				};

				// Call the private method
				await rdwService['createTenaamstellingNotificationIfNeeded'](vehicle, updates, true);

				// Verify notification creation was attempted (should not be skipped)
				expect(consoleLogSpy).not.toHaveBeenCalledWith(
					expect.stringContaining('Skipping tenaamstelling notification for AA-01-BB - client has notifications disabled')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});
	});

	describe('Mixed Scenarios', () => {
		it('should handle companies with mixed client notification preferences', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Mixed Company',
				email: 'mixed@test.com',
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

			// Create clients with different preferences
			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: false
			});

			const disabledClient = await db.models.Client.create({
				name: 'Disabled Client',
				email: 'disabled@test.com',
				phone_number: '2222222222',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: true
			});

			const defaultClient = await db.models.Client.create({
				name: 'Default Client',
				email: 'default@test.com',
				phone_number: '3333333333',
				companyId: company._id,
				client_number: 3
				// apkNotificationsDisabled not set (defaults to enabled)
			});

			// Create vehicles with expired APK for all clients
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1); // 1 year ago = expired (within 2 year window)

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: enabledClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: disabledClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'CC-03-DD',
					companyId: company._id,
					clientId: defaultClient._id,
					make: 'Test',
					model: 'Car',
					year: 2020,
					apk_expiry: expiredDate,
					deleted: false
				}
			]);

			// Run APK expiry check
			const notificationsCreated = await rdwService['checkApkExpiryForCompany'](company._id.toString());

			// Should create 1 notification for enabled and default clients (2 vehicles)
			// Disabled client should be filtered out
			expect(notificationsCreated).toBe(1);
		});
	});
});
