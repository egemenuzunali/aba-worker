/**
 * Modern email template with glassmorphism design
 * Copied from back-end for consistency in worker emails
 */

/**
 * Convert HTML content to plain text for email text version
 */
export const htmlToPlainText = (html: string): string => {
	return html
		// Remove style tags and their content
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
		// Remove script tags and their content
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
		// Convert line breaks
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<\/div>/gi, '\n')
		.replace(/<\/h[1-6]>/gi, '\n\n')
		.replace(/<\/li>/gi, '\n')
		// Convert links to text with URL
		.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
		// Remove all remaining HTML tags
		.replace(/<[^>]+>/g, '')
		// Decode HTML entities
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		// Clean up whitespace
		.split('\n')
		.map(line => line.trim())
		.join('\n')
		// Remove multiple consecutive blank lines
		.replace(/\n{3,}/g, '\n\n')
		// Final trim
		.trim();
};

/**
 * Generate plain text version for email template
 */
export const generatePlainTextVersion = (content: string, companyName?: string): string => {
	const plainContent = htmlToPlainText(content);
	const appName = process.env.APP_NAME || 'ABA';
	const appUrl = process.env.APP_URL || '';

	return `
${companyName || appName}

${plainContent}

---
© ${new Date().getFullYear()} ${appName}
${appUrl}
`.trim();
};

export const modernBaseTemplate = (content: string, companyName?: string, emailType: 'standard' | 'business' | 'welcome' | 'security' = 'standard', companyLogo?: string) => {
	const headerColors = {
		standard: '#667eea',
		business: '#ffffff',
		welcome: '#667eea',
		security: '#EC0000'
	};

	const headerBackground = headerColors[emailType];
	const isBusinessEmail = emailType === 'business';

	const BUSINESS_LOGO_STYLE = "width: 160px; max-height: 80px; max-width: 160px; display: block; margin: 0 auto; object-fit: contain;";

	const DEFAULT_LOGO_IMAGE = `
<img
  src="${process.env.APP_DEFAULT_LOGO_IMAGE || ''}"
  alt="${process.env.APP_NAME || 'ABA'} logo"
  style="${BUSINESS_LOGO_STYLE}"
/>
`;

	const getLogoImage = () => {
		if (!isBusinessEmail) {
			return DEFAULT_LOGO_IMAGE;
		}
		const logoSrc = companyLogo || process.env.APP_DEFAULT_LOGO_IMAGE_BLACK || '';
		const logoAlt = companyLogo
			? `${companyName || 'Company'} logo`
			: `${process.env.APP_NAME || 'ABA'} logo`;

		return `<img
  src="${logoSrc}"
  alt="${logoAlt}"
  style="${BUSINESS_LOGO_STYLE}"
/>`;
	};

	return `
<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${companyName || process.env.APP_NAME || 'ABA'}</title>
    <style>
        /* Reset */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.7;
            color: #2c3e50;
            background: #f5f7fa;
            margin: 0;
            padding: 0;
            min-height: 100vh;
        }

        /* Container */
        .email-wrapper {
            background: #f5f7fa;
            min-height: 100vh;
            padding: 40px 20px;
        }

        .email-container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e0e0e0;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        /* Header */
        .email-header {
            background: ${headerBackground};
            padding: 20px 20px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .logo-container {
            position: relative;
            z-index: 10;
        }

        /* Content */
        .email-content {
            padding: 40px 30px;
            background: #ffffff;
        }

        .email-content h1 {
            color: #2c3e50;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 20px;
            line-height: 1.2;
        }

        .email-content h2 {
            color: #2c3e50;
            font-size: 24px;
            font-weight: 600;
            margin: 30px 0 15px 0;
            line-height: 1.3;
        }

        .email-content p {
            color: #2c3e50;
            font-size: 16px;
            margin-bottom: 20px;
            line-height: 1.7;
        }

        /* Cards */
        .info-card {
            background: rgba(102, 126, 234, 0.08);
            border: 1px solid rgba(102, 126, 234, 0.2);
            border-left: 4px solid #667eea;
            border-radius: 12px;
            padding: 24px;
            margin: 25px 0;
        }

        .warning-card {
            background: rgba(255, 193, 7, 0.05);
            border: 1px solid rgba(255, 193, 7, 0.1);
            border-left: 4px solid #ffc107;
            border-radius: 12px;
            padding: 24px;
            margin: 25px 0;
        }

        .success-card {
            background: rgba(40, 167, 69, 0.05);
            border: 1px solid rgba(40, 167, 69, 0.1);
            border-left: 4px solid #28a745;
            border-radius: 12px;
            padding: 24px;
            margin: 25px 0;
        }

        .danger-card {
            background: rgba(236, 0, 0, 0.05);
            border: 1px solid rgba(236, 0, 0, 0.1);
            border-left: 4px solid #EC0000;
            border-radius: 12px;
            padding: 24px;
            margin: 25px 0;
        }

        .card-title {
            font-weight: 600;
            font-size: 18px;
            margin-bottom: 12px;
            color: #2c3e50;
        }

        .card-content {
            font-size: 16px;
            line-height: 1.6;
            color: #34495e;
            margin: 0;
        }

        /* Table styles */
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }

        .invoice-table th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #2c3e50;
            border-bottom: 2px solid #dee2e6;
        }

        .invoice-table td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
            color: #34495e;
        }

        .invoice-table tr:hover {
            background: #f8f9fa;
        }

        .text-right {
            text-align: right;
        }

        .text-danger {
            color: #EC0000;
        }

        .text-warning {
            color: #ffc107;
        }

        /* Footer */
        .email-footer {
            background: rgba(44, 62, 80, 0.05);
            padding: 30px 20px;
            text-align: center;
            border-top: 1px solid rgba(255, 255, 255, 0.3);
            width: 100%;
        }

        .footer-content {
            text-align: center;
            width: 100%;
            margin: 0 auto;
        }

        .footer-logo-link {
            display: inline-block;
            text-decoration: none;
        }

        .footer-content img {
            display: block;
            margin: 0 auto 10px auto;
            max-width: 60px;
            height: auto;
        }

        .footer-text {
            color: #7f8c8d;
            font-size: 12px;
            margin: 4px 0;
            line-height: 1.3;
        }

        .footer-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
        }

        /* Responsive */
        @media only screen and (max-width: 800px) {
            .email-wrapper {
                padding: 20px 10px;
            }

            .email-content {
                padding: 30px 20px;
            }

            .email-header {
                padding: 30px 20px;
            }

            .email-content h1 {
                font-size: 28px;
            }

            .email-content h2 {
                font-size: 22px;
            }
        }

        /* Stat box responsive styles */
        @media only screen and (max-width: 480px) {
            .stat-box-table td.stat-box-cell {
                display: block !important;
                width: 100% !important;
                padding: 4px 0 !important;
            }

            .stat-box-value {
                font-size: 20px !important;
            }

            .stat-box-label {
                font-size: 11px !important;
            }

            .stat-box-inner {
                padding: 14px 12px !important;
            }
        }

        @media only screen and (max-width: 380px) {
            .stat-box-value {
                font-size: 16px !important;
            }
        }

    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            <div class="email-header">
                <div class="logo-container">
                    ${getLogoImage()}
                </div>
            </div>
			${isBusinessEmail ? `
				<div style="padding: 0 30px;">
					<div style="border-radius: 10px; display: inline-block; height: 2px; width: 100%; background-color: #e0e0e0;"></div>
				</div>
			` : ''}
            <div class="email-content">
                ${content}
            </div>
            <div class="email-footer">
                <div class="footer-content">
					<a href="${(process.env.APP_URL || '').startsWith('http') ? process.env.APP_URL : `https://${process.env.APP_URL || ''}`}" class="footer-logo-link">
                        <img
                            src="${process.env.APP_ICON_URL || ''}"
                            alt="${process.env.APP_NAME || 'ABA'} logo"
                            width="60"
                            height="60"
                            style="display: block; margin: 0 auto 10px auto; max-width: 60px; width: 60px; height: auto;"
                        />
                    </a>
                    <p class="footer-text">© ${new Date().getFullYear()} ${process.env.APP_NAME || 'ABA'}</p>
                    <p class="footer-text">
                        <a href="${(process.env.APP_URL || '').startsWith('http') ? process.env.APP_URL : `https://${process.env.APP_URL || ''}`}" class="footer-link">${process.env.APP_URL || ''}</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
`;
};
