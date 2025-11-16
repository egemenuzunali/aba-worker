import { Schema, model } from 'mongoose';

// Partial schema for aba-worker - only includes fields actually used by the worker service
interface System {
	_id: string;
	lastRdwSync: Date;
	lastWeeklyMaintenanceCheck: Date;
	lastQuoteExpiryCheck: Date;
	lastInvoiceExpiryCheck: Date;
	lastPurchaseInvoiceExpiryCheck: Date;
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
	},
	{
		timestamps: true,
	}
);

export default model<System>('System', systemSchema);
