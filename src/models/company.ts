import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
const companySchema = new Schema({
	name: {
		type: String,
		required: true,
		unique: true,
	},
	email: {
		type: String,
		required: true,
	},
	company_image: {
		type: String,
		required: false,
	},
	lastActiveAt: {
		type: Date,
		required: false,
		default: Date.now,
	},
	ownerId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	serviceModules: {
		apkEnabled: { type: Boolean, default: true },
		apkNotificationsEnabled: { type: Boolean, default: true },
		invoiceStatusCheckingEnabled: { type: Boolean, default: true },
		rdwSyncEnabled: { type: Boolean, default: true },
		quarterlyReportEnabled: { type: Boolean, default: true },
		lastExpiryCheckDate: { type: Date, default: () => new Date('2020-01-01') }
	},
	// Subscription status to check if company is active
	subscription: {
		subscriptionStatus: {
			type: String,
			enum: ['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid', null, ''],
			required: false,
			default: null,
		},
	},
}, { timestamps: true });

const Company = model('Company', companySchema);

export default Company;
