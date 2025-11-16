import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
const companySchema = new Schema({
	name: {
		type: String,
		required: true,
		unique: true,
	},
	lastActiveAt: {
		type: Date,
		required: false,
		default: Date.now,
	},
	serviceModules: {
		apkEnabled: { type: Boolean, default: true },
		invoiceStatusCheckingEnabled: { type: Boolean, default: true },
		rdwSyncEnabled: { type: Boolean, default: true },
		lastExpiryCheckDate: { type: Date, default: () => new Date('2020-01-01') }
	},
}, { timestamps: true });

const Company = model('Company', companySchema);

export default Company;
