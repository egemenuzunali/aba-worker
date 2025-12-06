/**
 * Monthly insights email template
 * Comprehensive business overview with trends
 */
import { modernBaseTemplate, generatePlainTextVersion } from "./modernBase";
import { CompanyInsights } from "../../services/CompanyInsightsService";
import {
	formatCurrency,
	COLORS,
	statBox,
	sectionHeader,
	emptyCell,
	greeting,
	introParagraph,
	signature,
	statsTable,
} from "./sharedComponents";

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

export const monthlyInsightsTemplate = (params: MonthlyInsightsParams) => {
	const {
		ownerName,
		companyName,
		companyLogo,
		monthName,
		insights,
	} = params;

	const comp = insights.comparison;

	const conversionRate = insights.quotes.created > 0
		? Math.round((insights.quotes.confirmed / insights.quotes.created) * 100)
		: 0;

	const htmlContent = `
		${greeting(ownerName)}

		${introParagraph(`Hieronder vindt u het maandoverzicht van <strong>${companyName}</strong> over <strong>${monthName}</strong>.`)}

		${statsTable(`
			${sectionHeader('Omzet')}
			<tr>
				${statBox({ value: formatCurrency(insights.revenue.total), label: 'Totaal', trend: comp?.revenueTrend })}
				${statBox({ value: formatCurrency(insights.revenue.paid), label: 'Ontvangen', color: COLORS.success })}
			</tr>
			<tr>
				${statBox({ value: formatCurrency(insights.revenue.outstanding), label: 'Openstaand', color: insights.revenue.outstanding > 0 ? COLORS.warning : COLORS.success })}
				${statBox({ value: formatCurrency(insights.revenue.overdue), label: 'Verlopen', color: insights.revenue.overdue > 0 ? COLORS.danger : COLORS.success })}
			</tr>

			${sectionHeader('Facturen')}
			<tr>
				${statBox({ value: insights.invoices.created.toString(), label: 'Gemaakt', trend: comp?.invoicesTrend })}
				${statBox({ value: insights.invoices.outstanding.toString(), label: 'Openstaand', color: insights.invoices.outstanding > 0 ? COLORS.warning : undefined })}
			</tr>
			<tr>
				${statBox({ value: insights.invoices.overdue.toString(), label: 'Verlopen', color: insights.invoices.overdue > 0 ? COLORS.danger : undefined })}
				${statBox({ value: formatCurrency(insights.invoices.averageValue), label: 'Gem. waarde' })}
			</tr>

			${sectionHeader('Offertes')}
			<tr>
				${statBox({ value: insights.quotes.created.toString(), label: 'Verstuurd', trend: comp?.quotesTrend })}
				${statBox({ value: insights.quotes.confirmed.toString(), label: 'Geaccepteerd', color: insights.quotes.confirmed > 0 ? COLORS.success : undefined })}
			</tr>
			<tr>
				${statBox({ value: `${conversionRate}%`, label: 'Conversie', color: conversionRate >= 50 ? COLORS.success : undefined })}
				${emptyCell()}
			</tr>

			${sectionHeader('Werkbonnen')}
			<tr>
				${statBox({ value: insights.workOrders.created.toString(), label: 'Aangemaakt', trend: comp?.workOrdersTrend })}
				${statBox({ value: insights.workOrders.completed.toString(), label: 'Afgerond', color: insights.workOrders.completed > 0 ? COLORS.success : undefined })}
			</tr>
			<tr>
				${statBox({ value: insights.workOrders.inProgress.toString(), label: 'In behandeling' })}
				${statBox({ value: formatCurrency(insights.workOrders.totalValue), label: 'Totale waarde' })}
			</tr>

			${sectionHeader('Afspraken')}
			<tr>
				${statBox({ value: insights.appointments.created.toString(), label: 'Gepland', trend: comp?.appointmentsTrend })}
				${statBox({ value: insights.appointments.completed.toString(), label: 'Afgerond', color: insights.appointments.completed > 0 ? COLORS.success : undefined })}
			</tr>

			${sectionHeader('Klanten & Voertuigen')}
			<tr>
				${statBox({ value: insights.clients.newInPeriod.toString(), label: 'Nieuwe klanten', trend: comp?.clientsTrend })}
				${statBox({ value: insights.vehicles.newInPeriod.toString(), label: 'Nieuwe voertuigen', trend: comp?.vehiclesTrend })}
			</tr>
			<tr>
				${statBox({ value: insights.clients.total.toString(), label: 'Totaal klanten' })}
				${statBox({ value: insights.vehicles.total.toString(), label: 'Totaal voertuigen' })}
			</tr>
		`)}

		${signature()}
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
