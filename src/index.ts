
import dotenv from 'dotenv'
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import { boot } from "./lib/boot";
import { config } from './lib/config';
import { setupSecurity } from './lib/security';

dotenv.config()

// Validate configuration on startup
try {
	console.log(`🚀 Starting ABA Worker microservice in ${config.nodeEnv} mode`);
	console.log(`📡 Port: ${config.port}`);
	console.log(`📊 Log Level: ${config.logLevel}`);
} catch (error) {
	console.error('❌ Configuration validation failed:', error);
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

	app.get('/health', async (req, res) => {
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
	app.get('/metrics', (req, res) => {
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

