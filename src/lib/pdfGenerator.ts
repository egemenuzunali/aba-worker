/**
 * PDF Generator for quarterly open invoice reports
 * Uses pdfkit to generate professional PDF documents
 */
import PDFDocument from 'pdfkit';
import { OpenInvoiceSummary } from './emailTemplates/quarterlyReport';

export interface QuarterlyReportPdfParams {
	companyName: string;
	quarterName: string;
	generatedDate: Date;
	totalOpenAmount: number;
	totalOpenInvoices: number;
	overdueInvoices: number;
	invoices: OpenInvoiceSummary[];
}

const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat('nl-NL', {
		style: 'currency',
		currency: 'EUR'
	}).format(amount);
};

const formatDate = (date: Date): string => {
	return new Date(date).toLocaleDateString('nl-NL');
};

/**
 * Generate a PDF buffer for the quarterly open invoice report
 */
export const generateQuarterlyReportPdf = async (params: QuarterlyReportPdfParams): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		try {
			const {
				companyName,
				quarterName,
				generatedDate,
				totalOpenAmount,
				totalOpenInvoices,
				overdueInvoices,
				invoices
			} = params;

			// Create PDF document
			const doc = new PDFDocument({
				size: 'A4',
				margin: 50,
				info: {
					Title: `Kwartaaloverzicht Openstaande Facturen - ${quarterName}`,
					Author: companyName,
					Subject: 'Openstaande Facturen Overzicht',
					Creator: process.env.APP_NAME || 'ABA'
				}
			});

			// Collect PDF buffer
			const chunks: Buffer[] = [];
			doc.on('data', (chunk: Buffer) => chunks.push(chunk));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);

			// Colors
			const primaryColor = '#667eea';
			const textColor = '#2c3e50';
			const lightGray = '#f8f9fa';
			const borderGray = '#dee2e6';
			const dangerColor = '#EC0000';
			const warningColor = '#ffc107';

			// Header
			doc.rect(0, 0, doc.page.width, 100)
				.fill(primaryColor);

			doc.fillColor('#ffffff')
				.fontSize(24)
				.font('Helvetica-Bold')
				.text('Kwartaaloverzicht Openstaande Facturen', 50, 35);

			doc.fontSize(12)
				.font('Helvetica')
				.text(`${companyName} - ${quarterName}`, 50, 65);

			// Reset position
			doc.y = 120;

			// Summary section
			doc.fillColor(textColor)
				.fontSize(16)
				.font('Helvetica-Bold')
				.text('Samenvatting', 50, doc.y);

			doc.y += 15;

			// Summary box
			const summaryY = doc.y;
			doc.rect(50, summaryY, doc.page.width - 100, 80)
				.fill(lightGray);

			doc.fillColor(textColor)
				.fontSize(11)
				.font('Helvetica');

			const col1X = 70;
			const col2X = 250;
			const col3X = 400;

			doc.font('Helvetica-Bold').text('Totaal Openstaand:', col1X, summaryY + 15);
			doc.font('Helvetica').text(formatCurrency(totalOpenAmount), col1X, summaryY + 30);

			doc.font('Helvetica-Bold').text('Openstaande Facturen:', col2X, summaryY + 15);
			doc.font('Helvetica').text(totalOpenInvoices.toString(), col2X, summaryY + 30);

			doc.font('Helvetica-Bold').text('Verlopen Facturen:', col3X, summaryY + 15);
			doc.fillColor(overdueInvoices > 0 ? dangerColor : textColor)
				.font('Helvetica')
				.text(overdueInvoices.toString(), col3X, summaryY + 30);

			doc.fillColor(textColor);

			doc.font('Helvetica')
				.fontSize(9)
				.text(`Gegenereerd op: ${formatDate(generatedDate)}`, col1X, summaryY + 55);

			doc.y = summaryY + 100;

			// Invoices table
			if (invoices.length > 0) {
				doc.fontSize(16)
					.font('Helvetica-Bold')
					.text('Openstaande Facturen', 50, doc.y);

				doc.y += 20;

				// Table header
				const tableTop = doc.y;
				const tableWidth = doc.page.width - 100;
				const colWidths = [60, 140, 70, 70, 80, 70]; // Factuurnr, Klant, Datum, Vervaldatum, Bedrag, Verlopen
				const colX = [50];
				for (let i = 1; i < colWidths.length; i++) {
					colX.push(colX[i - 1] + colWidths[i - 1]);
				}

				// Header background
				doc.rect(50, tableTop, tableWidth, 25)
					.fill(lightGray);

				// Header text
				doc.fillColor(textColor)
					.fontSize(9)
					.font('Helvetica-Bold');

				const headers = ['Factuurnr.', 'Klant', 'Datum', 'Vervaldatum', 'Bedrag', 'Verlopen'];
				headers.forEach((header, i) => {
					doc.text(header, colX[i] + 5, tableTop + 8, { width: colWidths[i] - 10 });
				});

				// Table rows
				doc.font('Helvetica').fontSize(9);
				let rowY = tableTop + 25;
				const rowHeight = 22;
				const pageBottom = doc.page.height - 80;

				for (const invoice of invoices) {
					// Check if we need a new page
					if (rowY + rowHeight > pageBottom) {
						doc.addPage();
						rowY = 50;

						// Repeat header on new page
						doc.rect(50, rowY, tableWidth, 25)
							.fill(lightGray);

						doc.fillColor(textColor)
							.fontSize(9)
							.font('Helvetica-Bold');

						headers.forEach((header, i) => {
							doc.text(header, colX[i] + 5, rowY + 8, { width: colWidths[i] - 10 });
						});

						doc.font('Helvetica');
						rowY += 25;
					}

					// Draw row border
					doc.strokeColor(borderGray)
						.lineWidth(0.5)
						.moveTo(50, rowY + rowHeight)
						.lineTo(50 + tableWidth, rowY + rowHeight)
						.stroke();

					// Row data
					doc.fillColor(textColor);
					doc.text(invoice.invoiceNumber.toString(), colX[0] + 5, rowY + 6, { width: colWidths[0] - 10 });

					// Truncate client name if too long
					const clientName = invoice.clientName.length > 25
						? invoice.clientName.substring(0, 22) + '...'
						: invoice.clientName;
					doc.text(clientName, colX[1] + 5, rowY + 6, { width: colWidths[1] - 10 });

					doc.text(formatDate(invoice.invoiceDate), colX[2] + 5, rowY + 6, { width: colWidths[2] - 10 });
					doc.text(formatDate(invoice.expirationDate), colX[3] + 5, rowY + 6, { width: colWidths[3] - 10 });
					doc.text(formatCurrency(invoice.totalAmount), colX[4] + 5, rowY + 6, { width: colWidths[4] - 10 });

					// Overdue with color coding
					if (invoice.daysOverdue > 0) {
						const overdueColor = invoice.daysOverdue > 30 ? dangerColor : warningColor;
						doc.fillColor(overdueColor)
							.text(`${invoice.daysOverdue} dagen`, colX[5] + 5, rowY + 6, { width: colWidths[5] - 10 });
					} else {
						doc.fillColor(textColor)
							.text('-', colX[5] + 5, rowY + 6, { width: colWidths[5] - 10 });
					}

					rowY += rowHeight;
				}

				// Total row
				doc.rect(50, rowY, tableWidth, 25)
					.fill(primaryColor);

				doc.fillColor('#ffffff')
					.font('Helvetica-Bold')
					.text('Totaal', colX[0] + 5, rowY + 8);
				doc.text(`${totalOpenInvoices} facturen`, colX[1] + 5, rowY + 8);
				doc.text(formatCurrency(totalOpenAmount), colX[4] + 5, rowY + 8);

			} else {
				// No invoices message
				doc.fontSize(12)
					.font('Helvetica')
					.fillColor(textColor)
					.text('Er zijn geen openstaande facturen voor deze periode.', 50, doc.y + 20);
			}

			// Footer on each page
			// bufferedPageRange returns { start: N, count: M } where start is 0-indexed
			const range = doc.bufferedPageRange();
			for (let i = 0; i < range.count; i++) {
				doc.switchToPage(range.start + i);

				// Footer line
				doc.strokeColor(borderGray)
					.lineWidth(1)
					.moveTo(50, doc.page.height - 50)
					.lineTo(doc.page.width - 50, doc.page.height - 50)
					.stroke();

				// Footer text
				doc.fillColor('#7f8c8d')
					.fontSize(8)
					.font('Helvetica')
					.text(
						`${process.env.APP_NAME || 'ABA'} - Kwartaaloverzicht ${quarterName} - Pagina ${i + 1} van ${range.count}`,
						50,
						doc.page.height - 40,
						{ align: 'center', width: doc.page.width - 100 }
					);
			}

			// Finalize PDF
			doc.end();

		} catch (error) {
			reject(error);
		}
	});
};
