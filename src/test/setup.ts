// Test setup file for Jest in aba-worker
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Vehicle, Company, Client, System, Quote, Invoice, PurchaseInvoice } from '../models';

let mongoServer: MongoMemoryServer;

// Mock the db module for tests
jest.mock('../lib/db', () => ({
	connect: jest.fn(),
	models: {
		Vehicle,
		Company,
		Client,
		System,
		Quote,
		Invoice,
		PurchaseInvoice
	}
}));

// Mock the config module
jest.mock('../lib/config', () => ({
	mongoString: 'mock-mongo-string',
	port: 3000,
	isDev: () => true,
	isTest: () => true,
	isProd: () => false
}));

beforeAll(async () => {
	// Create MongoDB Memory Server with minimal configuration
	mongoServer = await MongoMemoryServer.create();
	const mongoUri = mongoServer.getUri();

	// Set environment variables that tests need
	process.env.MONGODB_URI = mongoUri;
	process.env.NODE_ENV = 'test';
	process.env.JWT_SECRET = 'test-jwt-secret';
	process.env.APP_SECRET = 'test-app-secret';
	process.env.MONGO_STRING = mongoUri;

	// Connect mongoose directly for tests
	await mongoose.connect(mongoUri);
}, 60000);

afterAll(async () => {
	await mongoose.disconnect();
	if (mongoServer) {
		await mongoServer.stop();
	}
}, 30000);
