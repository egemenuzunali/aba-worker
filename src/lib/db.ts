import mongoose from 'mongoose'
import { Vehicle, Company, Client, System, Quote, Invoice, PurchaseInvoice, Notification } from '../models'
import { mongoString } from './config'
import { logger } from './logger'


interface Models {
	Vehicle: typeof Vehicle;
	Company: typeof Company;
	Client: typeof Client;
	System: typeof System;
	Quote: typeof Quote;
	Invoice: typeof Invoice;
	PurchaseInvoice: typeof PurchaseInvoice;
	Notification: typeof Notification;
}

class db {
	static async connect(): Promise<void> {
		logger.info('Setting up mongodb connection')
		mongoose.set("strictQuery", false);

		await mongoose.connect(mongoString)
		logger.info('DB Connection set up successfully')
	}

	static models: Models = {
		Vehicle,
		Company,
		Client,
		System,
		Quote,
		Invoice,
		PurchaseInvoice,
		Notification
	}

	static async disconnect(): Promise<void> {
		await mongoose.disconnect();
		logger.info('DB Connection closed')
	}
}

export default db