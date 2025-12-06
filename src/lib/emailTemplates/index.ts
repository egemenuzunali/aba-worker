/**
 * Email templates index for aba-worker
 */

// Main templates
export { quarterlyReportTemplate } from './quarterlyReport';
export type { QuarterlyReportParams, OpenInvoiceSummary } from './quarterlyReport';
export { monthlyInsightsTemplate } from './monthlyInsights';
export type { MonthlyInsightsParams } from './monthlyInsights';

// Base template
export { modernBaseTemplate, generatePlainTextVersion, htmlToPlainText } from './modernBase';

// Shared components (production)
export {
	formatCurrency,
	COLORS,
	trendBadge,
	statBox,
	sectionHeader,
	emptyCell,
	greeting,
	introParagraph,
	signature,
	statsTable,
	statRow,
} from './sharedComponents';
export type { StatBoxOptions } from './sharedComponents';

// Legacy components (deprecated - use sharedComponents instead)
export {
	generateInsightsEmailContent,
	statCard,
	statCardGrid,
	statCardRow,
	revenueOverview,
	invoicesOverview,
	quotesOverview,
	clientsOverview,
	vehiclesOverview,
	highlightCard,
	formatPercentage,
} from './insightsComponents';
export type { StatCardOptions, InsightsEmailOptions } from './insightsComponents';
