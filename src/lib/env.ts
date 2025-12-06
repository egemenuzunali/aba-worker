/**
 * Environment configuration helpers for aba-worker
 * Mirrors the backend env.ts patterns for consistency
 */

export type Environment = 'development' | 'test' | 'production';

export const getEnvironment = (): Environment => {
	const env = process.env.NODE_ENV as Environment;
	if (!env || !['development', 'test', 'production'].includes(env)) {
		console.warn('⚠️ NODE_ENV not set or invalid, defaulting to development');
		return 'development';
	}
	return env;
};

export const isDev = (): boolean => getEnvironment() === 'development';
export const isTest = (): boolean => getEnvironment() === 'test';
export const isProd = (): boolean => getEnvironment() === 'production';

export const getMailgunApiKey = (): string => {
	const env = getEnvironment();
	const envVarName = env.toUpperCase() + '_MAILGUN_API_KEY';
	const key = process.env[envVarName];

	if (!key) {
		console.warn(`⚠️ No Mailgun API key configured for ${env} environment`);
		throw new Error(`Mailgun API key is required for ${env} environment`);
	}

	return key;
};

export const getMailgunDomain = (): string => {
	const env = getEnvironment();
	const envVarName = env.toUpperCase() + '_MAILGUN_DOMAIN';
	const domain = process.env[envVarName];

	if (!domain) {
		console.warn(`⚠️ No Mailgun domain configured for ${env} environment`);
		throw new Error(`Mailgun domain is required for ${env} environment`);
	}

	return domain;
};

export const getFrontendUrl = (): string => {
	const env = getEnvironment();
	const url = process.env[`${env.toUpperCase()}_FRONTEND_URL`];

	if (!url) {
		console.warn(`⚠️ No frontend URL configured for ${env} environment`);
		return 'http://localhost:3000';
	}

	return url;
};

export const getDevMailTo = (): string | undefined => {
	const devMailTo = process.env.APP_DEV_MAIL_TO;
	return devMailTo;
};
