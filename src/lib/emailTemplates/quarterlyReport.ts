/**
 * Quarterly invoice report email template
 * Focused on open and overdue invoices analysis
 */
import { modernBaseTemplate, generatePlainTextVersion } from "./modernBase";
import {
	formatCurrency,
	COLORS,
	statBox,
	sectionHeader,
	greeting,
	introParagraph,
	signature,
	statsTable,
} from "./sharedComponents";

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
	} = params;

	const htmlContent = `
		${greeting(ownerName)}

		${introParagraph(`Hierbij ontvangt u het kwartaaloverzicht van openstaande facturen voor <strong>${companyName}</strong> over <strong>${quarterName}</strong>. Het volledige overzicht vindt u in de bijgevoegde PDF.`)}

		${statsTable(`
			${sectionHeader('Openstaande Facturen')}
			<tr>
				${statBox({ value: totalOpenInvoices.toString(), label: 'Aantal openstaand', color: totalOpenInvoices > 0 ? COLORS.warning : COLORS.success })}
				${statBox({ value: formatCurrency(totalOpenAmount), label: 'Totaal openstaand', color: totalOpenAmount > 0 ? COLORS.warning : COLORS.success })}
			</tr>

			${sectionHeader('Verlopen Facturen')}
			<tr>
				${statBox({ value: overdueInvoices.toString(), label: 'Aantal verlopen', color: overdueInvoices > 0 ? COLORS.danger : COLORS.success })}
				${statBox({ value: formatCurrency(overdueAmount), label: 'Totaal verlopen', color: overdueAmount > 0 ? COLORS.danger : COLORS.success })}
			</tr>
		`)}

		${signature()}
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
