import mongoose from 'mongoose';
import { StatusUpdateScheduler } from '../services/StatusUpdateScheduler';
import db from '../lib/db';
import { QUOTE_STATUS } from '../constants/quoteConstants';
import { INVOICE_STATUS } from '../constants/invoiceConstants';
import { PURCHASE_INVOICE_STATUS } from '../constants/purchaseInvoiceConstants';

describe('StatusUpdateScheduler - Processed Date Tracking', () => {
	let scheduler: StatusUpdateScheduler;

	beforeAll(async () => {
		// Initialize scheduler (database connection is handled by test setup)
		scheduler = StatusUpdateScheduler.getInstance();
	});

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = mongoose.connection.collections;
		for (const key in collections) {
			await collections[key].deleteMany({});
		}
	});

	describe('updateExpiredQuotes - Processed Date Tracking', () => {
		it('should only process quotes expired after lastExpiryCheckDate (system-wide)', async () => {
			// Set system-wide last check date
			await db.models.System.create({
				lastQuoteExpiryCheck: new Date('2024-01-10'),
				lastInvoiceExpiryCheck: new Date('2024-01-10'),
				lastPurchaseInvoiceExpiryCheck: new Date('2024-01-10')
			});

			// Create test companies
			const company1 = await db.models.Company.create({
				name: 'Company 1',
				email: 'company1@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const company2 = await db.models.Company.create({
				name: 'Company 2',
				email: 'company2@test.com',
				phone_number: '1234567891',
				business: { vat_number: 'NL123456780', kvk_number: '12345679', iban: 'NL00ABNA0123456780' },
				address: { street: 'Teststraat', house_number: '2', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Create test clients
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

			// Create quotes with different expiration dates
			// Quote expired on Jan 5 (before system last check on Jan 10) - should NOT be processed
			await db.models.Quote.create({
				quote_number: 1,
				clientId: client1._id,
				companyId: company1._id,
				expiration_date: new Date('2024-01-05'),
				status: QUOTE_STATUS.CONCEPT,
				total_incl_vat: 100
			});

			// Quote expired on Jan 12 (after system last check) - should be processed
			await db.models.Quote.create({
				quote_number: 2,
				clientId: client1._id,
				companyId: company1._id,
				expiration_date: new Date('2024-01-12'),
				status: QUOTE_STATUS.CONCEPT,
				total_incl_vat: 200
			});

			// Quote expired on Jan 20 (after system last check) - should be processed
			await db.models.Quote.create({
				quote_number: 3,
				clientId: client2._id,
				companyId: company2._id,
				expiration_date: new Date('2024-01-20'),
				status: QUOTE_STATUS.CONCEPT,
				total_incl_vat: 300
			});

			// Quote already expired - should NOT be processed
			await db.models.Quote.create({
				quote_number: 4,
				clientId: client1._id,
				companyId: company1._id,
				expiration_date: new Date('2024-01-12'),
				status: QUOTE_STATUS.EXPIRED,
				total_incl_vat: 400
			});

			// Run expiry check
			const result = await (scheduler as any).updateExpiredQuotes();

			// Should have processed 2 quotes (2 and 3)
			expect(result.updated).toBe(2);
			expect(result.errors).toHaveLength(0);

			// Verify only quotes 2 and 3 were newly marked as expired
			const newlyExpiredQuotes = await db.models.Quote.find({
				status: QUOTE_STATUS.EXPIRED,
				quote_number: { $in: [2, 3] }
			});
			expect(newlyExpiredQuotes).toHaveLength(2);

			// Verify quote 4 remained expired (wasn't processed again)
			const alreadyExpiredQuote = await db.models.Quote.findOne({
				quote_number: 4,
				status: QUOTE_STATUS.EXPIRED
			});
			expect(alreadyExpiredQuote).toBeTruthy();

			// Verify system-wide lastQuoteExpiryCheck was updated
			const updatedSystem = await db.models.System.findOne();
			expect(updatedSystem?.lastQuoteExpiryCheck).toBeDefined();

			// Last check date should be recent (within last minute)
			const oneMinuteAgo = new Date(Date.now() - 60000);
			expect(new Date(updatedSystem!.lastQuoteExpiryCheck!).getTime()).toBeGreaterThan(oneMinuteAgo.getTime());
		});

		it('should skip companies without invoice status checking enabled', async () => {
			// Create company with invoice status checking disabled
			const company = await db.models.Company.create({
				name: 'Company Disabled',
				email: 'disabled@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: false, // Disabled
					rdwSyncEnabled: true,
					lastExpiryCheckDate: new Date('2024-01-01')
				}
			});

			// Create expired quote
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

			// Run expiry check
			const result = await (scheduler as any).updateExpiredQuotes();

			// Should not process any quotes
			expect(result.updated).toBe(0);

			// Quote should still be CONCEPT
			const quote = await db.models.Quote.findOne({ quote_number: 1 });
			expect(quote?.status).toBe(QUOTE_STATUS.CONCEPT);
		});

		it('should handle missing system lastExpiryCheckDate gracefully', async () => {
			// No System document exists - should use default date (2020-01-01)

			// Create company
			const company = await db.models.Company.create({
				name: 'Company No Date',
				email: 'nodate@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Create expired quote
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

			// Run expiry check - should use default date (2020-01-01)
			const result = await (scheduler as any).updateExpiredQuotes();

			// Should process the quote (since 2024-01-10 is after 2020-01-01)
			expect(result.updated).toBe(1);

			// Should have created System document with lastQuoteExpiryCheck
			const systemDoc = await db.models.System.findOne();
			expect(systemDoc?.lastQuoteExpiryCheck).toBeDefined();
		});
	});

	describe('updateExpiredInvoices - Processed Date Tracking', () => {
		it('should only process invoices expired after lastExpiryCheckDate and unpaid', async () => {
			// Set system-wide last check date
			await db.models.System.create({
				lastQuoteExpiryCheck: new Date('2024-01-10'),
				lastInvoiceExpiryCheck: new Date('2024-01-10'),
				lastPurchaseInvoiceExpiryCheck: new Date('2024-01-10')
			});

			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			const client = await db.models.Client.create({
				name: 'Test Client',
				email: 'client@test.com',
				phone_number: '1111111111',
				companyId: company._id,
				client_number: 1
			});

			// Create invoices with different scenarios
			const now = new Date();

			// Invoice expired before last check - should NOT be processed
			await db.models.Invoice.create({
				invoice_number: 1,
				clientId: client._id,
				companyId: company._id,
				expiration_date: new Date('2024-01-05'),
				status: INVOICE_STATUS.OPEN,
				total_incl_vat: 100,
				payments: []
			});

			// Invoice expired after last check, unpaid - should be processed
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			await db.models.Invoice.create({
				invoice_number: 2,
				clientId: client._id,
				companyId: company._id,
				expiration_date: yesterday, // Expired yesterday
				status: INVOICE_STATUS.OPEN,
				total_incl_vat: 200,
				payments: []
			});

			// Invoice expired after last check, but already paid - should NOT be processed
			await db.models.Invoice.create({
				invoice_number: 3,
				clientId: client._id,
				companyId: company._id,
				expiration_date: new Date('2024-01-15'),
				status: INVOICE_STATUS.OPEN,
				total_incl_vat: 300,
				payments: [{ amount: 300 }] // Fully paid
			});

			// Run expiry check
			const result = await (scheduler as any).updateExpiredInvoices();

			// Should have processed 1 invoice (the one that expired yesterday)
			expect(result.updated).toBe(1);

			// Verify one invoice was marked as expired
			const expiredInvoices = await db.models.Invoice.find({ status: INVOICE_STATUS.EXPIRED });
			expect(expiredInvoices).toHaveLength(1);
			expect(expiredInvoices[0].invoice_number).toBe(2);

			// Others should remain unchanged
			const inv1 = await db.models.Invoice.findOne({ invoice_number: 1 });
			const inv3 = await db.models.Invoice.findOne({ invoice_number: 3 });
			expect(inv1?.status).toBe(INVOICE_STATUS.OPEN);
			expect(inv3?.status).toBe(INVOICE_STATUS.OPEN);

			// Verify system-wide lastInvoiceExpiryCheck was updated
			const updatedSystem = await db.models.System.findOne();
			expect(updatedSystem?.lastInvoiceExpiryCheck).toBeDefined();

			// Last check date should be recent (within last minute)
			const oneMinuteAgo = new Date(Date.now() - 60000);
			expect(new Date(updatedSystem!.lastInvoiceExpiryCheck!).getTime()).toBeGreaterThan(oneMinuteAgo.getTime());
		});
	});

	describe('updateExpiredPurchaseInvoices - Processed Date Tracking', () => {
		it('should only process purchase invoices expired after lastExpiryCheckDate and unpaid', async () => {
			// Set system-wide last check date
			await db.models.System.create({
				lastQuoteExpiryCheck: new Date('2024-01-10'),
				lastInvoiceExpiryCheck: new Date('2024-01-10'),
				lastPurchaseInvoiceExpiryCheck: new Date('2024-01-10')
			});

			// Create test company
			const company = await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Create purchase invoices with different scenarios
			// Purchase invoice expired before last check - should NOT be processed
			await db.models.PurchaseInvoice.create({
				invoice_number: 'PINV001',
				companyId: company._id,
				expiration_date: new Date('2024-01-05'),
				status: PURCHASE_INVOICE_STATUS.OPEN,
				total_incl_vat: 100,
				payments: []
			});

			// Purchase invoice expired after last check, unpaid - should be processed
			await db.models.PurchaseInvoice.create({
				invoice_number: 'PINV002',
				companyId: company._id,
				expiration_date: new Date('2024-01-15'),
				status: PURCHASE_INVOICE_STATUS.OPEN,
				total_incl_vat: 200,
				payments: []
			});

			// Purchase invoice expired after last check, but already paid - should NOT be processed
			await db.models.PurchaseInvoice.create({
				invoice_number: 'PINV003',
				companyId: company._id,
				expiration_date: new Date('2024-01-15'),
				status: PURCHASE_INVOICE_STATUS.OPEN,
				total_incl_vat: 300,
				payments: [{ amount: 300 }] // Fully paid
			});

			// Run expiry check
			const result = await (scheduler as any).updateExpiredPurchaseInvoices();

			// Should have processed 1 purchase invoice
			expect(result.updated).toBe(1);

			// Verify we have 1 expired purchase invoice
			const expiredInvoices = await db.models.PurchaseInvoice.find({ status: PURCHASE_INVOICE_STATUS.EXPIRED });
			expect(expiredInvoices).toHaveLength(1);

			// Verify the correct invoice was expired (the one with expiration_date after last check and unpaid)
			const expiredInvoice = expiredInvoices[0];
			expect(expiredInvoice.expiration_date.getTime()).toBeGreaterThan(new Date('2024-01-10').getTime());
			expect(expiredInvoice.total_incl_vat).toBe(200); // The unpaid one

			// Verify other invoices remain unchanged
			const allInvoices = await db.models.PurchaseInvoice.find({});
			const openInvoices = allInvoices.filter(inv => inv.status === PURCHASE_INVOICE_STATUS.OPEN);
			expect(openInvoices).toHaveLength(2); // The other two should still be OPEN

			// Verify system-wide lastPurchaseInvoiceExpiryCheck was updated
			const updatedSystem = await db.models.System.findOne();
			expect(updatedSystem?.lastPurchaseInvoiceExpiryCheck).toBeDefined();

			// Last check date should be recent (within last minute)
			const oneMinuteAgo = new Date(Date.now() - 60000);
			expect(new Date(updatedSystem!.lastPurchaseInvoiceExpiryCheck!).getTime()).toBeGreaterThan(oneMinuteAgo.getTime());
		});
	});

	describe('Error Handling', () => {
		it('should handle database errors gracefully', async () => {
			// Create company
			await db.models.Company.create({
				name: 'Test Company',
				email: 'test@test.com',
				phone_number: '1234567890',
				business: { vat_number: 'NL123456789', kvk_number: '12345678', iban: 'NL00ABNA0123456789' },
				address: { street: 'Teststraat', house_number: '1', postal_code: '1234AB', city: 'Teststad' },
				serviceModules: {
					apkEnabled: true,
					invoiceStatusCheckingEnabled: true,
					rdwSyncEnabled: true
				}
			});

			// Mock database error by disconnecting
			await mongoose.disconnect();

			const result = await (scheduler as any).updateExpiredQuotes();

			expect(result.updated).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Failed to update expired quotes');

			// Reconnect for other tests
			await mongoose.connect(process.env.MONGODB_URI!);
		});
	});
});
