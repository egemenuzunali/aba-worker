/**
 * Mailgun email service for aba-worker
 * Mirrors the backend mail.ts setup for consistency
 */

import { getMailgunDomain, getMailgunApiKey, isDev } from "./env";
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { logger } from './logger';

// Configuration
const config = {
	apiKey: '',
	domain: '',
	url: "https://api.eu.mailgun.net",
};

// Initialize config lazily to avoid errors during import
const initConfig = () => {
	if (!config.apiKey) {
		config.apiKey = getMailgunApiKey();
		config.domain = getMailgunDomain();
	}
	return config;
};

// Mailgun client - initialized lazily
let mg: any = null;

const getMgClient = () => {
	if (!mg) {
		const cfg = initConfig();
		const mailgun = new Mailgun(formData);
		mg = mailgun.client({
			username: 'api',
			key: cfg.apiKey,
			url: isDev() ? '' : cfg.url
		});
		logger.info('📧 Mailgun client initialized successfully');
	}
	return mg;
};

interface MailgunData {
	from: string;
	to: string;
	cc?: string;
	bcc?: string;
	subject: string;
	html: string;
	text?: string;
	'h:Reply-To'?: string;
	attachment?: Array<{
		filename: string;
		data: Buffer;
	}>;
}

export interface MailOptions {
	from: string;
	to: string;
	cc?: string;
	bcc?: string;
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
	attachments?: Array<{
		filename: string;
		data: Buffer;
	}>;
}

/**
 * Send an email using Mailgun
 */
export const sendMail = async (mailOptions: MailOptions) => {
	try {
		const client = getMgClient();
		const cfg = initConfig();

		const data: MailgunData = {
			from: mailOptions.from,
			to: mailOptions.to,
			cc: mailOptions.cc,
			bcc: mailOptions.bcc,
			subject: mailOptions.subject,
			html: mailOptions.html,
			text: mailOptions.text,
			'h:Reply-To': mailOptions.replyTo,
		};

		// Handle attachments if present
		if (mailOptions.attachments && mailOptions.attachments.length > 0) {
			data.attachment = mailOptions.attachments.map(attachment => ({
				filename: attachment.filename,
				data: attachment.data
			}));
		}

		const response = await client.messages.create(cfg.domain, data);
		logger.debug('Email sent successfully', { to: mailOptions.to, subject: mailOptions.subject });
		return response;
	} catch (error) {
		logger.error('Failed to send email', {
			error: (error as Error).message,
			to: mailOptions.to,
			subject: mailOptions.subject
		});
		throw error;
	}
};
