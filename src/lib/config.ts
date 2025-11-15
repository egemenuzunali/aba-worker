// Environment configuration with validation
// Note: dotenv is loaded in index.ts
export interface Config {
	port: number;
	mongoString: string;
	nodeEnv: string;
	logLevel: string;
	rdwApiKey?: string;
	rdwBaseUrl?: string;
}

function validateConfig(): Config {
	const port = parseInt(process.env.PORT || '4008', 10);
	const mongoString = process.env.MONGO_STRING;
	const nodeEnv = process.env.NODE_ENV || 'development';
	const logLevel = process.env.LOG_LEVEL || 'info';
	const rdwApiKey = process.env.RDW_API_KEY || '';
	const rdwBaseUrl = process.env.RDW_BASE_URL || '';

	// Validate required environment variables
	if (!mongoString) {
		throw new Error('MONGO_STRING environment variable is required');
	}

	if (isNaN(port) || port < 1 || port > 65535) {
		throw new Error('PORT must be a valid port number between 1 and 65535');
	}

	// Validate log level
	const validLogLevels = ['error', 'warn', 'info', 'debug'];
	if (!validLogLevels.includes(logLevel)) {
		throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
	}

	// RDW API key is optional (for development/testing)
	if (rdwApiKey) {
		console.log('🔑 RDW API key configured');
	} else {
		console.log('⚠️  RDW API key not configured (using mock data)');
	}

	return {
		port,
		mongoString,
		nodeEnv,
		logLevel,
		rdwApiKey,
		rdwBaseUrl,
	};
}

// Export validated configuration
export const config = validateConfig();

// Export individual config values for convenience
export const { port, mongoString, nodeEnv, logLevel, rdwApiKey, rdwBaseUrl } = config;
