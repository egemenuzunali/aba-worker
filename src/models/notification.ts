import { Schema, model, Types } from 'mongoose';

// Partial schema for aba-worker - only includes fields needed for notification creation
interface Notification {
	_id: Types.ObjectId;
	companyId: Types.ObjectId;
	userId?: Types.ObjectId;
	title: string;
	message: string;
	type: 'quote_confirmed' | 'quote_declined' | 'invoice_paid' | 'payment_received' |
	      'quote_expired' | 'invoice_expired' | 'apk_expired' | 'apk_expiring' |
	      'tenaamstelling_changed' | 'maintenance_due' | 'maintenance_overdue' |
	      'system' | 'info';
	read: boolean;
	dismissed: boolean;
	metadata?: {
		invoiceId?: string;
		quoteId?: string;
		clientId?: string;
		vehicleId?: string;
		vehicleIds?: string[];
		vehicleCount?: number;
		amount?: number;
		paymentId?: string;
		reminderId?: string;
	};
	createdAt: Date;
	updatedAt: Date;
	readAt?: Date;
}

const notificationSchema = new Schema<Notification>(
	{
		companyId: {
			type: Schema.Types.ObjectId,
			ref: 'Company',
			required: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: false,
		},
		title: {
			type: String,
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		type: {
			type: String,
			required: true,
			enum: [
				'quote_confirmed',
				'quote_declined',
				'invoice_paid',
				'payment_received',
				'quote_expired',
				'invoice_expired',
				'apk_expired',
				'apk_expiring',
				'tenaamstelling_changed',
				'maintenance_due',
				'maintenance_overdue',
				'system',
				'info',
			],
		},
		read: {
			type: Boolean,
			default: false,
		},
		dismissed: {
			type: Boolean,
			default: false,
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
		readAt: {
			type: Date,
			required: false,
		},
	},
	{
		timestamps: true,
	}
);

// Note: Indexes are defined in the main back-end schema (source of truth)
// This is a partial schema used only for creating notifications

export default model<Notification>('Notification', notificationSchema);
