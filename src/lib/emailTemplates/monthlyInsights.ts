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
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
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

	const box = (value: string, label: string, color?: string) => `
		<td style="padding: 3px;">
			<div style="background: #f8f9fa; border-radius: 6px; padding: 10px 8px; text-align: center;">
				<div style="font-size: 16px; font-weight: 600; color: ${color || '#2c3e50'}; margin-bottom: 2px;">${value}</div>
				<div style="font-size: 10px; color: #888;">${label}</div>
			</div>
		</td>
	`;

	const conversionRate = insights.quotes.created > 0
		? Math.round((insights.quotes.confirmed / insights.quotes.created) * 100)
		: 0;

	const sectionHeader = (title: string) => `
		<tr>
			<td colspan="2" style="padding: 12px 3px 4px 3px;">
				<div style="font-size: 10px; font-weight: 600; color: #667eea; text-transform: uppercase; letter-spacing: 0.5px;">${title}</div>
			</td>
		</tr>
	`;

	const htmlContent = `
		<p>Beste ${ownerName},</p>

		<p>Hieronder vindt u het overzicht van <strong>${companyName}</strong> over <strong>${monthName}</strong>.</p>

		<table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px auto; max-width: 600px;">
			${sectionHeader('Omzet')}
			<tr>
				${box(formatCurrency(insights.revenue.total), 'Totaal')}
				${box(formatCurrency(insights.revenue.paid), 'Ontvangen', '#28a745')}
			</tr>
			<tr>
				${box(formatCurrency(insights.revenue.outstanding), 'Openstaand', insights.revenue.outstanding > 0 ? '#f57c00' : '#28a745')}
				${box(formatCurrency(insights.revenue.overdue), 'Verlopen', insights.revenue.overdue > 0 ? '#dc3545' : '#28a745')}
			</tr>

			${sectionHeader('Facturen')}
			<tr>
				${box(insights.invoices.created.toString(), 'Gemaakt')}
				${box(insights.invoices.outstanding.toString(), 'Openstaand', insights.invoices.outstanding > 0 ? '#f57c00' : undefined)}
			</tr>
			<tr>
				${box(insights.invoices.overdue.toString(), 'Verlopen', insights.invoices.overdue > 0 ? '#dc3545' : undefined)}
				${box(formatCurrency(insights.invoices.averageValue), 'Gem. waarde')}
			</tr>

			${sectionHeader('Offertes')}
			<tr>
				${box(insights.quotes.created.toString(), 'Verstuurd')}
				${box(insights.quotes.confirmed.toString(), 'Geaccepteerd', insights.quotes.confirmed > 0 ? '#28a745' : undefined)}
			</tr>
			<tr>
				${box(`${conversionRate}%`, 'Conversie', conversionRate >= 50 ? '#28a745' : undefined)}
				<td style="padding: 6px;"></td>
			</tr>

			${sectionHeader('Werkbonnen')}
			<tr>
				${box(insights.workOrders.created.toString(), 'Aangemaakt')}
				${box(insights.workOrders.completed.toString(), 'Afgerond', insights.workOrders.completed > 0 ? '#28a745' : undefined)}
			</tr>
			<tr>
				${box(insights.workOrders.inProgress.toString(), 'In behandeling')}
				${box(formatCurrency(insights.workOrders.totalValue), 'Totale waarde')}
			</tr>

			${sectionHeader('Afspraken')}
			<tr>
				${box(insights.appointments.created.toString(), 'Gepland')}
				${box(insights.appointments.completed.toString(), 'Afgerond', insights.appointments.completed > 0 ? '#28a745' : undefined)}
			</tr>

			${sectionHeader('Klanten & Voertuigen')}
			<tr>
				${box(insights.clients.newInPeriod.toString(), 'Nieuwe klanten')}
				${box(insights.vehicles.newInPeriod.toString(), 'Nieuwe voertuigen')}
			</tr>
			<tr>
				${box(insights.clients.total.toString(), 'Totaal klanten')}
				${box(insights.vehicles.total.toString(), 'Totaal voertuigen')}
			</tr>
		</table>

		<p style="margin-top: 24px; color: #666;">
			Met vriendelijke groet,<br>
			${process.env.APP_NAME || 'ABA'}
		</p>
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
