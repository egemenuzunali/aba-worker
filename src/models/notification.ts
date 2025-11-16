import { Schema, model, Types } from 'mongoose';

// Partial schema for aba-worker - matches back-end schema for notification creation
interface Notification {
	_id: Types.ObjectId;
	companyId: string;
	userId?: string;
	title: string;
	message: string;
	type: 'quote_confirmed' | 'quote_declined' | 'invoice_paid' | 'payment_received' |
	      'quote_expired' | 'invoice_expired' | 'apk_expired' | 'apk_expiring' |
	      'tenaamstelling_changed' | 'maintenance_due' | 'maintenance_overdue' |
	      'system' | 'info';
	isRead: boolean;
	metadata?: {
		invoiceId?: string;
		quoteId?: string;
		clientId?: string;
		vehicleId?: string;
		vehicleIds?: string[];
		vehicleCount?: number;
		amount?: number;
		paymentId?: string;
	};
	createdAt: Date;
	updatedAt: Date;
}

const notificationSchema = new Schema<Notification>(
	{
		companyId: {
			type: String,
			required: true,
			index: true,
		},
		userId: {
			type: String,
			required: false,
			index: true,
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
		isRead: {
			type: Boolean,
			default: false,
			required: true,
		},
		metadata: {
			invoiceId: { type: String, required: false },
			quoteId: { type: String, required: false },
			clientId: { type: String, required: false },
			vehicleId: { type: String, required: false },
			vehicleIds: { type: [String], required: false },
			vehicleCount: { type: Number, required: false },
			amount: { type: Number, required: false },
			paymentId: { type: String, required: false },
		},
	},
	{
		timestamps: true,
	}
);

// Note: Indexes are defined in the main back-end schema (source of truth)
// This is a partial schema used only for creating notifications

export default model<Notification>('Notification', notificationSchema);
