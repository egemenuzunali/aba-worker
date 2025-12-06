/**
 * Email templates index for aba-worker
 */
export { quarterlyReportTemplate } from './quarterlyReport';
export type { QuarterlyReportParams, OpenInvoiceSummary } from './quarterlyReport';
export { monthlyInsightsTemplate } from './monthlyInsights';
export type { MonthlyInsightsParams } from './monthlyInsights';
export { modernBaseTemplate, generatePlainTextVersion, htmlToPlainText } from './modernBase';
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
	formatCurrency,
	formatPercentage,
} from './insightsComponents';
export type { StatCardOptions, InsightsEmailOptions } from './insightsComponents';
