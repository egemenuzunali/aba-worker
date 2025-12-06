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

// Page layout constants
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const PAGE_BOTTOM = PAGE_HEIGHT - 70; // Leave room for footer

// Colors
const COLORS = {
	primary: '#667eea',
	text: '#2c3e50',
	lightGray: '#f8f9fa',
	borderGray: '#dee2e6',
	danger: '#EC0000',
	warning: '#ffc107',
	white: '#ffffff',
	footerGray: '#7f8c8d'
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
				margin: MARGIN,
				info: {
					Title: `Kwartaaloverzicht Openstaande Facturen - ${quarterName}`,
					Author: companyName,
					Subject: 'Openstaande Facturen Overzicht',
					Creator: process.env.APP_NAME || 'ABA'
				}
			});

			// Collect PDF buffer chunks
			const chunks: Buffer[] = [];
			doc.on('data', (chunk: Buffer) => chunks.push(chunk));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);

			// Table configuration
			const tableWidth = CONTENT_WIDTH;
			const colWidths = [55, 145, 70, 75, 80, 65];
			const colX: number[] = [];
			let xPos = MARGIN;
			for (const width of colWidths) {
				colX.push(xPos);
				xPos += width;
			}
			const headers = ['Factuurnr.', 'Klant', 'Datum', 'Vervaldatum', 'Bedrag', 'Verlopen'];
			const rowHeight = 20;
			const headerHeight = 24;

			let currentPage = 1;

			// Draw footer on current page using save/restore to not affect document state
			const drawFooter = () => {
				doc.save();
				// Footer line
				doc.strokeColor(COLORS.borderGray)
					.lineWidth(1)
					.moveTo(MARGIN, PAGE_HEIGHT - 50)
					.lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50)
					.stroke();

				// Footer text
				doc.fillColor(COLORS.footerGray)
					.fontSize(8)
					.font('Helvetica');

				const footerText = `${process.env.APP_NAME || 'ABA'} - Kwartaaloverzicht ${quarterName} - Pagina ${currentPage}`;
				const textWidth = doc.widthOfString(footerText);
				const textX = (PAGE_WIDTH - textWidth) / 2;
				doc.text(footerText, textX, PAGE_HEIGHT - 35, { lineBreak: false });
				doc.restore();
			};

			// Helper function to draw table header
			const drawTableHeader = (y: number): number => {
				doc.rect(MARGIN, y, tableWidth, headerHeight).fill(COLORS.lightGray);
				doc.fillColor(COLORS.text).fontSize(9).font('Helvetica-Bold');
				headers.forEach((header, i) => {
					doc.text(header, colX[i] + 4, y + 7, {
						width: colWidths[i] - 8,
						lineBreak: false
					});
				});
				return y + headerHeight;
			};

			// Helper to create new page
			const createNewPage = (): number => {
				drawFooter();
				doc.addPage();
				currentPage++;
				return MARGIN;
			};

			// ===== PAGE 1: Header and Summary =====

			// Header banner
			doc.rect(0, 0, PAGE_WIDTH, 100).fill(COLORS.primary);
			doc.fillColor(COLORS.white)
				.fontSize(22)
				.font('Helvetica-Bold')
				.text('Kwartaaloverzicht Openstaande Facturen', MARGIN, 35, { lineBreak: false });
			doc.fontSize(12)
				.font('Helvetica')
				.text(`${companyName} - ${quarterName}`, MARGIN, 62, { lineBreak: false });

			// Summary section
			let y = 120;
			doc.fillColor(COLORS.text).fontSize(16).font('Helvetica-Bold')
				.text('Samenvatting', MARGIN, y, { lineBreak: false });

			y += 25;

			// Summary box
			doc.rect(MARGIN, y, CONTENT_WIDTH, 75).fill(COLORS.lightGray);

			const summaryCol1 = MARGIN + 20;
			const summaryCol2 = MARGIN + 180;
			const summaryCol3 = MARGIN + 340;

			doc.fillColor(COLORS.text).fontSize(10).font('Helvetica-Bold');
			doc.text('Totaal Openstaand:', summaryCol1, y + 15, { lineBreak: false });
			doc.text('Openstaande Facturen:', summaryCol2, y + 15, { lineBreak: false });
			doc.text('Verlopen Facturen:', summaryCol3, y + 15, { lineBreak: false });

			doc.font('Helvetica').fontSize(11);
			doc.text(formatCurrency(totalOpenAmount), summaryCol1, y + 32, { lineBreak: false });
			doc.text(totalOpenInvoices.toString(), summaryCol2, y + 32, { lineBreak: false });
			doc.fillColor(overdueInvoices > 0 ? COLORS.danger : COLORS.text)
				.text(overdueInvoices.toString(), summaryCol3, y + 32, { lineBreak: false });

			doc.fillColor(COLORS.text).fontSize(9).font('Helvetica')
				.text(`Gegenereerd op: ${formatDate(generatedDate)}`, summaryCol1, y + 52, { lineBreak: false });

			y += 95;

			// ===== Invoices Table =====
			if (invoices.length > 0) {
				doc.fillColor(COLORS.text).fontSize(16).font('Helvetica-Bold')
					.text('Openstaande Facturen', MARGIN, y, { lineBreak: false });

				y += 25;
				y = drawTableHeader(y);

				// Draw invoice rows
				doc.font('Helvetica').fontSize(9);

				for (const invoice of invoices) {
					// Check if we need a new page
					if (y + rowHeight > PAGE_BOTTOM) {
						y = createNewPage();
						y = drawTableHeader(y);
						doc.font('Helvetica').fontSize(9);
					}

					// Row border at bottom
					doc.strokeColor(COLORS.borderGray)
						.lineWidth(0.5)
						.moveTo(MARGIN, y + rowHeight)
						.lineTo(MARGIN + tableWidth, y + rowHeight)
						.stroke();

					// Row data
					doc.fillColor(COLORS.text);
					doc.text(invoice.invoiceNumber.toString(), colX[0] + 4, y + 5, {
						width: colWidths[0] - 8, lineBreak: false
					});

					const clientName = invoice.clientName.length > 22
						? invoice.clientName.substring(0, 19) + '...'
						: invoice.clientName;
					doc.text(clientName, colX[1] + 4, y + 5, {
						width: colWidths[1] - 8, lineBreak: false
					});

					doc.text(formatDate(invoice.invoiceDate), colX[2] + 4, y + 5, {
						width: colWidths[2] - 8, lineBreak: false
					});
					doc.text(formatDate(invoice.expirationDate), colX[3] + 4, y + 5, {
						width: colWidths[3] - 8, lineBreak: false
					});
					doc.text(formatCurrency(invoice.totalAmount), colX[4] + 4, y + 5, {
						width: colWidths[4] - 8, lineBreak: false
					});

					// Overdue column with color coding
					if (invoice.daysOverdue > 0) {
						const color = invoice.daysOverdue > 30 ? COLORS.danger : COLORS.warning;
						doc.fillColor(color).text(`${invoice.daysOverdue} dagen`, colX[5] + 4, y + 5, {
							width: colWidths[5] - 8, lineBreak: false
						});
					} else {
						doc.fillColor(COLORS.text).text('-', colX[5] + 4, y + 5, {
							width: colWidths[5] - 8, lineBreak: false
						});
					}

					y += rowHeight;
				}

				// Total row - check if it needs a new page
				if (y + 24 > PAGE_BOTTOM) {
					y = createNewPage();
					doc.font('Helvetica').fontSize(9);
				}

				doc.rect(MARGIN, y, tableWidth, 24).fill(COLORS.primary);
				doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(10);
				doc.text('Totaal', colX[0] + 4, y + 7, { lineBreak: false });
				doc.text(`${totalOpenInvoices} facturen`, colX[1] + 4, y + 7, { lineBreak: false });
				doc.text(formatCurrency(totalOpenAmount), colX[4] + 4, y + 7, { lineBreak: false });

			} else {
				doc.fillColor(COLORS.text).fontSize(12).font('Helvetica')
					.text('Er zijn geen openstaande facturen voor deze periode.', MARGIN, y + 20, { lineBreak: false });
			}

			// Add footer to the last page
			drawFooter();

			// Finalize the PDF
			doc.end();

		} catch (error) {
			reject(error);
		}
	});
};
