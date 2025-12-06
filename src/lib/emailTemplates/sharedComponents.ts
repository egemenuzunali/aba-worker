/**
 * Shared email components for consistent styling across all email templates
 * Production-ready, email-client compatible HTML
 */

/**
 * Format currency in Dutch locale with 2 decimals
 */
export const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
};

/**
 * Color palette for consistent styling
 */
export const COLORS = {
	primary: '#667eea',
	success: '#28a745',
	warning: '#f57c00',
	danger: '#dc3545',
	text: '#2c3e50',
	textLight: '#666666',
	textMuted: '#888888',
	background: '#f8f9fa',
	border: '#e9ecef',
};

/**
 * Trend badge component showing percentage change with arrow
 */
export const trendBadge = (percentage: number | undefined): string => {
	if (percentage === undefined || percentage === 0) return '';
	const arrow = percentage > 0 ? '↑' : '↓';
	const color = percentage > 0 ? COLORS.success : COLORS.danger;
	const value = Math.abs(Math.round(percentage));
	return `<span style="font-size: 11px; font-weight: 600; color: ${color};">${arrow}${value}%</span>`;
};

/**
 * Stat box component - the core building block for email stats
 * Email-client compatible with table-based layout
 */
export interface StatBoxOptions {
	value: string;
	label: string;
	color?: string;
	trend?: number;
}

export const statBox = (options: StatBoxOptions): string => {
	const { value, label, color, trend } = options;
	const valueColor = color || COLORS.text;
	const hasTrend = trend !== undefined && trend !== 0;

	return `
		<td class="stat-box-cell" style="padding: 4px; width: 50%;">
			<div class="stat-box-inner" style="background: ${COLORS.background}; border-radius: 6px; padding: 12px 8px; text-align: center;">
				<div class="stat-box-value" style="font-size: 18px; font-weight: 600; color: ${valueColor}; word-break: break-word; margin-bottom: 4px;">${value}</div>
				<div class="stat-box-label" style="font-size: 12px; color: ${COLORS.textMuted};">${label}</div>
				<div style="font-size: 11px; font-weight: 600; margin-top: 4px; min-height: 14px;">${hasTrend ? trendBadge(trend) : '&nbsp;'}</div>
			</div>
		</td>
	`;
};

/**
 * Section header for grouping stats
 */
export const sectionHeader = (title: string): string => `
	<tr>
		<td colspan="2" style="padding: 16px 4px 8px 4px;">
			<div style="font-size: 12px; font-weight: 600; color: ${COLORS.primary}; text-transform: uppercase; letter-spacing: 0.5px;">${title}</div>
		</td>
	</tr>
`;

/**
 * Empty cell placeholder for odd number of boxes
 */
export const emptyCell = (): string => `<td style="padding: 4px;"></td>`;

/**
 * Greeting paragraph
 */
export const greeting = (name: string): string =>
	`<p style="font-size: 15px; line-height: 1.5; color: ${COLORS.text};">Beste ${name},</p>`;

/**
 * Intro paragraph
 */
export const introParagraph = (text: string): string =>
	`<p style="font-size: 14px; line-height: 1.6; color: ${COLORS.text};">${text}</p>`;

/**
 * Signature block
 */
export const signature = (): string => `
	<p style="margin-top: 28px; font-size: 14px; color: ${COLORS.textLight};">
		Met vriendelijke groet,<br>
		<strong>${process.env.APP_NAME || 'ABA'}</strong>
	</p>
`;

/**
 * Stats table wrapper - use this to wrap stat box rows
 */
export const statsTable = (content: string): string => `
	<table class="stat-box-table" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; table-layout: fixed;">
		${content}
	</table>
`;

/**
 * Helper to create a row of two stat boxes
 */
export const statRow = (box1: StatBoxOptions, box2?: StatBoxOptions): string => `
	<tr>
		${statBox(box1)}
		${box2 ? statBox(box2) : emptyCell()}
	</tr>
`;
