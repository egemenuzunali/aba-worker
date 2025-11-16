import mongoose from 'mongoose';
import { ApkStatusService } from '../services/ApkStatusService';
import db from '../lib/db';

describe('ApkStatusService - APK Notification Filtering', () => {
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
				const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

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

		it('should create notifications for all enabled clients', async () => {
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

			// Create multiple clients with notifications enabled
			const client1 = await db.models.Client.create({
				name: 'Client 1',
				email: 'client1@test.com',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: false
			});

			const client2 = await db.models.Client.create({
				name: 'Client 2',
				email: 'client2@test.com',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: false
			});

			// Create vehicles with expired APK for both clients
			const today = new Date();
			const expiredDate = new Date(today);
			expiredDate.setFullYear(today.getFullYear() - 1);

			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: client1._id,
					apk_expiry: expiredDate,
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: client2._id,
					apk_expiry: expiredDate,
					deleted: false
				}
			]);

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Run APK expiry check
				const notificationsCreated = await apkStatusService['checkApkExpiryForCompany'](company._id.toString());

				// Should create 1 notification for the company (aggregates all clients)
				expect(notificationsCreated).toBe(1);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

	});
});
