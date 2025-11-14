import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
export const clientSchema = new Schema({
	name: {
		type: String,
		required: true,
	},
	deleted: {
		type: Boolean,
		default: false,
	},
	companyId: {
		type: Schema.Types.ObjectId,
		ref: 'Company',
		required: true,
	},
	// When true, disables ALL vehicle notifications for this client
	apkNotificationsDisabled: {
		type: Boolean,
		default: false,
		required: false,
	},
}, {
	timestamps: true,
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
});

// NOTE: Database indexes are managed by the main backend application
// Worker microservice should NOT create or modify database indexes

const Client = model('Client', clientSchema);

export default Client;
