import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
const invoiceSchema = new Schema({
	expiration_date: {
		type: Date,
		required: true,
	},
	invoice_number: {
		type: Number,
		required: true,
	},
	total_incl_vat: {
		type: Number,
		required: true,
	},
	deleted: {
		type: Boolean,
		required: true,
		default: false,
	},
	status: {
		type: String,
		enum: ['CONCEPT', 'OPEN', 'SENT', 'EXPIRED', 'COMPLETED', 'DECLINED', 'CANCELLED'],
		required: true,
		default: 'OPEN',
	},
	payments: [{
		amount: {
			type: Number,
			required: true,
		},
	}],
	companyId: {
		type: Schema.Types.ObjectId,
		ref: 'Company',
		required: true,
	},
	clientId: {
		type: Schema.Types.ObjectId,
		ref: 'Client',
		required: true,
	},
}, { timestamps: true });

// NOTE: Database indexes are managed by the main backend application
// Worker microservice should NOT create or modify database indexes

const Invoice = model('Invoice', invoiceSchema);

export default Invoice;
