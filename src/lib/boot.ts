// ABA Worker microservice initialization
// This file will be used to initialize background jobs and scheduled tasks
// for APK sync, RDW integration, and notification services

import { StatusUpdateScheduler } from '../services/StatusUpdateScheduler';
import db from './db';
import { runTestSync } from './testSync';
import { logger } from './logger';

// Store interval and timeout references for cleanup
const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];

// Cleanup function to clear all intervals and timeouts
async function cleanup() {
	logger.info('Cleaning up intervals and timeouts');
	// Stop the scheduler
	const scheduler = StatusUpdateScheduler.getInstance();
	scheduler.stopScheduler();

	intervals.forEach(clearInterval);
	timeouts.forEach(clearTimeout);
	intervals.length = 0;
	timeouts.length = 0;
	logger.info('Cleanup completed');
}

// Add process termination handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGHUP', cleanup);

export async function boot() {
	try {
		// Initialize database connection
		await db.connect();

		// Run test sync to verify all services are working
		await runTestSync();

		// Initialize all scheduled tasks
		const scheduler = StatusUpdateScheduler.getInstance();
		scheduler.startScheduler();

		logger.info('ABA Worker microservice initialized with scheduled tasks');
	} catch (error) {
		logger.error('Failed to initialize ABA Worker', { error: (error as Error).message });
		throw error;
	}
}

