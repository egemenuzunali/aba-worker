import { Schema, model } from 'mongoose';

// Partial schema for aba-worker - only includes fields actually used by the worker service
interface System {
	_id: string;
	lastRdwSync: Date;
	lastWeeklyMaintenanceCheck: Date;
	lastQuoteExpiryCheck: Date;
	lastInvoiceExpiryCheck: Date;
	lastPurchaseInvoiceExpiryCheck: Date;
	lastApkStatusCheck: Date;
	lastQuarterlyReportSent: Date;
	lastQuarterlyReportQuarter: string; // e.g., "Q1 2025" - tracks which quarter was last processed
	lastMonthlyInsightsSent: Date;
	lastMonthlyInsightsMonth: string; // e.g., "December 2025" - tracks which month was last processed
	createdAt: Date;
	updatedAt: Date;
}

const systemSchema = new Schema<System>(
	{
		lastRdwSync: {
			type: Date,
			required: false,
		},
		lastWeeklyMaintenanceCheck: {
			type: Date,
			required: false,
		},
		lastQuoteExpiryCheck: {
			type: Date,
			required: false,
		},
		lastInvoiceExpiryCheck: {
			type: Date,
			required: false,
		},
		lastPurchaseInvoiceExpiryCheck: {
			type: Date,
			required: false,
		},
		lastApkStatusCheck: {
			type: Date,
			required: false,
		},
		lastQuarterlyReportSent: {
			type: Date,
			required: false,
		},
		lastQuarterlyReportQuarter: {
			type: String,
			required: false,
		},
		lastMonthlyInsightsSent: {
			type: Date,
			required: false,
		},
		lastMonthlyInsightsMonth: {
			type: String,
			required: false,
		},
	},
	{
		timestamps: true,
	}
);

export default model<System>('System', systemSchema);
