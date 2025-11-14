import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields actually used by the worker service
export const vehicleSchema = new Schema({
	license_plate: {
		type: String,
		required: false,
	},
	apk_expiry: {
		type: Date,
		required: false,
	},
	datum_tenaamstelling: {
		type: Date,
		required: false,
	},
	geexporteerd: {
		type: Boolean,
		required: false,
	},
	lastTenaamstellingNotified: {
		type: Date,
		required: false,
	},
	tenaamstellingNotificationDismissed: {
		type: Boolean,
		default: false,
	},
	last_rdw_sync: {
		type: Date,
		required: false,
	},
	lastApkEmailSentForExpired: {
		type: Date,
		required: false,
	},
	lastApkEmailSentForExpiring: {
		type: Date,
		required: false,
	},
	apkRemindersDismissed: {
		type: Boolean,
		default: false,
	},
	apkRemindersDisabledUntil: {
		type: Date,
		required: false,
	},
	maintenanceReminders: [{
		_id: {
			type: Schema.Types.ObjectId,
			auto: true,
		},
		type: {
			type: String,
			enum: ['oil_change', 'tire_rotation', 'brake_check', 'general_service', 'major_service', 'minor_service', 'summer_check', 'winter_check', 'other'],
			required: true,
		},
		description: {
			type: String,
			required: false,
		},
		dueDate: {
			type: Date,
			required: false,
		},
		completed: {
			type: Boolean,
			default: false,
		},
		dismissed: {
			type: Boolean,
			default: false,
		},
		lastNotified: {
			type: Date,
			required: false,
		},
		createdAt: {
			type: Date,
			default: Date.now,
		}
	}],
	clientId: {
		type: Schema.Types.ObjectId,
		ref: 'Client',
	},
	companyId: {
		type: Schema.Types.ObjectId,
		ref: 'Company',
	},
	deleted: {
		type: Boolean,
		default: false,
	},
}, { timestamps: true });

// NOTE: Database indexes are managed by the main backend application
// Worker microservice should NOT create or modify database indexes

const Vehicle = model('Vehicle', vehicleSchema);

export default Vehicle;
