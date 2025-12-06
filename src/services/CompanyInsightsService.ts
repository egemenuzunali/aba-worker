/**
 * Company Insights Service
 * Gathers business metrics for a company within a given period
 * Reusable for quarterly reports, monthly insights, and other analytics
 */
import db from '../lib/db';
import { logger } from '../lib/logger';
import { INVOICE_STATUS } from '../constants/invoiceConstants';
import { QUOTE_STATUS } from '../constants/quoteConstants';

export interface PeriodRange {
	start: Date;
	end: Date;
	name: string; // e.g., "Q4 2024" or "November 2024"
}

export interface CompanyInsights {
	period: PeriodRange;
	revenue: {
		total: number;
		paid: number;
		outstanding: number;
		overdue: number;
	};
	invoices: {
		created: number;
		completed: number;
		outstanding: number;
		overdue: number;
		averageValue: number;
	};
	quotes: {
		created: number;
		confirmed: number;
		conversionRate: number; // percentage
	};
	clients: {
		total: number;
		newInPeriod: number;
		withOutstandingInvoices: number;
	};
	vehicles: {
		total: number;
		newInPeriod: number;
		apkExpiringSoon: number; // within 30 days
		apkExpired: number;
	};
	appointments: {
		created: number;
		completed: number;
	};
	comparison?: {
		revenueTrend: number; // percentage change from previous period
		invoicesTrend: number;
		clientsTrend: number;
	};
}

export class CompanyInsightsService {
	private static instance: CompanyInsightsService;

	private constructor() {}

	public static getInstance(): CompanyInsightsService {
		if (!CompanyInsightsService.instance) {
			CompanyInsightsService.instance = new CompanyInsightsService();
		}
		return CompanyInsightsService.instance;
	}

	/**
	 * Get a quarterly period range
	 * @param quarterOffset - 0 for current quarter, -1 for previous quarter, etc.
	 */
	public getQuarterRange(quarterOffset: number = 0): PeriodRange {
		const today = new Date();
		const currentMonth = today.getMonth();
		const currentYear = today.getFullYear();
		const currentQuarter = Math.floor(currentMonth / 3);

		let targetQuarter = currentQuarter + quarterOffset;
		let targetYear = currentYear;

		while (targetQuarter < 0) {
			targetQuarter += 4;
			targetYear -= 1;
		}
		while (targetQuarter > 3) {
			targetQuarter -= 4;
			targetYear += 1;
		}

		const startMonth = targetQuarter * 3;
		const endMonth = startMonth + 2;

		const start = new Date(targetYear, startMonth, 1, 0, 0, 0, 0);
		const end = new Date(targetYear, endMonth + 1, 0, 23, 59, 59, 999);

		const name = `Q${targetQuarter + 1} ${targetYear}`;

		return { start, end, name };
	}

	/**
	 * Get a monthly period range
	 * @param monthOffset - 0 for current month, -1 for previous month, etc.
	 */
	public getMonthRange(monthOffset: number = 0): PeriodRange {
		const today = new Date();
		const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

		const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0, 0);
		const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

		const monthNames = [
			'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
			'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
		];
		const name = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

		return { start, end, name };
	}

	/**
	 * Gather all insights for a company within a given period
	 */
	public async getInsights(companyId: string, period: PeriodRange, includePreviousPeriodComparison: boolean = false): Promise<CompanyInsights> {
		const startTime = Date.now();
		logger.debug('Gathering company insights', { companyId, period: period.name });

		const [revenue, invoices, quotes, clients, vehicles, appointments] = await Promise.all([
			this.getRevenueMetrics(companyId, period),
			this.getInvoiceMetrics(companyId, period),
			this.getQuoteMetrics(companyId, period),
			this.getClientMetrics(companyId, period),
			this.getVehicleMetrics(companyId, period),
			this.getAppointmentMetrics(companyId, period),
		]);

		let comparison: CompanyInsights['comparison'] | undefined;

		if (includePreviousPeriodComparison) {
			comparison = await this.getPeriodComparison(companyId, period);
		}

		logger.debug('Company insights gathered', {
			companyId,
			duration: Date.now() - startTime,
			period: period.name
		});

		return {
			period,
			revenue,
			invoices,
			quotes,
			clients,
			vehicles,
			appointments,
			comparison,
		};
	}

	/**
	 * Get revenue metrics for the period
	 */
	private async getRevenueMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['revenue']> {
		const today = new Date();

		// Get all invoices created in the period (excluding concepts and cancelled)
		const invoices = await db.models.Invoice.find({
			companyId,
			deleted: { $ne: true },
			status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.CANCELLED] },
			invoice_date: { $gte: period.start, $lte: period.end },
		}).select('total_incl_vat status expiration_date payments').lean();

		let total = 0;
		let paid = 0;
		let outstanding = 0;
		let overdue = 0;

		for (const inv of invoices as any[]) {
			const amount = inv.total_incl_vat || 0;
			const paidAmount = (inv.payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

			total += amount;

			if (inv.status === INVOICE_STATUS.COMPLETED || paidAmount >= amount) {
				paid += amount;
			} else {
				const outstandingAmount = amount - paidAmount;
				outstanding += outstandingAmount;

				if (new Date(inv.expiration_date) < today) {
					overdue += outstandingAmount;
				}
			}
		}

		return { total, paid, outstanding, overdue };
	}

	/**
	 * Get invoice metrics for the period
	 */
	private async getInvoiceMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['invoices']> {
		const today = new Date();

		// Invoices created in the period
		const createdInvoices = await db.models.Invoice.find({
			companyId,
			deleted: { $ne: true },
			status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.CANCELLED] },
			invoice_date: { $gte: period.start, $lte: period.end },
		}).select('total_incl_vat status expiration_date payments').lean();

		const created = createdInvoices.length;
		let completed = 0;
		let outstanding = 0;
		let overdue = 0;
		let totalValue = 0;

		for (const inv of createdInvoices as any[]) {
			totalValue += inv.total_incl_vat || 0;
			const paidAmount = (inv.payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

			if (inv.status === INVOICE_STATUS.COMPLETED || paidAmount >= inv.total_incl_vat) {
				completed++;
			} else {
				outstanding++;
				if (new Date(inv.expiration_date) < today) {
					overdue++;
				}
			}
		}

		const averageValue = created > 0 ? totalValue / created : 0;

		return { created, completed, outstanding, overdue, averageValue };
	}

	/**
	 * Get quote metrics for the period
	 */
	private async getQuoteMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['quotes']> {
		// Quotes created in the period
		const quotes = await db.models.Quote.find({
			companyId,
			deleted: { $ne: true },
			status: { $nin: [QUOTE_STATUS.CONCEPT, QUOTE_STATUS.CANCELLED] },
			createdAt: { $gte: period.start, $lte: period.end },
		}).select('status').lean();

		const created = quotes.length;
		const confirmed = (quotes as any[]).filter(q =>
			q.status === QUOTE_STATUS.CONFIRMED || q.status === QUOTE_STATUS.COMPLETED
		).length;

		const conversionRate = created > 0 ? (confirmed / created) * 100 : 0;

		return { created, confirmed, conversionRate };
	}

	/**
	 * Get client metrics for the period
	 */
	private async getClientMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['clients']> {
		// Total active clients
		const totalClients = await db.models.Client.countDocuments({
			companyId,
			deleted: { $ne: true },
		});

		// New clients in the period
		const newClients = await db.models.Client.countDocuments({
			companyId,
			deleted: { $ne: true },
			createdAt: { $gte: period.start, $lte: period.end },
		});

		// Clients with outstanding invoices
		const clientsWithOutstanding = await db.models.Invoice.distinct('clientId', {
			companyId,
			deleted: { $ne: true },
			status: { $nin: [INVOICE_STATUS.CONCEPT, INVOICE_STATUS.COMPLETED, INVOICE_STATUS.CANCELLED] },
		});

		return {
			total: totalClients,
			newInPeriod: newClients,
			withOutstandingInvoices: clientsWithOutstanding.length,
		};
	}

	/**
	 * Get vehicle metrics
	 */
	private async getVehicleMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['vehicles']> {
		const today = new Date();
		const thirtyDaysFromNow = new Date(today);
		thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

		const totalVehicles = await db.models.Vehicle.countDocuments({
			companyId,
			deleted: { $ne: true },
		});

		const newVehicles = await db.models.Vehicle.countDocuments({
			companyId,
			deleted: { $ne: true },
			createdAt: { $gte: period.start, $lte: period.end },
		});

		const expiringSoon = await db.models.Vehicle.countDocuments({
			companyId,
			deleted: { $ne: true },
			apk_expiry: { $gte: today, $lte: thirtyDaysFromNow },
		});

		const expired = await db.models.Vehicle.countDocuments({
			companyId,
			deleted: { $ne: true },
			apk_expiry: { $lt: today },
		});

		return {
			total: totalVehicles,
			newInPeriod: newVehicles,
			apkExpiringSoon: expiringSoon,
			apkExpired: expired,
		};
	}

	/**
	 * Get appointment metrics for the period
	 */
	private async getAppointmentMetrics(companyId: string, period: PeriodRange): Promise<CompanyInsights['appointments']> {
		const created = await db.models.WorkshopAppointment.countDocuments({
			companyId,
			deleted: { $ne: true },
			createdAt: { $gte: period.start, $lte: period.end },
		});

		const completed = await db.models.WorkshopAppointment.countDocuments({
			companyId,
			deleted: { $ne: true },
			createdAt: { $gte: period.start, $lte: period.end },
			status: 'done',
		});

		return { created, completed };
	}

	/**
	 * Calculate comparison with previous period of same length
	 */
	private async getPeriodComparison(companyId: string, currentPeriod: PeriodRange): Promise<CompanyInsights['comparison']> {
		// Calculate previous period with same duration
		const periodDuration = currentPeriod.end.getTime() - currentPeriod.start.getTime();
		const previousPeriod: PeriodRange = {
			start: new Date(currentPeriod.start.getTime() - periodDuration),
			end: new Date(currentPeriod.end.getTime() - periodDuration),
			name: 'Previous Period',
		};

		const [currentRevenue, previousRevenue] = await Promise.all([
			this.getRevenueMetrics(companyId, currentPeriod),
			this.getRevenueMetrics(companyId, previousPeriod),
		]);

		const [currentInvoices, previousInvoices] = await Promise.all([
			this.getInvoiceMetrics(companyId, currentPeriod),
			this.getInvoiceMetrics(companyId, previousPeriod),
		]);

		const [currentClients, previousClients] = await Promise.all([
			this.getClientMetrics(companyId, currentPeriod),
			this.getClientMetrics(companyId, previousPeriod),
		]);

		const calculateTrend = (current: number, previous: number): number => {
			if (previous === 0) return current > 0 ? 100 : 0;
			return ((current - previous) / previous) * 100;
		};

		return {
			revenueTrend: calculateTrend(currentRevenue.total, previousRevenue.total),
			invoicesTrend: calculateTrend(currentInvoices.created, previousInvoices.created),
			clientsTrend: calculateTrend(currentClients.newInPeriod, previousClients.newInPeriod),
		};
	}
}
