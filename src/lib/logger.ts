import { config } from './config';

export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3
}

export interface OperationSummary {
	total: number;
	successful: number;
	failed: number;
	skipped: number;
	errors?: string[];
	duration?: number;
}

export class Logger {
	private static instance: Logger;
	private logLevel: LogLevel;

	private constructor() {
		this.logLevel = this.getLogLevelFromString(config.logLevel);
	}

	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	private getLogLevelFromString(level: string): LogLevel {
		switch (level.toLowerCase()) {
			case 'error': return LogLevel.ERROR;
			case 'warn': return LogLevel.WARN;
			case 'info': return LogLevel.INFO;
			case 'debug': return LogLevel.DEBUG;
			default: return LogLevel.INFO;
		}
	}

	private shouldLog(level: LogLevel): boolean {
		return level <= this.logLevel;
	}

	private formatMessage(level: string, message: string, data?: any): string {
		const timestamp = new Date().toISOString();
		const baseMessage = `[${timestamp}] ${level}: ${message}`;

		if (data && this.shouldLog(LogLevel.DEBUG)) {
			return `${baseMessage} ${JSON.stringify(data, null, 2)}`;
		}

		return baseMessage;
	}

	error(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			console.error(this.formatMessage('ERROR', message, data));
		}
	}

	warn(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(this.formatMessage('WARN', message, data));
		}
	}

	info(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.INFO)) {
			console.info(this.formatMessage('INFO', message, data));
		}
	}

	debug(message: string, data?: any): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.debug(this.formatMessage('DEBUG', message, data));
		}
	}

	/**
	 * Logs a summary of bulk operations instead of individual entries
	 */
	summary(operation: string, summary: OperationSummary, details?: any): void {
		const successRate = summary.total > 0 ? Math.round((summary.successful / summary.total) * 100) : 0;

		let message = `${operation}: ${summary.successful}/${summary.total} successful (${successRate}%)`;

		if (summary.failed > 0) {
			message += `, ${summary.failed} failed`;
		}

		if (summary.skipped > 0) {
			message += `, ${summary.skipped} skipped`;
		}

		if (summary.duration) {
			message += ` in ${summary.duration}ms`;
		}

		if (summary.failed > 0) {
			this.warn(message, details);
			if (summary.errors && summary.errors.length > 0 && this.shouldLog(LogLevel.DEBUG)) {
				this.debug('Operation errors:', { errors: summary.errors.slice(0, 10) }); // Limit to first 10 errors
			}
		} else {
			this.info(message, details);
		}
	}

	/**
	 * Logs service startup with configuration summary
	 */
	serviceStart(serviceName: string, config?: any): void {
		this.info(`🚀 ${serviceName} service started`, config);
	}

	/**
	 * Logs service completion with performance metrics
	 */
	serviceComplete(serviceName: string, duration: number, summary?: OperationSummary): void {
		let message = `✅ ${serviceName} completed in ${duration}ms`;

		if (summary) {
			const successRate = summary.total > 0 ? Math.round((summary.successful / summary.total) * 100) : 0;
			message += ` - ${summary.successful}/${summary.total} successful (${successRate}%)`;
		}

		this.info(message);
	}

	/**
	 * Logs sync operations with before/after counts
	 */
	syncSummary(operation: string, before: number, after: number, duration: number, errors: string[] = []): void {
		const changed = after - before;
		let message = `${operation}: ${before} → ${after} (${changed >= 0 ? '+' : ''}${changed}) in ${duration}ms`;

		if (errors.length > 0) {
			this.warn(message + `, ${errors.length} errors`, { errors: errors.slice(0, 5) });
		} else {
			this.info(message);
		}
	}

	/**
	 * Logs batch processing progress (only for large batches)
	 */
	batchProgress(operation: string, processed: number, total: number, batchSize: number): void {
		if (total >= batchSize * 3) { // Only log progress for large operations
			const percentage = Math.round((processed / total) * 100);
			this.debug(`${operation} progress: ${processed}/${total} (${percentage}%)`);
		}
	}
}

export const logger = Logger.getInstance();
