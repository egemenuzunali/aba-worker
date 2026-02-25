/**
 * Resend email service for aba-worker
 * Mirrors the backend mail.ts setup for consistency
 */

import { Resend } from 'resend';
import { logger } from './logger';

const getResendApiKey = (): string => {
	const key = process.env.RESEND_API_KEY;
	if (!key) {
		throw new Error('RESEND_API_KEY is not set in environment variables');
	}
	return key;
};

// Resend client - initialized lazily
let resend: Resend | null = null;

const getResendClient = () => {
	if (!resend) {
		resend = new Resend(getResendApiKey());
		logger.info('📧 Resend client initialized successfully');
	}
	return resend;
};

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
 * Send an email using Resend
 */
export const sendMail = async (mailOptions: MailOptions) => {
	try {
		const client = getResendClient();

		// Build attachments for Resend format
		const attachments = mailOptions.attachments?.map(attachment => ({
			filename: attachment.filename,
			content: attachment.data,
		}));

		const { data, error } = await client.emails.send({
			from: mailOptions.from,
			to: mailOptions.to,
			cc: mailOptions.cc || undefined,
			bcc: mailOptions.bcc || undefined,
			subject: mailOptions.subject,
			html: mailOptions.html,
			text: mailOptions.text || undefined,
			replyTo: mailOptions.replyTo || undefined,
			attachments: attachments && attachments.length > 0 ? attachments : undefined,
		});

		if (error) {
			throw new Error(error.message);
		}

		logger.debug('Email sent successfully', { to: mailOptions.to, subject: mailOptions.subject });
		return data;
	} catch (error) {
		logger.error('Failed to send email', {
			error: (error as Error).message,
			to: mailOptions.to,
			subject: mailOptions.subject
		});
		throw error;
	}
};
