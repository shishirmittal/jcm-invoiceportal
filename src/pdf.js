import { jsPDF } from 'jspdf';
import { formatCurrency, formatDate } from './utils.js';

const NAVY = [15, 31, 61];
const GOLD = [201, 162, 75];
const MUTED = [107, 114, 128];
const TEXT = [28, 35, 51];

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 40;
const COL_X = { item: MARGIN, qty: 330, rate: 400, amount: 480 };
const ROW_H = 20;

function drawHeader(doc, customerName) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 90, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 90, PAGE_W, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('JCM Retails', MARGIN, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(230, 200, 119);
  doc.text('Tax Invoice', MARGIN, 60);

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`Billed to: ${customerName}`, PAGE_W - MARGIN, 40, { align: 'right' });
}

function drawItemsHeader(doc, y) {
  doc.setFillColor(245, 246, 248);
  doc.rect(MARGIN, y - 14, PAGE_W - MARGIN * 2, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('ITEM', COL_X.item + 4, y);
  doc.text('QTY', COL_X.qty, y, { align: 'right' });
  doc.text('RATE', COL_X.rate, y, { align: 'right' });
  doc.text('AMOUNT', COL_X.amount, y, { align: 'right' });
  return y + ROW_H;
}

export function generateInvoicePdf(customer, invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  drawHeader(doc, customer?.name || '');

  let y = 130;
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Invoice #${invoice.vch_no}`, MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(formatDate(invoice.vch_date), PAGE_W - MARGIN, y, { align: 'right' });

  y += 30;
  y = drawItemsHeader(doc, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT);

  const items = invoice.items || [];
  for (const item of items) {
    if (y > PAGE_H - 120) {
      doc.addPage();
      y = 50;
      y = drawItemsHeader(doc, y);
    }
    const amount = Number(item.taxable_amount || 0) + Number(item.tax_amount || 0);
    const name = doc.splitTextToSize(item.item_name || '', COL_X.qty - COL_X.item - 12);
    doc.text(name, COL_X.item + 4, y);
    doc.text(String(item.qty ?? ''), COL_X.qty, y, { align: 'right' });
    doc.text(formatCurrency(item.rate), COL_X.rate, y, { align: 'right' });
    doc.text(formatCurrency(amount), COL_X.amount, y, { align: 'right' });
    doc.setDrawColor(227, 229, 234);
    doc.line(MARGIN, y + 6, PAGE_W - MARGIN, y + 6);
    y += ROW_H * Math.max(1, name.length);
  }

  if (y > PAGE_H - 100) {
    doc.addPage();
    y = 60;
  }

  y += 10;
  doc.setDrawColor(...NAVY);
  doc.line(COL_X.rate - 10, y, PAGE_W - MARGIN, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text('Taxable Amount', COL_X.rate - 10, y);
  doc.setTextColor(...TEXT);
  doc.text(formatCurrency(invoice.taxable_amount), PAGE_W - MARGIN, y, { align: 'right' });

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('Total', COL_X.rate - 10, y);
  doc.text(formatCurrency(invoice.total_amount), PAGE_W - MARGIN, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('This is a computer-generated copy for reference purposes.', MARGIN, PAGE_H - 30);

  doc.save(`JCM-Invoice-${invoice.vch_no}.pdf`);
}
