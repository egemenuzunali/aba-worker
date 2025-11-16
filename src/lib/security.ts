// Security middleware for production hardening
import express from 'express';

export function setupSecurity(app: express.Application) {
	// Security headers
	app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
		// Prevent clickjacking
		res.setHeader('X-Frame-Options', 'DENY');

		// Prevent MIME type sniffing
		res.setHeader('X-Content-Type-Options', 'nosniff');

		// Enable XSS protection
		res.setHeader('X-XSS-Protection', '1; mode=block');

		// Referrer policy
		res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

		// Content Security Policy (basic)
		res.setHeader('Content-Security-Policy', "default-src 'self'");

		next();
	});

	// Request size limits
	app.use(express.json({ limit: '10mb' }));
	app.use(express.urlencoded({ extended: true, limit: '10mb' }));

	// Remove server information
	app.disable('x-powered-by');
}
