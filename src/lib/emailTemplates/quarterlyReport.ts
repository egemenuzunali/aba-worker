/**
 * Quarterly open invoice report email template
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
	invoices: OpenInvoiceSummary[];
	frontendUrl: string;
}

const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR'
	}).format(amount);
};

const formatDate = (date: Date): string => {
	return new Date(date).toLocaleDateString('nl-NL');
};

const getOverdueClass = (daysOverdue: number): string => {
	if (daysOverdue > 30) return 'text-danger';
	if (daysOverdue > 0) return 'text-warning';
	return '';
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
		invoices,
		frontendUrl
	} = params;

	// Create invoice table rows (max 10 for email, full list in PDF)
	const displayInvoices = invoices.slice(0, 10);
	const hasMoreInvoices = invoices.length > 10;

	const invoiceRows = displayInvoices.map(inv => `
		<tr>
			<td>${inv.invoiceNumber}</td>
			<td>${inv.clientName}</td>
			<td>${formatDate(inv.invoiceDate)}</td>
			<td>${formatDate(inv.expirationDate)}</td>
			<td class="text-right">${formatCurrency(inv.totalAmount)}</td>
			<td class="text-right ${getOverdueClass(inv.daysOverdue)}">${inv.daysOverdue > 0 ? `${inv.daysOverdue} dagen` : '-'}</td>
		</tr>
	`).join('');

	const htmlContent = `
		<h1>Kwartaaloverzicht Openstaande Facturen</h1>

		<p>Beste ${ownerName},</p>

		<p>Hierbij ontvangt u het overzicht van openstaande facturen voor <strong>${companyName}</strong> per ${quarterName}.</p>

		<div class="info-card">
			<div class="card-title">📊 Samenvatting</div>
			<div class="card-content">
				<strong>Totaal openstaand:</strong> ${formatCurrency(totalOpenAmount)}<br>
				<strong>Aantal openstaande facturen:</strong> ${totalOpenInvoices}<br>
				<strong>Waarvan verlopen:</strong> ${overdueInvoices} facturen
			</div>
		</div>

		${overdueInvoices > 0 ? `
		<div class="warning-card">
			<div class="card-title">⚠️ Aandacht Vereist</div>
			<div class="card-content">
				<p>U heeft <strong>${overdueInvoices}</strong> verlopen ${overdueInvoices === 1 ? 'factuur' : 'facturen'}.
				Wij adviseren u om deze op te volgen via uw dashboard.</p>
			</div>
		</div>
		` : `
		<div class="success-card">
			<div class="card-title">✅ Goed Bezig!</div>
			<div class="card-content">
				<p>Geen van uw openstaande facturen is verlopen. Uitstekend betalingsmanagement!</p>
			</div>
		</div>
		`}

		${invoices.length > 0 ? `
		<h2>Openstaande Facturen</h2>
		<table class="invoice-table">
			<thead>
				<tr>
					<th>Factuurnr.</th>
					<th>Klant</th>
					<th>Datum</th>
					<th>Vervaldatum</th>
					<th class="text-right">Bedrag</th>
					<th class="text-right">Verlopen</th>
				</tr>
			</thead>
			<tbody>
				${invoiceRows}
			</tbody>
		</table>
		${hasMoreInvoices ? `<p><em>... en ${invoices.length - 10} overige facturen. Zie de bijgevoegde PDF voor het volledige overzicht.</em></p>` : ''}
		` : `
		<div class="success-card">
			<div class="card-title">🎉 Geen Openstaande Facturen</div>
			<div class="card-content">
				<p>Alle facturen zijn voldaan. Uitstekend werk!</p>
			</div>
		</div>
		`}

		<p>Het volledige overzicht vindt u in de bijgevoegde PDF.</p>

		<p>
			<a href="${frontendUrl}/facturen" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
				Bekijk in Dashboard
			</a>
		</p>

		<p>Met vriendelijke groet,<br>
		<strong>${process.env.APP_NAME || 'ABA'}</strong></p>
	`;

	return createEmailTemplate(htmlContent, companyName, companyLogo);
};
