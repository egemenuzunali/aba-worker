
import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import { boot } from "./lib/boot";
import { config } from './lib/config';
import { setupSecurity } from './lib/security';

// Validate configuration on startup
try {
	console.log(`🚀 Starting ABA Worker microservice in ${config.nodeEnv} mode`);
	console.log(`📡 Port: ${config.port}`);
	console.log(`📊 Log Level: ${config.logLevel}`);
} catch (error) {
	console.error('Configuration validation failed:', error);
	process.exit(1);
}

async function startServer() {
	const app = express();
	const httpServer = http.createServer(app);

	// Setup security middleware
	setupSecurity(app);

	app.use(
		cors(),
		bodyParser.json(),
	);

	app.get('/health', async (req: express.Request, res: express.Response) => {
		try {
			// Check database connectivity
			const dbHealth = {
				mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
				name: mongoose.connection.name || 'unknown',
				host: mongoose.connection.host || 'unknown'
			};

			// Check if scheduler is running
			const schedulerHealth = {
				status: 'running', // We'll enhance this later
				uptime: process.uptime()
			};

			const healthStatus = {
				status: dbHealth.mongodb === 'connected' ? 'healthy' : 'unhealthy',
				service: 'aba-worker',
				timestamp: new Date().toISOString(),
				version: process.env.npm_package_version || '1.0.0',
				environment: config.nodeEnv,
				database: dbHealth,
				scheduler: schedulerHealth,
				memory: {
					used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
					total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
					unit: 'MB'
				}
			};

			const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
			res.status(statusCode).json(healthStatus);
		} catch (error) {
			console.error('Health check failed:', error);
			res.status(503).json({
				status: 'unhealthy',
				service: 'aba-worker',
				timestamp: new Date().toISOString(),
				error: 'Health check failed'
			});
		}
	});

	// Metrics endpoint for monitoring
	app.get('/metrics', (req: express.Request, res: express.Response) => {
		const metrics = {
			uptime: process.uptime(),
			memory: {
				used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
				total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
				external: Math.round(process.memoryUsage().external / 1024 / 1024),
				rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
				unit: 'MB'
			},
			cpu: process.cpuUsage(),
			pid: process.pid,
			nodeVersion: process.version,
			environment: config.nodeEnv,
			timestamp: new Date().toISOString()
		};

		res.json(metrics);
	});

	// TODO: Add APK sync endpoints here
	// TODO: Add RDW integration endpoints here
	// TODO: Add notification endpoints here

	// Test endpoint for quarterly reports (development only)
	if (config.nodeEnv === 'development') {
		const { StatusUpdateScheduler } = require('./services/StatusUpdateScheduler');

		// Send quarterly report to all companies
		app.post('/test/quarterly-reports', async (req: express.Request, res: express.Response) => {
			try {
				const scheduler = StatusUpdateScheduler.getInstance();
				await scheduler.runManualQuarterlyReports();
				res.json({ success: true, message: 'Quarterly reports sent to all eligible companies' });
			} catch (error) {
				console.error('Failed to send quarterly reports:', error);
				res.status(500).json({ success: false, error: (error as Error).message });
			}
		});

		// Send quarterly report to a specific company
		app.post('/test/quarterly-reports/:companyId', async (req: express.Request, res: express.Response) => {
			try {
				const { companyId } = req.params;
				const scheduler = StatusUpdateScheduler.getInstance();
				await scheduler.runManualQuarterlyReportForCompany(companyId);
				res.json({ success: true, message: `Quarterly report sent for company ${companyId}` });
			} catch (error) {
				console.error('Failed to send quarterly report:', error);
				res.status(500).json({ success: false, error: (error as Error).message });
			}
		});

		// Send monthly insights to all companies
		app.post('/test/monthly-insights', async (req: express.Request, res: express.Response) => {
			try {
				const scheduler = StatusUpdateScheduler.getInstance();
				await scheduler.runManualMonthlyInsights();
				res.json({ success: true, message: 'Monthly insights sent to all eligible companies' });
			} catch (error) {
				console.error('Failed to send monthly insights:', error);
				res.status(500).json({ success: false, error: (error as Error).message });
			}
		});

		// Send monthly insights to a specific company
		app.post('/test/monthly-insights/:companyId', async (req: express.Request, res: express.Response) => {
			try {
				const { companyId } = req.params;
				const scheduler = StatusUpdateScheduler.getInstance();
				await scheduler.runManualMonthlyInsightsForCompany(companyId);
				res.json({ success: true, message: `Monthly insights sent for company ${companyId}` });
			} catch (error) {
				console.error('Failed to send monthly insights:', error);
				res.status(500).json({ success: false, error: (error as Error).message });
			}
		});

		console.log('📧 Test endpoints enabled:');
		console.log('   POST /test/quarterly-reports');
		console.log('   POST /test/quarterly-reports/:companyId');
		console.log('   POST /test/monthly-insights');
		console.log('   POST /test/monthly-insights/:companyId');
	}

	// Global error handling middleware
	app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
		console.error('Unhandled error:', err);

		// Don't leak error details in production
		const isDevelopment = config.nodeEnv === 'development';

		res.status(500).json({
			error: 'Internal Server Error',
			message: isDevelopment ? err.message : 'Something went wrong',
			timestamp: new Date().toISOString(),
			...(isDevelopment && { stack: err.stack })
		});
	});

	// 404 handler
	app.use((req: express.Request, res: express.Response) => {
		res.status(404).json({
			error: 'Not Found',
			message: `Route ${req.method} ${req.path} not found`,
			timestamp: new Date().toISOString()
		});
	});

	await new Promise<void>((resolve) => httpServer.listen({ port: config.port }, resolve));
	console.info(`ABA Worker microservice ready at http://localhost:${config.port} ✅`);

	// Initialize background jobs
	await boot();

	return httpServer; // Return server instance for cleanup
}

// Add graceful shutdown handling
let httpServerInstance: any = null;

async function gracefulShutdown() {
	console.log('🛑 ABA Worker graceful shutdown initiated...');

	// Close HTTP server
	if (httpServerInstance) {
		await new Promise<void>((resolve) => {
			httpServerInstance.close(() => {
				console.log('✅ HTTP server closed');
				resolve();
			});
		});
	}

	console.log('✅ ABA Worker graceful shutdown completed');
	process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

// Start server and store reference
startServer().then((server) => {
	httpServerInstance = server;
}).catch((error) => {
	console.error('Failed to start server:', error);
	process.exit(1);
});

