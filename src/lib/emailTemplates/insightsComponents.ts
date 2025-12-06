/**
 * Reusable email components for company insights
 * Used by quarterly reports, monthly insights, and other analytics emails
 */

import { CompanyInsights } from '../../services/CompanyInsightsService';

/**
 * Format currency in Dutch locale
 */
export const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

/**
 * Format percentage with sign
 */
export const formatPercentage = (value: number, includeSign: boolean = true): string => {
	const formatted = Math.round(value);
	if (includeSign && value > 0) return `+${formatted}%`;
	return `${formatted}%`;
};

/**
 * Get trend indicator (arrow and color)
 */
export const getTrendIndicator = (value: number): { arrow: string; color: string; class: string } => {
	if (value > 0) {
		return { arrow: '&#8593;', color: '#28a745', class: 'trend-up' }; // Up arrow
	} else if (value < 0) {
		return { arrow: '&#8595;', color: '#dc3545', class: 'trend-down' }; // Down arrow
	}
	return { arrow: '&#8596;', color: '#6c757d', class: 'trend-neutral' }; // Horizontal arrow
};

/**
 * Generate a single stat card (as a table cell for email compatibility)
 */
export interface StatCardOptions {
	icon: string;
	label: string;
	value: string;
	subtext?: string;
	trend?: number;
	color?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export const statCard = (options: StatCardOptions): string => {
	const { icon, label, value, subtext, trend, color = 'primary' } = options;

	const colorMap = {
		primary: { bg: '#f0f3ff', border: '#d4dcf7', accent: '#667eea' },
		success: { bg: '#e8f5e9', border: '#c8e6c9', accent: '#28a745' },
		warning: { bg: '#fff8e1', border: '#ffecb3', accent: '#f57c00' },
		danger: { bg: '#ffebee', border: '#ffcdd2', accent: '#dc3545' },
		neutral: { bg: '#f5f5f5', border: '#e0e0e0', accent: '#6c757d' },
	};

	const colors = colorMap[color];
	const trendHtml = trend !== undefined ? `
		<span style="font-size: 10px; color: ${getTrendIndicator(trend).color};">
			${getTrendIndicator(trend).arrow} ${formatPercentage(trend)}
		</span>
	` : '';

	return `
		<td style="padding: 4px;">
			<div style="background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 4px; padding: 6px 4px; text-align: center;">
				<div style="font-size: 14px; margin-bottom: 2px;">${icon}</div>
				<div style="font-size: 13px; font-weight: 700; color: ${colors.accent};">
					${value}
				</div>
				${trendHtml ? `<div>${trendHtml}</div>` : ''}
				<div style="font-size: 9px; color: #6c757d; font-weight: 500;">${label}</div>
				${subtext ? `<div style="font-size: 8px; color: #868e96;">${subtext}</div>` : ''}
			</div>
		</td>
	`;
};

/**
 * Generate a grid of stat cards using tables (email-compatible)
 * Cards are arranged in rows of 2
 */
export const statCardGrid = (cards: StatCardOptions[]): string => {
	const rows: string[] = [];

	for (let i = 0; i < cards.length; i += 2) {
		const card1 = statCard(cards[i]);
		const card2 = cards[i + 1] ? statCard(cards[i + 1]) : '<td style="width: 50%;"></td>';

		rows.push(`
			<tr>
				${card1}
				${card2}
			</tr>
		`);
	}

	return `
		<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0;">
			${rows.join('')}
		</table>
	`;
};

/**
 * Legacy function - wraps cards in a grid
 * @deprecated Use statCardGrid instead
 */
export const statCardRow = (cards: string[]): string => {
	return `
		<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
			<tr>
				${cards.map((card, i) => `${card}${i < cards.length - 1 ? '<td style="width: 12px;"></td>' : ''}`).join('')}
			</tr>
		</table>
	`;
};

/**
 * Generate the revenue overview section
 */
export const revenueOverview = (insights: CompanyInsights): string => {
	const cards: StatCardOptions[] = [
		{
			icon: '💰',
			label: 'Totale Omzet',
			value: formatCurrency(insights.revenue.total),
			trend: insights.comparison?.revenueTrend,
			color: 'primary',
		},
		{
			icon: '✅',
			label: 'Ontvangen',
			value: formatCurrency(insights.revenue.paid),
			color: 'success',
		},
		{
			icon: '📋',
			label: 'Openstaand',
			value: formatCurrency(insights.revenue.outstanding),
			color: insights.revenue.outstanding > 0 ? 'warning' : 'success',
		},
		{
			icon: '⚠️',
			label: 'Verlopen',
			value: formatCurrency(insights.revenue.overdue),
			color: insights.revenue.overdue > 0 ? 'danger' : 'success',
		},
	];

	return `
		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Omzet Overzicht</h2>
		${statCardGrid(cards)}
	`;
};

/**
 * Generate the invoices overview section
 */
export const invoicesOverview = (insights: CompanyInsights): string => {
	const cards: StatCardOptions[] = [
		{
			icon: '📄',
			label: 'Facturen Verstuurd',
			value: insights.invoices.created.toString(),
			trend: insights.comparison?.invoicesTrend,
			color: 'primary',
		},
		{
			icon: '✅',
			label: 'Afgerond',
			value: insights.invoices.completed.toString(),
			color: 'success',
		},
		{
			icon: '📊',
			label: 'Gemiddelde Waarde',
			value: formatCurrency(insights.invoices.averageValue),
			color: 'neutral',
		},
		{
			icon: '⏳',
			label: 'Openstaand',
			value: insights.invoices.outstanding.toString(),
			color: insights.invoices.outstanding > 0 ? 'warning' : 'success',
		},
	];

	return `
		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Facturen</h2>
		${statCardGrid(cards)}
	`;
};

/**
 * Generate the quotes overview section
 */
export const quotesOverview = (insights: CompanyInsights): string => {
	const conversionColor = insights.quotes.conversionRate >= 50 ? 'success' :
		insights.quotes.conversionRate >= 25 ? 'warning' : 'neutral';

	const cards: StatCardOptions[] = [
		{
			icon: '📝',
			label: 'Offertes Verstuurd',
			value: insights.quotes.created.toString(),
			color: 'primary',
		},
		{
			icon: '🤝',
			label: 'Geaccepteerd',
			value: insights.quotes.confirmed.toString(),
			color: 'success',
		},
		{
			icon: '📈',
			label: 'Conversieratio',
			value: formatPercentage(insights.quotes.conversionRate, false),
			color: conversionColor,
		},
		{
			icon: '❌',
			label: 'Niet Geaccepteerd',
			value: (insights.quotes.created - insights.quotes.confirmed).toString(),
			color: 'neutral',
		},
	];

	return `
		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Offertes</h2>
		${statCardGrid(cards)}
	`;
};

/**
 * Generate the clients overview section
 */
export const clientsOverview = (insights: CompanyInsights): string => {
	const cards: StatCardOptions[] = [
		{
			icon: '👥',
			label: 'Totaal Klanten',
			value: insights.clients.total.toString(),
			color: 'primary',
		},
		{
			icon: '🆕',
			label: 'Nieuwe Klanten',
			value: insights.clients.newInPeriod.toString(),
			trend: insights.comparison?.clientsTrend,
			color: 'success',
		},
	];

	return `
		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Klanten</h2>
		${statCardGrid(cards)}
	`;
};

/**
 * Generate the vehicles overview section (only if company has vehicles)
 */
export const vehiclesOverview = (insights: CompanyInsights): string => {
	if (insights.vehicles.total === 0) return '';

	const cards: StatCardOptions[] = [
		{
			icon: '🚗',
			label: 'Totaal Voertuigen',
			value: insights.vehicles.total.toString(),
			color: 'primary',
		},
		{
			icon: '⏰',
			label: 'APK Verloopt Binnenkort',
			value: insights.vehicles.apkExpiringSoon.toString(),
			subtext: 'binnen 30 dagen',
			color: insights.vehicles.apkExpiringSoon > 0 ? 'warning' : 'success',
		},
		{
			icon: '🚨',
			label: 'APK Verlopen',
			value: insights.vehicles.apkExpired.toString(),
			color: insights.vehicles.apkExpired > 0 ? 'danger' : 'success',
		},
		{
			icon: '✅',
			label: 'APK in Orde',
			value: (insights.vehicles.total - insights.vehicles.apkExpired - insights.vehicles.apkExpiringSoon).toString(),
			color: 'success',
		},
	];

	return `
		<h2 style="color: #2c3e50; font-size: 18px; font-weight: 600; margin: 28px 0 12px 0;">Voertuigen</h2>
		${statCardGrid(cards)}
	`;
};

/**
 * Generate a highlight card for important metrics
 */
export const highlightCard = (title: string, message: string, type: 'success' | 'warning' | 'info'): string => {
	const typeMap = {
		success: { bg: '#e8f5e9', border: '#28a745', icon: '✅', textColor: '#1b5e20' },
		warning: { bg: '#fff8e1', border: '#f57c00', icon: '⚠️', textColor: '#e65100' },
		info: { bg: '#f0f3ff', border: '#667eea', icon: 'ℹ️', textColor: '#3949ab' },
	};

	const style = typeMap[type];

	return `
		<div style="background: ${style.bg}; border-left: 4px solid ${style.border}; border-radius: 8px; padding: 16px; margin: 16px 0;">
			<div style="font-weight: 600; font-size: 15px; margin-bottom: 6px; color: ${style.textColor};">
				${style.icon} ${title}
			</div>
			<p style="margin: 0; color: #34495e; font-size: 13px; line-height: 1.5;">${message}</p>
		</div>
	`;
};

/**
 * Generate a complete insights email body
 */
export interface InsightsEmailOptions {
	ownerName: string;
	companyName: string;
	insights: CompanyInsights;
	introText?: string;
	showRevenue?: boolean;
	showInvoices?: boolean;
	showQuotes?: boolean;
	showClients?: boolean;
	showVehicles?: boolean;
	showHighlights?: boolean;
	ctaUrl?: string;
	ctaText?: string;
}

export const generateInsightsEmailContent = (options: InsightsEmailOptions): string => {
	const {
		ownerName,
		companyName,
		insights,
		introText,
		showRevenue = true,
		showInvoices = true,
		showQuotes = true,
		showClients = true,
		showVehicles = true,
		showHighlights = true,
		ctaUrl,
		ctaText = 'Bekijk in Dashboard',
	} = options;

	const defaultIntro = `Hierbij ontvangt u het overzicht voor <strong>${companyName}</strong> over ${insights.period.name}.`;

	let sections = '';

	if (showRevenue) sections += revenueOverview(insights);
	if (showInvoices) sections += invoicesOverview(insights);
	if (showQuotes && insights.quotes.created > 0) sections += quotesOverview(insights);
	if (showClients) sections += clientsOverview(insights);
	if (showVehicles && insights.vehicles.total > 0) sections += vehiclesOverview(insights);

	// Generate highlights based on data
	let highlights = '';

	if (showHighlights) {
		if (insights.revenue.overdue > 0) {
			highlights += highlightCard(
				'Aandacht Vereist',
				`U heeft ${formatCurrency(insights.revenue.overdue)} aan verlopen facturen. Wij adviseren u om deze op te volgen.`,
				'warning'
			);
		} else if (insights.invoices.outstanding === 0 && insights.invoices.created > 0) {
			highlights += highlightCard(
				'Uitstekend!',
				'Alle facturen van deze periode zijn betaald. Goed betalingsmanagement!',
				'success'
			);
		}

		if (insights.quotes.conversionRate >= 50 && insights.quotes.created >= 3) {
			highlights += highlightCard(
				'Sterke Conversie',
				`Met een conversieratio van ${formatPercentage(insights.quotes.conversionRate, false)} presteert u bovengemiddeld!`,
				'success'
			);
		}
	}

	const ctaButton = ctaUrl ? `
		<p style="margin-top: 30px;">
			<a href="${ctaUrl}" style="display: inline-block; padding: 14px 28px; background-color: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
				${ctaText}
			</a>
		</p>
	` : '';

	return `
		<p>Beste ${ownerName},</p>
		<p>${introText || defaultIntro}</p>

		${sections}

		${highlights}

		${ctaButton}

		<p style="margin-top: 30px;">Met vriendelijke groet,<br>
		<strong>${process.env.APP_NAME || 'ABA'}</strong></p>
	`;
};
