/**
 * Monthly insights email template
 * Clean, professional CRM-style design
 */
import { modernBaseTemplate, generatePlainTextVersion } from "./modernBase";
import { CompanyInsights } from "../../services/CompanyInsightsService";

export interface MonthlyInsightsParams {
	ownerName: string;
	companyName: string;
	companyLogo?: string;
	monthName: string;
	insights: CompanyInsights;
	frontendUrl: string;
}

const createEmailTemplate = (htmlContent: string, companyName: string, companyLogo?: string) => {
	return {
		html: modernBaseTemplate(htmlContent, companyName, 'standard', companyLogo),
		text: generatePlainTextVersion(htmlContent, companyName)
	};
};

const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

export const monthlyInsightsTemplate = (params: MonthlyInsightsParams) => {
	const {
		ownerName,
		companyName,
		companyLogo,
		monthName,
		insights,
		frontendUrl,
	} = params;

	const box = (label: string, value: string, color?: string, subtext?: string) => `
		<td style="padding: 6px;">
			<div style="background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center;">
				<div style="font-size: 20px; font-weight: 600; color: ${color || '#2c3e50'}; margin-bottom: 4px;">${value}</div>
				${subtext ? `<div style="font-size: 10px; color: #aaa; margin-bottom: 2px;">${subtext}</div>` : ''}
				<div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
			</div>
		</td>
	`;

	const conversionRate = insights.quotes.created > 0
		? Math.round((insights.quotes.confirmed / insights.quotes.created) * 100)
		: 0;

	const htmlContent = `
		<p>Beste ${ownerName},</p>

		<p>Hieronder vindt u het overzicht van <strong>${companyName}</strong> over <strong>${monthName}</strong>.</p>

		<table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
			<tr>
				${box('Totale omzet', formatCurrency(insights.revenue.total))}
				${box('Ontvangen', formatCurrency(insights.revenue.paid), '#28a745')}
			</tr>
			<tr>
				${box(`${insights.invoices.outstanding} facturen open`, formatCurrency(insights.revenue.outstanding), insights.invoices.outstanding > 0 ? '#f57c00' : '#28a745')}
				${box(`${insights.invoices.overdue} facturen verlopen`, formatCurrency(insights.revenue.overdue), insights.invoices.overdue > 0 ? '#dc3545' : '#28a745')}
			</tr>
			<tr>
				${box(`${insights.invoices.created} facturen gemaakt`, formatCurrency(insights.invoices.averageValue), undefined, 'gem. waarde')}
				${box(`${insights.quotes.created} offertes verstuurd`, `${insights.quotes.confirmed} geaccepteerd`, insights.quotes.confirmed > 0 ? '#28a745' : undefined)}
			</tr>
			<tr>
				${box(`${insights.clients.newInPeriod} nieuwe klanten`, insights.clients.total.toString(), undefined, 'totaal')}
				${box(`${insights.vehicles.newInPeriod} nieuwe voertuigen`, insights.vehicles.total.toString(), undefined, 'totaal')}
			</tr>
			<tr>
				${box(`${insights.appointments.created} afspraken`, `${insights.appointments.completed} afgerond`, insights.appointments.completed > 0 ? '#28a745' : undefined)}
				<td style="padding: 6px;"></td>
			</tr>
		</table>

		<p style="margin-top: 24px; color: #666;">
			Met vriendelijke groet,<br>
			${process.env.APP_NAME || 'ABA'}
		</p>
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
