/**
 * Quarterly open invoice report email template
 * Focuses on outstanding and overdue invoices analysis
 */
import { modernBaseTemplate, generatePlainTextVersion } from "./modernBase";
import { formatCurrency, statCardGrid, StatCardOptions } from "./insightsComponents";

export interface OpenInvoiceSummary {
	invoiceNumber: number;
	clientName: string;
	invoiceDate: Date;
	expirationDate: Date;
	totalAmount: number;
	daysOverdue: number;
}

export interface QuarterlyReportParams {
	ownerName: string;
	companyName: string;
	companyLogo?: string;
	quarterName: string;
	totalOpenAmount: number;
	totalOpenInvoices: number;
	overdueInvoices: number;
	overdueAmount: number;
	invoices: OpenInvoiceSummary[];
	frontendUrl: string;
}

const createEmailTemplate = (htmlContent: string, companyName: string, companyLogo?: string) => {
	return {
		html: modernBaseTemplate(htmlContent, companyName, 'standard', companyLogo),
		text: generatePlainTextVersion(htmlContent, companyName)
	};
};

export const quarterlyReportTemplate = (params: QuarterlyReportParams) => {
	const {
		ownerName,
		companyName,
		companyLogo,
		quarterName,
		totalOpenAmount,
		totalOpenInvoices,
		overdueInvoices,
		overdueAmount,
		invoices,
		frontendUrl,
	} = params;

	// Summary cards
	const summaryCards: StatCardOptions[] = [
		{
			icon: '📋',
			label: 'Openstaande Facturen',
			value: totalOpenInvoices.toString(),
			color: totalOpenInvoices > 0 ? 'warning' : 'success',
		},
		{
			icon: '💰',
			label: 'Totaal Openstaand',
			value: formatCurrency(totalOpenAmount),
			color: totalOpenAmount > 0 ? 'warning' : 'success',
		},
		{
			icon: '⚠️',
			label: 'Verlopen Facturen',
			value: overdueInvoices.toString(),
			color: overdueInvoices > 0 ? 'danger' : 'success',
		},
		{
			icon: '🚨',
			label: 'Verlopen Bedrag',
			value: formatCurrency(overdueAmount),
			color: overdueAmount > 0 ? 'danger' : 'success',
		},
	];

	const htmlContent = `
		<h1>Kwartaaloverzicht Facturen</h1>

		<p>Beste ${ownerName},</p>

		<p>Hierbij ontvangt u het overzicht van openstaande facturen voor <strong>${companyName}</strong> over <strong>${quarterName}</strong>. Het volledige overzicht van openstaande facturen vindt u in de bijgevoegde PDF.</p>

		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Samenvatting</h2>
		${statCardGrid(summaryCards)}

		<p style="margin-top: 24px;">Met vriendelijke groet,<br>
		<strong>${process.env.APP_NAME || 'ABA'}</strong></p>
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
