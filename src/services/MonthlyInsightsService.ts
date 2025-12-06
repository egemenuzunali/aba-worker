/**
 * Monthly Insights Service
 * Sends automated monthly emails to company owners with business performance insights
 */
import db from '../lib/db';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mail';
import { monthlyInsightsTemplate } from '../lib/emailTemplates/monthlyInsights';
import { getFrontendUrl, getDevMailTo, isDev } from '../lib/env';
import { CompanyInsightsService } from './CompanyInsightsService';

interface MonthlyInsightsResult {
	companiesProcessed: number;
	emailsSent: number;
	errors: string[];
	monthName?: string;
}

export class MonthlyInsightsService {
	private static instance: MonthlyInsightsService;

	private constructor() {}

	public static getInstance(): MonthlyInsightsService {
		if (!MonthlyInsightsService.instance) {
			MonthlyInsightsService.instance = new MonthlyInsightsService();
		}
		return MonthlyInsightsService.instance;
	}

	/**
	 * Get the current month identifier (e.g., "December 2025")
	 */
	public getCurrentMonthIdentifier(): string {
		const insightsService = CompanyInsightsService.getInstance();
		return insightsService.getMonthRange(0).name;
	}

	/**
	 * Check if monthly insights were already sent for the current month
	 */
	public async wasMonthlyInsightsSentForCurrentMonth(): Promise<boolean> {
		const currentMonth = this.getCurrentMonthIdentifier();
		const systemDoc = await db.models.System.findOne();

		if (!systemDoc) {
			return false;
		}

		return (systemDoc as any).lastMonthlyInsightsMonth === currentMonth;
	}

	/**
	 * Update the system record to mark monthly insights as sent
	 */
	private async markMonthlyInsightsAsSent(monthName: string): Promise<void> {
		let systemDoc = await db.models.System.findOne();

		if (!systemDoc) {
			systemDoc = await db.models.System.create({
				lastMonthlyInsightsSent: new Date(),
				lastMonthlyInsightsMonth: monthName,
			});
		} else {
			(systemDoc as any).lastMonthlyInsightsSent = new Date();
			(systemDoc as any).lastMonthlyInsightsMonth = monthName;
			await systemDoc.save();
		}

		logger.info(`Marked monthly insights as sent for ${monthName}`);
	}

	/**
	 * Check if monthly insights were missed and should be sent on startup
	 */
	public async shouldSendMissedMonthlyInsights(): Promise<boolean> {
		const currentMonth = this.getCurrentMonthIdentifier();
		const systemDoc = await db.models.System.findOne();

		if (!systemDoc || !(systemDoc as any).lastMonthlyInsightsMonth) {
			// Only send if we're in the first 5 days of the month
			const today = new Date();
			if (today.getDate() <= 5) {
				logger.info('No previous monthly insights record found, will send for current month');
				return true;
			}
			return false;
		}

		const lastMonth = (systemDoc as any).lastMonthlyInsightsMonth;

		if (lastMonth !== currentMonth) {
			const today = new Date();
			if (today.getDate() <= 5) {
				logger.info(`Monthly insights were missed. Last sent: ${lastMonth}, Current: ${currentMonth}`);
				return true;
			}
		}

		return false;
	}

	/**
	 * Send monthly insights to a single company owner
	 */
	private async sendInsightsToCompany(company: any, owner: any): Promise<void> {
		const frontendUrl = getFrontendUrl();
		const insightsService = CompanyInsightsService.getInstance();

		// Get the previous month's range
		const previousMonthRange = insightsService.getMonthRange(-1);

		// Get comprehensive insights for the month (with comparison to previous month)
		const insights = await insightsService.getInsights(
			company._id.toString(),
			previousMonthRange,
			true // Include comparison with previous period
		);

		// Generate email content
		const ownerName = owner.firstName
			? `${owner.firstName}${owner.lastName ? ' ' + owner.lastName : ''}`
			: 'Eigenaar';

		const emailContent = monthlyInsightsTemplate({
			ownerName,
			companyName: company.name,
			companyLogo: company.company_image,
			monthName: previousMonthRange.name,
			insights,
			frontendUrl,
		});

		// Determine recipient email
		const recipientEmail = isDev() && getDevMailTo()
			? getDevMailTo()!
			: owner.email;

		// Send email
		await sendMail({
			from: `${process.env.APP_NAME || 'ABA'} <${process.env.APP_NOREPLY_EMAIL}>`,
			to: recipientEmail,
			subject: `Maandoverzicht ${previousMonthRange.name} - ${company.name}`,
			html: emailContent.html,
			text: emailContent.text,
		});

		logger.info(`Monthly insights sent to ${recipientEmail} for company ${company.name}`, {
			companyId: company._id.toString(),
			revenue: insights.revenue.total,
			invoicesCreated: insights.invoices.created,
			newClients: insights.clients.newInPeriod,
		});
	}

	/**
	 * Send monthly insights to all eligible companies
	 */
	public async sendMonthlyInsights(): Promise<MonthlyInsightsResult> {
		const insightsService = CompanyInsightsService.getInstance();
		const previousMonthRange = insightsService.getMonthRange(-1);
		const currentMonthIdentifier = this.getCurrentMonthIdentifier();

		const result: MonthlyInsightsResult = {
			companiesProcessed: 0,
			emailsSent: 0,
			errors: [],
			monthName: previousMonthRange.name,
		};

		const startTime = Date.now();
		logger.info('Starting monthly insights generation', { monthName: previousMonthRange.name, currentMonthIdentifier });

		try {
			// Check if already sent for this month
			const alreadySent = await this.wasMonthlyInsightsSentForCurrentMonth();
			if (alreadySent) {
				logger.info(`Monthly insights already sent for ${currentMonthIdentifier}, skipping`);
				return result;
			}

			// Get all active companies with monthly insights enabled
			const companies = await db.models.Company.find({
				'serviceModules.monthlyInsightsEnabled': { $ne: false },
				$or: [
					{ 'subscription.subscriptionStatus': 'active' },
					{ 'subscription.subscriptionStatus': 'trialing' },
					{ 'subscription.subscriptionStatus': { $exists: false } },
					{ 'subscription.subscriptionStatus': null }
				]
			}).select('_id name email company_image ownerId serviceModules subscription');

			logger.info(`Found ${companies.length} companies eligible for monthly insights`);

			for (const company of companies) {
				result.companiesProcessed++;

				try {
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

					await this.sendInsightsToCompany(company, owner);
					result.emailsSent++;

				} catch (companyError) {
					const errorMsg = `Failed to send monthly insights for company ${company.name}: ${(companyError as Error).message}`;
					logger.error(errorMsg, {
						companyId: company._id.toString(),
						error: (companyError as Error).stack
					});
					result.errors.push(errorMsg);
				}
			}

			const duration = Date.now() - startTime;
			logger.serviceComplete('Monthly insights generation', duration, {
				total: result.companiesProcessed,
				successful: result.emailsSent,
				failed: result.errors.length,
				skipped: result.companiesProcessed - result.emailsSent - result.errors.length,
				duration
			});

			// Mark as sent
			if (result.emailsSent > 0 || result.companiesProcessed > 0) {
				await this.markMonthlyInsightsAsSent(currentMonthIdentifier);
			}

		} catch (error) {
			const errorMsg = `Failed to run monthly insights: ${(error as Error).message}`;
			logger.error(errorMsg, { error: (error as Error).stack });
			result.errors.push(errorMsg);
		}

		return result;
	}

	/**
	 * Manual trigger for testing (sends insights for a specific company)
	 */
	public async sendInsightsForCompany(companyId: string): Promise<void> {
		const company = await db.models.Company.findById(companyId);

		if (!company) {
			throw new Error(`Company not found: ${companyId}`);
		}

		const owner = await db.models.User.findById(company.ownerId);

		if (!owner) {
			throw new Error(`Owner not found for company: ${companyId}`);
		}

		await this.sendInsightsToCompany(company, owner);
	}
}
