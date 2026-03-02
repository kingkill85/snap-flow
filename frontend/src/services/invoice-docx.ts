import {
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  Packer,
} from 'docx';
import type { InvoiceSettings } from './invoice-settings';
import type { Floorplan } from './floorplan';

interface FloorplanItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface FloorplanTotal {
  floorplan: Floorplan;
  total: number;
  items: FloorplanItem[];
}

interface InvoiceDocxData {
  projectName: string;
  projectNumber: string;
  customerName: string;
  floorplanTotals: FloorplanTotal[];
  projectTotal: number;
  invoiceSettings: InvoiceSettings | null;
}

const createBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
};

export const generateInvoiceDOCX = async (data: InvoiceDocxData): Promise<void> => {
  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true })] })],
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F0F0' },
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: 'Product', bold: true })] })],
          width: { size: 47, type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F0F0' },
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: 'Qty', bold: true })], alignment: AlignmentType.CENTER })],
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F0F0' },
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: 'Unit Price', bold: true })], alignment: AlignmentType.RIGHT })],
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F0F0' },
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true })], alignment: AlignmentType.RIGHT })],
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F0F0' },
          borders: createBorder,
        }),
      ],
    })
  );

  // Add floorplan sections
  data.floorplanTotals.forEach((floorplanData) => {
    // Floorplan name row
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: floorplanData.floorplan.name, bold: true })],
              }),
            ],
            columnSpan: 5,
            borders: createBorder,
          }),
        ],
      })
    );

    // Items rows
    if (floorplanData.items.length > 0) {
      floorplanData.items.forEach((item, idx) => {
        rows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun((idx + 1).toString())], alignment: AlignmentType.CENTER })],
                borders: createBorder,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun(item.name)] })],
                borders: createBorder,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun(item.quantity.toString())], alignment: AlignmentType.CENTER })],
                borders: createBorder,
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun(`$${item.unitPrice.toLocaleString('en-US')}`)],
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
                borders: createBorder,
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun(item.total > 0 ? `$${item.total.toLocaleString('en-US')}` : '-')],
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
                borders: createBorder,
              }),
            ],
          })
        );
      });
    } else {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun('1')], alignment: AlignmentType.CENTER })],
              borders: createBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun('No items')] })],
              borders: createBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun('-')], alignment: AlignmentType.CENTER })],
              borders: createBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun('-')], alignment: AlignmentType.RIGHT })],
              borders: createBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun('-')], alignment: AlignmentType.RIGHT })],
              borders: createBorder,
            }),
          ],
        })
      );
    }

    // Floorplan total row
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${floorplanData.floorplan.name} Total (USD)`, bold: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 4,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `$${floorplanData.total.toLocaleString('en-US')}`, bold: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            borders: createBorder,
          }),
        ],
      })
    );

    // Empty separator row
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun('')] })],
            columnSpan: 5,
            borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } },
          }),
        ],
      })
    );
  });

  // Project total
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Total for all floors (USD)', bold: true })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          columnSpan: 4,
          borders: createBorder,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: `$${data.projectTotal.toLocaleString('en-US')}`, bold: true })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          borders: createBorder,
        }),
      ],
    })
  );

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
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'DISCOUNT', bold: true, color: 'FF0000' })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              columnSpan: 4,
              borders: createBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `-$${discount.toLocaleString('en-US')}`, bold: true, color: 'FF0000' })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              borders: createBorder,
            }),
          ],
        })
      );
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Total after Discount (USD)', bold: true })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              columnSpan: 4,
              borders: createBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `$${afterDiscount.toLocaleString('en-US')}`, bold: true })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              borders: createBorder,
            }),
          ],
        })
      );
    }

    if (services > 0) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'System Design, Programming & Commissioning', bold: true })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              columnSpan: 4,
              borders: createBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `$${services.toLocaleString('en-US')}`, bold: true })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              borders: createBorder,
            }),
          ],
        })
      );
    }

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Grand Total (USD)', bold: true, size: 22 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 4,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `$${grandTotalUsd.toLocaleString('en-US')}`, bold: true, size: 22 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            borders: createBorder,
          }),
        ],
      })
    );

    if (exchangeRate > 0) {
      const currencySymbol = currencyCode === 'PKR' ? 'Rs' : currencyCode;
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `Grand Total (${currencyCode})`, bold: true, size: 22 })],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              columnSpan: 4,
              borders: createBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${currencySymbol}${Math.round(grandTotalLocal).toLocaleString('en-US')}`,
                      bold: true,
                      size: 22,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
              borders: createBorder,
            }),
          ],
        })
      );
    }
  }

  const table = new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: `Project: ${data.projectName}`, size: 20 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Customer: ${data.customerName}`, size: 20 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Ref: ${data.projectNumber}`, size: 20 })],
            spacing: { after: 200 },
          }),
          table,
        ],
      },
    ],
  });

  // Generate blob and open in new tab
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
};
