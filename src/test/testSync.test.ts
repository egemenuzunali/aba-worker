import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { runTestSync } from '../lib/testSync';
import db from '../lib/db';
import { QUOTE_STATUS } from '../constants/quoteConstants';

describe('Test Sync Functionality', () => {
	let mongoServer: MongoMemoryServer;

	beforeAll(async () => {
		// Setup in-memory MongoDB (setup.ts handles connection)
		mongoServer = await MongoMemoryServer.create();
		const mongoUri = mongoServer.getUri();
		process.env.MONGODB_URI = mongoUri;
	}, 60000);

	afterAll(async () => {
		await mongoose.disconnect();
		if (mongoServer) {
			await mongoServer.stop();
		}
	}, 30000);

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = mongoose.connection.collections;
		for (const key in collections) {
			await collections[key].deleteMany({});
		}
	});

	describe('runTestSync - Company Selection', () => {
		it('should use specified TEST_SYNC_COMPANY_ID when provided', async () => {
			// Create test companies
			const company1 = await db.models.Company.create({
				name: 'Test Company 1',
				email: 'company1@test.com',
				phone_number: '1111111111',
				business: { vat_number: 'NL111111111', kvk_number: '11111111', iban: 'NL00ABNA0111111111' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			const company2 = await db.models.Company.create({
				name: 'Test Company 2',
				email: 'company2@test.com',
				phone_number: '2222222222',
				business: { vat_number: 'NL222222222', kvk_number: '22222222', iban: 'NL00ABNA0222222222' },
				address: { street: 'Teststraat', house_number: '2', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Create clients and quotes for both companies
			const client1 = await db.models.Client.create({
				name: 'Client 1',
				email: 'client1@test.com',
				phone_number: '1111111111',
				companyId: company1._id,
				client_number: 1
			});

			const client2 = await db.models.Client.create({
				name: 'Client 2',
				email: 'client2@test.com',
				phone_number: '2222222222',
				companyId: company2._id,
				client_number: 2
			});

			// Create expired quotes for both companies
			await db.models.Quote.create([
				{
					quote_number: 1,
					clientId: client1._id,
					companyId: company1._id,
					expiration_date: new Date('2024-01-10'),
					status: QUOTE_STATUS.CONCEPT,
					total_incl_vat: 100
				},
				{
					quote_number: 2,
					clientId: client2._id,
					companyId: company2._id,
					expiration_date: new Date('2024-01-10'),
					status: QUOTE_STATUS.CONCEPT,
					total_incl_vat: 200
				}
			]);

			// Set environment variables for test
			process.env.TEST_SYNC_STATUS_UPDATE = 'true';
			process.env.TEST_SYNC_MAINTENANCE = 'true';
			process.env.TEST_SYNC_RDW = 'true';
			process.env.TEST_SYNC_COMPANY_ID = company1._id.toString();

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify that company1 was used for testing
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining(`Test Company ID: ${company1._id.toString()}`)
				);

				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining(`Testing with company: Test Company 1 (${company1._id.toString()})`)
				);

			// Note: StatusUpdateScheduler processes ALL companies, not just the specified one
			// TEST_SYNC_COMPANY_ID only affects RDW and Maintenance services
			// Both quotes should be expired since both companies have expired quotes
			const quote1 = await db.models.Quote.findOne({ quote_number: 1 });
			expect(quote1?.status).toBe(QUOTE_STATUS.EXPIRED);

			const quote2 = await db.models.Quote.findOne({ quote_number: 2 });
			expect(quote2?.status).toBe(QUOTE_STATUS.EXPIRED);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should fall back to automatic selection when TEST_SYNC_COMPANY_ID is invalid', async () => {
			// Create test company
			const company = await db.models.Company.create({
				name: 'Valid Company',
				email: 'valid@test.com',
				phone_number: '1111111111',
				business: { vat_number: 'NL111111111', kvk_number: '11111111', iban: 'NL00ABNA0111111111' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Create client and quote
			const client = await db.models.Client.create({
				name: 'Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			await db.models.Quote.create({
				quote_number: 1,
				clientId: client._id,
				companyId: company._id,
				expiration_date: new Date('2024-01-10'),
				status: QUOTE_STATUS.CONCEPT,
				total_incl_vat: 100
			});

			// Set invalid company ID
			process.env.TEST_SYNC_STATUS_UPDATE = 'true';
			process.env.TEST_SYNC_MAINTENANCE = 'true';
			process.env.TEST_SYNC_RDW = 'true';
			process.env.TEST_SYNC_COMPANY_ID = '507f1f77bcf86cd799439011'; // Invalid ID

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify fallback message
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Specified company ID 507f1f77bcf86cd799439011 not found, falling back to automatic selection')
				);

				// Verify automatic selection worked
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Testing with company: Valid Company')
				);

			// Verify quote was processed
			const processedQuote = await db.models.Quote.findOne({ quote_number: 1 });
			expect(processedQuote?.status).toBe(QUOTE_STATUS.EXPIRED);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should skip companies that do not meet service module requirements', async () => {
			// Create company with APK disabled
			const company = await db.models.Company.create({
				name: 'Disabled Company',
				email: 'disabled@test.com',
				phone_number: '1111111111',
				business: { vat_number: 'NL111111111', kvk_number: '11111111', iban: 'NL00ABNA0111111111' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: false, // APK disabled
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Set environment to test with this specific company
			process.env.TEST_SYNC_STATUS_UPDATE = 'false';
			process.env.TEST_SYNC_MAINTENANCE = 'true';
			process.env.TEST_SYNC_RDW = 'false';
			process.env.TEST_SYNC_COMPANY_ID = company._id.toString();

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify that APK test was skipped due to disabled module
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('has APK disabled, skipping maintenance test')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should automatically select companies with <50 invoices and vehicles', async () => {
			// Create company that meets size criteria
			const smallCompany = await db.models.Company.create({
				name: 'Small Company',
				email: 'small@test.com',
				phone_number: '1111111111',
				business: { vat_number: 'NL111111111', kvk_number: '11111111', iban: 'NL00ABNA0111111111' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Create company that exceeds size criteria
			const largeCompany = await db.models.Company.create({
				name: 'Large Company',
				email: 'large@test.com',
				phone_number: '2222222222',
				business: { vat_number: 'NL222222222', kvk_number: '22222222', iban: 'NL00ABNA0222222222' },
				address: { street: 'Teststraat', house_number: '2', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Add 60 invoices to large company (exceeds limit)
			const client = await db.models.Client.create({
				name: 'Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: largeCompany._id,
				client_number: 1
			});

			const invoicePromises = [];
			for (let i = 0; i < 60; i++) {
				invoicePromises.push(
					db.models.Invoice.create({
						invoice_number: i,
						clientId: client._id,
						companyId: largeCompany._id,
						expiration_date: new Date('2024-01-01'),
						status: 'COMPLETED',
						total_incl_vat: 100,
						payments: [{ amount: 100 }]
					})
				);
			}
			await Promise.all(invoicePromises);

			// Add 60 vehicles to large company (exceeds limit)
			const vehiclePromises = [];
			for (let i = 0; i < 60; i++) {
				vehiclePromises.push(
					db.models.Vehicle.create({
						license_plate: `AA-00${i.toString().padStart(2, '0')}`,
						companyId: largeCompany._id,
						make: 'Test',
						model: 'Car',
						year: 2020
					})
				);
			}
			await Promise.all(vehiclePromises);

			// Don't set TEST_SYNC_COMPANY_ID to test automatic selection
			process.env.TEST_SYNC_STATUS_UPDATE = 'false';
			process.env.TEST_SYNC_MAINTENANCE = 'true';
			process.env.TEST_SYNC_RDW = 'false';
			delete process.env.TEST_SYNC_COMPANY_ID;

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify small company was selected (not large company)
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Testing with company: Small Company')
				);

				expect(consoleLogSpy).not.toHaveBeenCalledWith(
					expect.stringContaining('Testing with company: Large Company')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should skip all tests when no TEST_SYNC_* flags are enabled', async () => {
			// Ensure no test flags are set
			delete process.env.TEST_SYNC_STATUS_UPDATE;
			delete process.env.TEST_SYNC_MAINTENANCE;
			delete process.env.TEST_SYNC_RDW;
			delete process.env.TEST_SYNC_COMPANY_ID;

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify skipping message
				expect(consoleLogSpy).toHaveBeenCalledWith(
					expect.stringContaining('Skipping all test syncs (no TEST_SYNC_* flags enabled)')
				);

			} finally {
				consoleLogSpy.mockRestore();
			}
		});

		it('should handle environment variable parsing correctly', async () => {
			// Set flags to true strings (as they would be in actual env)
			process.env.TEST_SYNC_STATUS_UPDATE = 'true';
			process.env.TEST_SYNC_MAINTENANCE = 'true';
			process.env.TEST_SYNC_RDW = 'true';

			// Mock console.log to capture output
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				await runTestSync();

				// Verify flags were parsed correctly
				expect(consoleLogSpy).toHaveBeenCalledWith('testFlags', {
					statusUpdate: true,
					maintenance: true,
					rdw: true
				});

			} finally {
				consoleLogSpy.mockRestore();
			}
		});
	});

	describe('Error Handling', () => {
		it('should handle missing companies gracefully', async () => {
			// Set up test flags
			process.env.TEST_SYNC_STATUS_UPDATE = 'true';
			process.env.TEST_SYNC_MAINTENANCE = 'true';

			// Mock console.log
			const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			try {
				// This should not throw even if there are no companies
				await runTestSync();

				// Verify it logged that no companies were found (or similar message)
				expect(consoleLogSpy).toHaveBeenCalled();

			} finally {
				consoleLogSpy.mockRestore();
			}
		});
	});
});
