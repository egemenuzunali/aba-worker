import mongoose from 'mongoose';
import { RdwSyncService } from '../services/RdwSyncService';
import db from '../lib/db';

describe('RdwSyncService - RDW Sync Notification Tests', () => {
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
				phone_number: '2222222222',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: false
			});

			// Create vehicle with tenaamstelling change
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'BB-02-CC',
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

				// Verify notification was created
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Tenaamstelling gewijzigd')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should not create notifications when tenaamstellingChanged is false', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Create client with notifications enabled
			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				companyId: company._id,
				apkNotificationsDisabled: false
			});

			// Create vehicle
			const vehicle = await db.models.Vehicle.create({
				license_plate: 'CC-03-DD',
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
				// Simulate update without tenaamstelling change
				const updates = {
					make: 'Updated Make' // Some other change, not tenaamstelling
				};

				// Call the private method with tenaamstellingChanged = false
				await rdwService['createTenaamstellingNotificationIfNeeded'](vehicle, updates, false);

				// Verify no notification was created (console.log should not be called with notification message)
				expect(consoleLogSpy).not.toHaveBeenCalledWith(
					expect.stringContaining('Created tenaamstelling change notification')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});
	});

	describe('Mixed Scenarios', () => {
		it('should handle multiple notification types in complex scenarios', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'company@test.com',
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Create clients with different notification preferences
			const disabledClient = await db.models.Client.create({
				name: 'Disabled Client',
				email: 'disabled@test.com',
				companyId: company._id,
				client_number: 1,
				apkNotificationsDisabled: true
			});

			const enabledClient = await db.models.Client.create({
				name: 'Enabled Client',
				email: 'enabled@test.com',
				companyId: company._id,
				client_number: 2,
				apkNotificationsDisabled: false
			});

			// Create vehicles for both clients
			await db.models.Vehicle.create([
				{
					license_plate: 'AA-01-BB',
					companyId: company._id,
					clientId: disabledClient._id,
					datum_tenaamstelling: new Date('2024-01-01'),
					deleted: false
				},
				{
					license_plate: 'BB-02-CC',
					companyId: company._id,
					clientId: enabledClient._id,
					datum_tenaamstelling: new Date('2024-01-01'),
					deleted: false
				}
			]);

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// Test tenaamstelling notifications for both clients
				const disabledVehicle = await db.models.Vehicle.findOne({ license_plate: 'AA-01-BB' });
				const enabledVehicle = await db.models.Vehicle.findOne({ license_plate: 'BB-02-CC' });

				if (disabledVehicle && enabledVehicle) {
					// Simulate tenaamstelling change for disabled client
					await rdwService['createTenaamstellingNotificationIfNeeded'](
						disabledVehicle,
						{ datum_tenaamstelling: new Date('2024-01-15') },
						true
					);

					// Simulate tenaamstelling change for enabled client
					await rdwService['createTenaamstellingNotificationIfNeeded'](
						enabledVehicle,
						{ datum_tenaamstelling: new Date('2024-01-15') },
						true
					);

					// Verify disabled client notification was skipped
					expect(consoleLogSpy).toHaveBeenCalledWith(
						expect.stringContaining('Skipping tenaamstelling notification for AA-01-BB - client has notifications disabled')
					);

					// Verify enabled client notification was created
					expect(consoleLogSpy).toHaveBeenCalledWith(
						expect.stringContaining('Tenaamstelling gewijzigd')
					);
				}

			} finally {
				consoleLogSpy.mockRestore();
			}
		});
	});
});