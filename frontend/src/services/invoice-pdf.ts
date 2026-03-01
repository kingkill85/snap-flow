import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceSettings } from './invoice-settings';
import type { Floorplan } from './floorplan';

interface FloorplanTotal {
  floorplan: Floorplan;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

interface InvoicePdfData {
  projectName: string;
  projectNumber: string;
  customerName: string;
  floorplanTotals: FloorplanTotal[];
  projectTotal: number;
  invoiceSettings: InvoiceSettings | null;
}

export const generateInvoicePDF = (data: InvoicePdfData): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margin = 15;
  
  // Header
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Project: ${data.projectName}`, margin, 20);
  doc.text(`Customer: ${data.customerName}`, margin, 26);
  doc.text(`Ref: ${data.projectNumber}`, margin, 32);
  
  // Build one unified table body
  const tableBody: any[] = [];
  
  // Add floorplan sections
  data.floorplanTotals.forEach((floorplanData) => {
    // Floorplan name row (colSpan 5)
    tableBody.push([
      { content: floorplanData.floorplan.name, colSpan: 5, styles: { fontStyle: 'bold', halign: 'left' } }
    ]);
    
    // Items rows
    if (floorplanData.items.length > 0) {
      floorplanData.items.forEach((item, idx) => {
        tableBody.push([
          (idx + 1).toString(),
          item.name,
          item.quantity.toString(),
          `$${item.unitPrice.toLocaleString('en-US')}`,
          item.total > 0 ? `$${item.total.toLocaleString('en-US')}` : '-',
        ]);
      });
    } else {
      tableBody.push(['1', 'No items', '-', '-', '-']);
    }
    
    // Floorplan total row - label spans columns 1-3, value in column 4
    tableBody.push([
      { content: `${floorplanData.floorplan.name} Total (USD)`, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: `$${floorplanData.total.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right' } },
    ]);
    
    // Empty separator row with full colspan
    tableBody.push([{ content: '', colSpan: 5, styles: { minCellHeight: 8 } }]);
  });
  
  // Summary section
  // Project total
  tableBody.push([
    { content: 'Total for all floors (USD)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: `$${data.projectTotal.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right' } },
  ]);
  
  // Invoice calculations
  if (data.invoiceSettings) {
    const discount = data.invoiceSettings.discount_usd || 0;
    const services = data.invoiceSettings.services_usd || 0;
    const afterDiscount = data.projectTotal - discount;
    const grandTotalUsd = afterDiscount + services;
    const exchangeRate = data.invoiceSettings.exchange_rate || 0;
    const grandTotalLocal = grandTotalUsd * exchangeRate;
    const currencyCode = data.invoiceSettings.local_currency_code || 'PKR';

    if (discount > 0) {
      tableBody.push([
        { content: 'DISCOUNT', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 0, 0] } },
        { content: `-$${discount.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right', textColor: [255, 0, 0] } },
      ]);
      tableBody.push([
        { content: 'Total after Discount (USD)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `$${afterDiscount.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right' } },
      ]);
    }
    
    if (services > 0) {
      tableBody.push([
        { content: 'System Design, Programming & Commissioning', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `$${services.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right' } },
      ]);
    }
    
    tableBody.push([
      { content: 'Grand Total (USD)', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', fontSize: 11 } },
      { content: `$${grandTotalUsd.toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right', fontSize: 11 } },
    ]);
    
    if (exchangeRate > 0) {
      const currencySymbol = currencyCode === 'PKR' ? 'Rs' : currencyCode;
      tableBody.push([
        { content: `Grand Total (${currencyCode})`, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', fontSize: 11 } },
        { content: `${currencySymbol}${Math.round(grandTotalLocal).toLocaleString('en-US')}`, styles: { fontStyle: 'bold', halign: 'right', fontSize: 11 } },
      ]);
    }
  }

  // Render single table
  autoTable(doc, {
    startY: 45,
    head: [['#', 'Item Description', 'Qty', { content: 'Unit Price', styles: { halign: 'right' } }, { content: 'Total', styles: { halign: 'right' } }]],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },

  });

  // Open PDF in new tab instead of downloading
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};
