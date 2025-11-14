import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
const quoteSchema = new Schema({
	expiration_date: {
		type: Date,
		required: true,
	},
	quote_number: {
		type: Number,
		required: false,
	},
	deleted: {
		type: Boolean,
		required: true,
		default: false,
	},
	status: {
		type: String,
		enum: ['OPEN', 'SENT', 'EXPIRED', 'CONFIRMED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'CONCEPT'],
		required: true,
		default: 'OPEN',
	},
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

const Quote = model('Quote', quoteSchema);

export default Quote;
