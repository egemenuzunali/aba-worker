// Environment configuration with validation
// Note: dotenv is loaded in index.ts
export interface Config {
	port: number;
	mongoString: string;
	nodeEnv: string;
	logLevel: string;
	rdwApiKey?: string;
	rdwBaseUrl?: string;
	// Service enable/disable flags
	enableDocumentExpiryCheck: boolean;
	enableQuoteExpiryCheck: boolean;
	enableInvoiceExpiryCheck: boolean;
	enablePurchaseInvoiceExpiryCheck: boolean;
	enableRdwFullSync: boolean;
	enableRdwDailySync: boolean;
	enableApkStatusCheck: boolean;
	enableMaintenanceReminders: boolean;
	enableQuarterlyReports: boolean;
	enableMonthlyInsights: boolean;
}

/**
 * Validates that all required environment variables are set for test/production.
 * Logs warnings for missing optional vars and throws on missing required vars.
 */
function validateRequiredEnvVars(nodeEnv: string): void {
	const missing: string[] = [];
	const warnings: string[] = [];

	// --- Always required ---
	const alwaysRequired = [
		'MONGO_STRING',
		'APP_NAME',
		'APP_NOREPLY_EMAIL',
		'RESEND_API_KEY',
	];
	for (const key of alwaysRequired) {
		if (!process.env[key]) missing.push(key);
	}

	// --- Required for non-dev environments (test & production) ---
	if (nodeEnv !== 'development') {
		const envPrefix = nodeEnv.toUpperCase(); // TEST or PRODUCTION
		const envPrefixed = [
			`${envPrefix}_FRONTEND_URL`,
		];
		for (const key of envPrefixed) {
			if (!process.env[key]) missing.push(key);
		}
	}

	// --- Warn on missing optional vars that affect email rendering ---
	const optionalButRecommended = [
		'APP_URL',
		'APP_ICON_URL',
		'APP_DEFAULT_LOGO_IMAGE',
		'APP_DEFAULT_LOGO_IMAGE_BLACK',
	];
	for (const key of optionalButRecommended) {
		if (!process.env[key]) warnings.push(key);
	}

	if (warnings.length > 0) {
		console.warn(`⚠️  Optional env vars missing (emails may render incorrectly): ${warnings.join(', ')}`);
	}

	if (missing.length > 0) {
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}
}

function validateConfig(): Config {
	const port = parseInt(process.env.PORT || '4008', 10);
	const mongoString = process.env.MONGO_STRING;
	const nodeEnv = process.env.NODE_ENV || 'development';
	const logLevel = process.env.LOG_LEVEL || 'info';
	const rdwApiKey = process.env.RDW_API_KEY || '';
	const rdwBaseUrl = process.env.RDW_BASE_URL || '';

	// Service enable/disable flags (default to true if not specified)
	const enableDocumentExpiryCheck = process.env.ENABLE_DOCUMENT_EXPIRY_CHECK !== 'false';

	// Granular document expiry flags (inherit from main flag if not specified)
	const enableQuoteExpiryCheck = process.env.ENABLE_QUOTE_EXPIRY_CHECK !== 'false' && enableDocumentExpiryCheck;
	const enableInvoiceExpiryCheck = process.env.ENABLE_INVOICE_EXPIRY_CHECK !== 'false' && enableDocumentExpiryCheck;
	const enablePurchaseInvoiceExpiryCheck = process.env.ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK !== 'false' && enableDocumentExpiryCheck;

	const enableRdwFullSync = process.env.ENABLE_RDW_FULL_SYNC !== 'false';
	const enableRdwDailySync = process.env.ENABLE_RDW_DAILY_SYNC !== 'false';
	const enableApkStatusCheck = process.env.ENABLE_APK_STATUS_CHECK !== 'false';
	const enableMaintenanceReminders = process.env.ENABLE_MAINTENANCE_REMINDERS !== 'false';
	const enableQuarterlyReports = process.env.ENABLE_QUARTERLY_REPORTS !== 'false';
	const enableMonthlyInsights = process.env.ENABLE_MONTHLY_INSIGHTS !== 'false';

	// Validate required environment variables
	validateRequiredEnvVars(nodeEnv);

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

	// Log enabled services
	console.log('📋 Worker Services Configuration:');
	console.log(`   Document Expiry Check: ${enableDocumentExpiryCheck ? '✅ Enabled' : '❌ Disabled'}`);
	if (enableDocumentExpiryCheck) {
		console.log(`     - Quote Expiry: ${enableQuoteExpiryCheck ? '✅ Enabled' : '❌ Disabled'}`);
		console.log(`     - Invoice Expiry: ${enableInvoiceExpiryCheck ? '✅ Enabled' : '❌ Disabled'}`);
		console.log(`     - Purchase Invoice Expiry: ${enablePurchaseInvoiceExpiryCheck ? '✅ Enabled' : '❌ Disabled'}`);
	}
	console.log(`   RDW Full Sync (6-week): ${enableRdwFullSync ? '✅ Enabled' : '❌ Disabled'}`);
	console.log(`   RDW Daily Sync: ${enableRdwDailySync ? '✅ Enabled' : '❌ Disabled'}`);
	console.log(`   APK Status Check: ${enableApkStatusCheck ? '✅ Enabled' : '❌ Disabled'}`);
	console.log(`   Maintenance Reminders: ${enableMaintenanceReminders ? '✅ Enabled' : '❌ Disabled'}`);
	console.log(`   Quarterly Reports: ${enableQuarterlyReports ? '✅ Enabled' : '❌ Disabled'}`);
	console.log(`   Monthly Insights: ${enableMonthlyInsights ? '✅ Enabled' : '❌ Disabled'}`);

	return {
		port,
		mongoString,
		nodeEnv,
		logLevel,
		rdwApiKey,
		rdwBaseUrl,
		enableDocumentExpiryCheck,
		enableQuoteExpiryCheck,
		enableInvoiceExpiryCheck,
		enablePurchaseInvoiceExpiryCheck,
		enableRdwFullSync,
		enableRdwDailySync,
		enableApkStatusCheck,
		enableMaintenanceReminders,
		enableQuarterlyReports,
		enableMonthlyInsights,
	};
}

// Export validated configuration
export const config = validateConfig();

// Export individual config values for convenience
export const {
	port,
	mongoString,
	nodeEnv,
	logLevel,
	rdwApiKey,
	rdwBaseUrl,
	enableDocumentExpiryCheck,
	enableQuoteExpiryCheck,
	enableInvoiceExpiryCheck,
	enablePurchaseInvoiceExpiryCheck,
	enableRdwFullSync,
	enableRdwDailySync,
	enableApkStatusCheck,
	enableMaintenanceReminders,
	enableQuarterlyReports,
	enableMonthlyInsights
} = config;
