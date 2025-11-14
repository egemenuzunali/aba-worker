import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
const purchaseInvoiceSchema = new Schema({
	expiration_date: {
		type: Date,
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
		enum: ['OPEN', 'COMPLETED', 'EXPIRED'],
		required: true,
		default: 'OPEN',
	},
	payments: [{
		amount: {
			type: Number,
			required: true,
		},
	}],
}, { timestamps: true });

// NOTE: Database indexes are managed by the main backend application
// Worker microservice should NOT create or modify database indexes

const PurchaseInvoice = model('PurchaseInvoice', purchaseInvoiceSchema);

export default PurchaseInvoice;
