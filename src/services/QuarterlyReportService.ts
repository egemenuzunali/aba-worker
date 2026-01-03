/**
 * Quarterly Report Service
 * Sends automated emails to company owners on the first day of each quarter
 * with an overview of open invoices in PDF form
 */
import db from '../lib/db';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mail';
import { quarterlyReportTemplate, OpenInvoiceSummary } from '../lib/emailTemplates';
import { generateQuarterlyReportPdf } from '../lib/pdfGenerator';
import { getFrontendUrl, getDevMailTo, isDev } from '../lib/env';
import { INVOICE_STATUS } from '../constants/invoiceConstants';

interface QuarterlyReportResult {
	companiesProcessed: number;
	emailsSent: number;
	errors: string[];
	quarterName?: string;
}

export class QuarterlyReportService {
	private static instance: QuarterlyReportService;

	private constructor() { }

	public static getInstance(): QuarterlyReportService {
		if (!QuarterlyReportService.instance) {
			QuarterlyReportService.instance = new QuarterlyReportService();
		}
		return QuarterlyReportService.instance;
	}

	/**
	 * Get the quarter name for a given date
	 */
	private getQuarterName(date: Date): string {
		const month = date.getMonth();
		const year = date.getFullYear();
		const quarter = Math.floor(month / 3) + 1;
		return `Q${quarter} ${year}`;
	}

	/**
	 * Get the previous quarter's date range
	 * E.g., if today is Jan 1 2024 (Q1), returns Q4 2023: Oct 1 - Dec 31 2023
	 */
	private getPreviousQuarterRange(): { start: Date; end: Date; name: string } {
		const today = new Date();
		const currentMonth = today.getMonth();
		const currentYear = today.getFullYear();

		// Determine current quarter (0-indexed: Q1=0, Q2=1, Q3=2, Q4=3)
		const currentQuarter = Math.floor(currentMonth / 3);

		// Calculate previous quarter
		let prevQuarter = currentQuarter - 1;
		let prevYear = currentYear;

		if (prevQuarter < 0) {
			prevQuarter = 3; // Q4
			prevYear = currentYear - 1;
		}

		// Quarter start months: Q1=0 (Jan), Q2=3 (Apr), Q3=6 (Jul), Q4=9 (Oct)
		const startMonth = prevQuarter * 3;
		const endMonth = startMonth + 2;

		const start = new Date(prevYear, startMonth, 1, 0, 0, 0, 0);
		const end = new Date(prevYear, endMonth + 1, 0, 23, 59, 59, 999); // Last day of end month

		const name = `Q${prevQuarter + 1} ${prevYear}`;

		return { start, end, name };
	}

	/**
	 * Check if today is the first day of a quarter
	 */
	public isFirstDayOfQuarter(): boolean {
		const today = new Date();
		const day = today.getDate();
		const month = today.getMonth();

		// First day of Q1 (Jan), Q2 (Apr), Q3 (Jul), Q4 (Oct)
		return day === 1 && [0, 3, 6, 9].includes(month);
	}

	/**
	 * Get the current quarter identifier (e.g., "Q1 2025")
	 * This represents the quarter we're currently IN, which means we report on the PREVIOUS quarter
	 */
	public getCurrentQuarterIdentifier(): string {
		const today = new Date();
		const month = today.getMonth();
		const year = today.getFullYear();
		const quarter = Math.floor(month / 3) + 1;
		return `Q${quarter} ${year}`;
	}

	/**
	 * Check if quarterly reports were already sent for the current quarter
	 */
	public async wasQuarterlyReportSentForCurrentQuarter(): Promise<boolean> {
		const currentQuarter = this.getCurrentQuarterIdentifier();
		const systemDoc = await db.models.System.findOne();

		if (!systemDoc) {
			return false;
		}

		return (systemDoc as any).lastQuarterlyReportQuarter === currentQuarter;
	}

	/**
	 * Update the system record to mark quarterly reports as sent
	 */
	private async markQuarterlyReportAsSent(quarterName: string): Promise<void> {
		let systemDoc = await db.models.System.findOne();

		if (!systemDoc) {
			systemDoc = await db.models.System.create({
				lastQuarterlyReportSent: new Date(),
				lastQuarterlyReportQuarter: quarterName,
			});
		} else {
			(systemDoc as any).lastQuarterlyReportSent = new Date();
			(systemDoc as any).lastQuarterlyReportQuarter = quarterName;
			await systemDoc.save();
		}

		logger.info(`Marked quarterly report as sent for ${quarterName}`);
	}

	/**
	 * Check if a quarterly report was missed and should be sent on startup
	 * Returns true if we're in a new quarter and haven't sent the report yet
	 */
	public async shouldSendMissedQuarterlyReport(): Promise<boolean> {
		const currentQuarter = this.getCurrentQuarterIdentifier();
		const systemDoc = await db.models.System.findOne();

		// If no system doc or no last quarter recorded, we should send if we're past day 1
		if (!systemDoc || !(systemDoc as any).lastQuarterlyReportQuarter) {
			// Only send if we're in the first 7 days of a quarter to avoid sending very old reports
			const today = new Date();
			const dayOfMonth = today.getDate();
			const month = today.getMonth();
			const isQuarterStartMonth = [0, 3, 6, 9].includes(month);

			if (isQuarterStartMonth && dayOfMonth <= 7) {
				logger.info('No previous quarterly report record found, will send for current quarter');
				return true;
			}

			return false;
		}

		const lastQuarter = (systemDoc as any).lastQuarterlyReportQuarter;

		// If last sent quarter is different from current quarter, we missed it
		if (lastQuarter !== currentQuarter) {
			// Only send if we're in the first 7 days of a quarter
			const today = new Date();
			const dayOfMonth = today.getDate();
			const month = today.getMonth();
			const isQuarterStartMonth = [0, 3, 6, 9].includes(month);

			if (isQuarterStartMonth && dayOfMonth <= 7) {
				logger.info(`Quarterly report was missed. Last sent: ${lastQuarter}, Current: ${currentQuarter}`);
				return true;
			}
		}

		return false;
	}

	/**
	 * Get open invoices for a company within the previous quarter's date range
	 */
	private async getOpenInvoices(companyId: string, quarterStart: Date, quarterEnd: Date): Promise<OpenInvoiceSummary[]> {
		const today = new Date();

		// Find all unpaid, non-completed invoices within the quarter
		const openInvoices = await db.models.Invoice.find({
			companyId,
			deleted: { $ne: true },
			status: {
				$nin: [
					INVOICE_STATUS.COMPLETED,
					INVOICE_STATUS.CONCEPT,
					INVOICE_STATUS.PAID,
					INVOICE_STATUS.CREDITED
				]
			},
			// Filter by invoice_date within the quarter
			invoice_date: {
				$gte: quarterStart,
				$lte: quarterEnd
			}
		})
			.populate('clientId', 'name')
			.sort({ invoice_number: 1 })
			.lean();

		return openInvoices.map((inv: any) => {
			const expirationDate = new Date(inv.expiration_date);
			const daysOverdue = Math.max(0, Math.floor((today.getTime() - expirationDate.getTime()) / (1000 * 60 * 60 * 24)));

			return {
				invoiceNumber: inv.invoice_number,
				clientName: inv.clientId?.name || inv.client?.name || 'Onbekend',
				invoiceDate: inv.invoice_date,
				expirationDate: inv.expiration_date,
				totalAmount: inv.total_incl_vat,
				daysOverdue
			};
		});
	}

	/**
	 * Send quarterly report to a single company owner
	 */
	private async sendReportToCompany(company: any, owner: any): Promise<void> {
		const frontendUrl = getFrontendUrl();

		// Get the previous quarter's date range
		const { start: quarterStart, end: quarterEnd, name: quarterName } = this.getPreviousQuarterRange();

		// Get open invoices for the quarter
		const invoices = await this.getOpenInvoices(company._id.toString(), quarterStart, quarterEnd);

		// Calculate summary statistics
		const totalOpenAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
		const totalOpenInvoices = invoices.length;
		const overdueInvoices = invoices.filter(inv => inv.daysOverdue > 0).length;
		const overdueAmount = invoices
			.filter(inv => inv.daysOverdue > 0)
			.reduce((sum, inv) => sum + inv.totalAmount, 0);

		// Generate email content
		const ownerName = owner.firstName
			? `${owner.firstName}${owner.lastName ? ' ' + owner.lastName : ''}`
			: 'Eigenaar';

		const emailContent = quarterlyReportTemplate({
			ownerName,
			companyName: company.name,
			companyLogo: company.company_image,
			quarterName,
			totalOpenAmount,
			totalOpenInvoices,
			overdueInvoices,
			overdueAmount,
			invoices,
			frontendUrl,
		});

		// Generate PDF with detailed invoice list
		const pdfBuffer = await generateQuarterlyReportPdf({
			companyName: company.name,
			quarterName,
			generatedDate: new Date(),
			totalOpenAmount,
			totalOpenInvoices,
			overdueInvoices,
			invoices
		});

		// Determine recipient email
		const recipientEmail = isDev() && getDevMailTo()
			? getDevMailTo()!
			: owner.email;

		// Send email
		await sendMail({
			from: `${process.env.APP_NAME || 'ABA'} <${process.env.APP_NOREPLY_EMAIL}>`,
			to: recipientEmail,
			subject: `Kwartaaloverzicht Facturen ${quarterName} - ${company.name}`,
			html: emailContent.html,
			text: emailContent.text,
			attachments: [{
				filename: `Kwartaaloverzicht-Facturen-${company.name.replace(/[^a-zA-Z0-9]/g, '-')}-${quarterName.replace(' ', '-')}.pdf`,
				data: pdfBuffer
			}]
		});

		logger.info(`Quarterly report sent to ${recipientEmail} for company ${company.name}`, {
			companyId: company._id.toString(),
			totalOpenInvoices,
			totalOpenAmount,
			overdueInvoices,
			overdueAmount,
		});
	}

	/**
	 * Send quarterly reports to all eligible companies
	 */
	public async sendQuarterlyReports(): Promise<QuarterlyReportResult> {
		const { name: quarterName } = this.getPreviousQuarterRange();
		const currentQuarterIdentifier = this.getCurrentQuarterIdentifier();

		const result: QuarterlyReportResult = {
			companiesProcessed: 0,
			emailsSent: 0,
			errors: [],
			quarterName
		};

		const startTime = Date.now();
		logger.info('Starting quarterly report generation', { quarterName, currentQuarterIdentifier });

		try {
			// Check if already sent for this quarter
			const alreadySent = await this.wasQuarterlyReportSentForCurrentQuarter();
			if (alreadySent) {
				logger.info(`Quarterly reports already sent for ${currentQuarterIdentifier}, skipping`);
				return result;
			}

			// Get all active companies with quarterly reports enabled
			const companies = await db.models.Company.find({
				'serviceModules.quarterlyReportEnabled': { $ne: false },
				// Only companies with active or trialing subscription
				$or: [
					{ 'subscription.subscriptionStatus': 'active' },
					{ 'subscription.subscriptionStatus': 'trialing' },
					// Include companies without subscription status set (legacy)
					{ 'subscription.subscriptionStatus': { $exists: false } },
					{ 'subscription.subscriptionStatus': null }
				]
			}).select('_id name email company_image ownerId serviceModules subscription');

			logger.info(`Found ${companies.length} companies eligible for quarterly reports`);

			for (const company of companies) {
				result.companiesProcessed++;

				try {
					// Get the owner
					const owner = await db.models.User.findById(company.ownerId);

					if (!owner) {
						logger.warn(`Owner not found for company ${company.name}`, { companyId: company._id.toString() });
						result.errors.push(`Owner not found for company ${company.name}`);
						continue;
					}

					if (!owner.email) {
						logger.warn(`Owner has no email for company ${company.name}`, { companyId: company._id.toString() });
						result.errors.push(`Owner has no email for company ${company.name}`);
						continue;
					}

					await this.sendReportToCompany(company, owner);
					result.emailsSent++;

				} catch (companyError) {
					const errorMsg = `Failed to send quarterly report for company ${company.name}: ${(companyError as Error).message}`;
					logger.error(errorMsg, {
						companyId: company._id.toString(),
						error: (companyError as Error).stack
					});
					result.errors.push(errorMsg);
				}
			}

			const duration = Date.now() - startTime;
			logger.serviceComplete('Quarterly report generation', duration, {
				total: result.companiesProcessed,
				successful: result.emailsSent,
				failed: result.errors.length,
				skipped: result.companiesProcessed - result.emailsSent - result.errors.length,
				duration
			});

			// Mark the quarterly report as sent for this quarter (even if some failed, we don't want to retry all)
			if (result.emailsSent > 0 || result.companiesProcessed > 0) {
				await this.markQuarterlyReportAsSent(currentQuarterIdentifier);
			}

		} catch (error) {
			const errorMsg = `Failed to run quarterly reports: ${(error as Error).message}`;
			logger.error(errorMsg, { error: (error as Error).stack });
			result.errors.push(errorMsg);
		}

		return result;
	}

	/**
	 * Manual trigger for testing (sends report for a specific company)
	 */
	public async sendReportForCompany(companyId: string): Promise<void> {
		const company = await db.models.Company.findById(companyId);

		if (!company) {
			throw new Error(`Company not found: ${companyId}`);
		}

		const owner = await db.models.User.findById(company.ownerId);

		if (!owner) {
			throw new Error(`Owner not found for company: ${companyId}`);
		}

		await this.sendReportToCompany(company, owner);
	}
}
