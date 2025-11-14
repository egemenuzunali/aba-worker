// TODO: Import when Notification model is created
// import { models } from '../models';

interface CreateNotificationParams {
	companyId: string;
	userId?: string;
	title: string;
	message: string;
	type: 'quote_confirmed' | 'quote_declined' | 'invoice_paid' | 'payment_received' | 'quote_expired' | 'invoice_expired' | 'apk_expired' | 'apk_expiring' | 'tenaamstelling_changed' | 'maintenance_due' | 'maintenance_overdue' | 'system' | 'info';
	metadata?: {
		invoiceId?: string;
		quoteId?: string;
		clientId?: string;
		vehicleId?: string;
		amount?: number;
		paymentId?: string;
		vehicleIds?: string[];
		vehicleCount?: number;
		reminderId?: string;
	};
}

export class NotificationService {
	static async createNotification(params: CreateNotificationParams) {
		try {
			// TODO: Implement when Notification model is created
			console.log(`📢 Creating notification: ${params.title} - ${params.message}`);
			return { _id: 'mock-notification-id', ...params };
		} catch (error) {
			console.error('Failed to create notification:', error);
			throw error;
		}
	}

	static async createQuoteExpiredNotification(companyId: string, quoteNumber: string, clientName: string, quoteId: string) {
		return this.createNotification({
			companyId,
			title: 'Offerte verlopen',
			message: `Offerte ${quoteNumber} voor ${clientName} is verlopen`,
			type: 'quote_expired',
			metadata: {
				quoteId,
			},
		});
	}

	static async createInvoiceExpiredNotification(companyId: string, invoiceNumber: string, clientName: string, invoiceId: string) {
		return this.createNotification({
			companyId,
			title: 'Factuur verlopen',
			message: `Factuur ${invoiceNumber} van ${clientName} is verlopen`,
			type: 'invoice_expired',
			metadata: {
				invoiceId,
			},
		});
	}

	static async createApkExpiredNotification(companyId: string, vehicleCount: number, vehicleIds: string[]) {
		return this.createNotification({
			companyId,
			title: 'APK verlopen',
			message: `${vehicleCount} ${vehicleCount === 1 ? 'voertuig heeft' : 'voertuigen hebben'} een verlopen APK`,
			type: 'apk_expired',
			metadata: {
				vehicleIds,
				vehicleCount,
			},
		});
	}

	static async createApkExpiringNotification(companyId: string, vehicleCount: number, vehicleIds: string[]) {
		return this.createNotification({
			companyId,
			title: 'APK verloopt binnenkort',
			message: `${vehicleCount} ${vehicleCount === 1 ? 'voertuig heeft' : 'voertuigen hebben'} een APK die binnen 30 dagen verloopt`,
			type: 'apk_expiring',
			metadata: {
				vehicleIds,
				vehicleCount,
			},
		});
	}

	static async createTenaamstellingChangedNotification(
		companyId: string,
		licensePlate: string,
		clientName: string,
		formattedDate: string,
		vehicleId: string,
		clientId?: string
	) {
		return this.createNotification({
			companyId,
			title: 'Tenaamstelling gewijzigd',
			message: `Tenaamstelling voor voertuig ${licensePlate} (${clientName}) is gewijzigd naar ${formattedDate}`,
			type: 'tenaamstelling_changed',
			metadata: {
				vehicleId,
				clientId,
			},
		});
	}

	static async createMaintenanceDueNotification(companyId: string, vehicleCount: number, vehicleIds: string[]) {
		return this.createNotification({
			companyId,
			title: 'Onderhoud binnenkort nodig',
			message: `${vehicleCount} ${vehicleCount === 1 ? 'voertuig heeft' : 'voertuigen hebben'} onderhoud dat binnen 14 dagen gepland staat`,
			type: 'maintenance_due',
			metadata: {
				vehicleIds,
				vehicleCount,
			},
		});
	}

	static async createMaintenanceOverdueNotification(companyId: string, vehicleCount: number, vehicleIds: string[]) {
		return this.createNotification({
			companyId,
			title: 'Onderhoud achterstallig',
			message: `${vehicleCount} ${vehicleCount === 1 ? 'voertuig heeft' : 'voertuigen hebben'} achterstallig onderhoud`,
			type: 'maintenance_overdue',
			metadata: {
				vehicleIds,
				vehicleCount,
			},
		});
	}
}
