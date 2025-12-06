/**
 * Quarterly open invoice report email template
 * Focuses on outstanding and overdue invoices analysis
 */
import { modernBaseTemplate, generatePlainTextVersion } from "./modernBase";

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

const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
};

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
	} = params;

	// Clean box component matching monthly insights style
	const box = (label: string, value: string, color?: string, subtext?: string) => `
		<td style="padding: 6px;">
			<div style="background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center;">
				<div style="font-size: 20px; font-weight: 600; color: ${color || '#2c3e50'}; margin-bottom: 4px;">${value}</div>
				${subtext ? `<div style="font-size: 10px; color: #aaa; margin-bottom: 2px;">${subtext}</div>` : ''}
				<div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
			</div>
		</td>
	`;

	const htmlContent = `
		<p>Beste ${ownerName},</p>

		<p>Hierbij ontvangt u het overzicht van openstaande facturen voor <strong>${companyName}</strong> over <strong>${quarterName}</strong>. Het volledige overzicht van openstaande facturen vindt u in de bijgevoegde PDF.</p>

		<table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
			<tr>
				${box('Openstaande facturen', totalOpenInvoices.toString(), totalOpenInvoices > 0 ? '#f57c00' : '#28a745')}
				${box('Totaal openstaand', formatCurrency(totalOpenAmount), totalOpenAmount > 0 ? '#f57c00' : '#28a745')}
			</tr>
			<tr>
				${box('Verlopen facturen', overdueInvoices.toString(), overdueInvoices > 0 ? '#dc3545' : '#28a745')}
				${box('Verlopen bedrag', formatCurrency(overdueAmount), overdueAmount > 0 ? '#dc3545' : '#28a745')}
			</tr>
		</table>

		<p style="margin-top: 24px; color: #666;">
			Met vriendelijke groet,<br>
			${process.env.APP_NAME || 'ABA'}
		</p>
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
