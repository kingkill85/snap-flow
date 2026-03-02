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

interface PivotItem {
  name: string;
  floorQuantities: Record<number, number>; // floorplanId -> quantity
  totalQuantity: number;
  unitPrice: number;
  total: number;
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
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

// Transform data to pivot format
const transformToPivot = (floorplanTotals: FloorplanTotal[]): { items: PivotItem[], floorplans: Floorplan[] } => {
  const itemMap = new Map<string, PivotItem>();
  const floorplans: Floorplan[] = floorplanTotals.map(ft => ft.floorplan);

  floorplanTotals.forEach((floorplanData) => {
    const floorplanId = floorplanData.floorplan.id;

    floorplanData.items.forEach((item) => {
      const existingItem = itemMap.get(item.name);

      if (existingItem) {
        existingItem.floorQuantities[floorplanId] = item.quantity;
        existingItem.totalQuantity += item.quantity;
        existingItem.total += item.total;
      } else {
        itemMap.set(item.name, {
          name: item.name,
          floorQuantities: { [floorplanId]: item.quantity },
          totalQuantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        });
      }
    });
  });

  // Convert map to array and sort by name
  const items = Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { items, floorplans };
};

export const generateInvoiceDOCX = async (data: InvoiceDocxData): Promise<void> => {
  const { items, floorplans } = transformToPivot(data.floorplanTotals);
  const rows: TableRow[] = [];

  // Calculate column widths
  const numFloorplanCols = floorplans.length;
  const totalCols = 4 + numFloorplanCols; // # + Item + [floors] + TotalQty + UnitPrice + Total
  const floorplanWidthPercent = 12; // Each floorplan column gets ~12%
  const itemWidthPercent = 28 - (numFloorplanCols * 2); // Adjust item width based on floor count
  const fixedWidthPercent = 8; // For #, TotalQty, UnitPrice, Total columns

  // Header row
  const headerCells: TableCell[] = [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true })] })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Item Description', bold: true })], alignment: AlignmentType.LEFT })],
      width: { size: itemWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
  ];

  // Add floorplan columns
  floorplans.forEach((floorplan) => {
    headerCells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: floorplan.name, bold: true })], alignment: AlignmentType.CENTER })],
        width: { size: floorplanWidthPercent, type: WidthType.PERCENTAGE },
        shading: { fill: 'E0E0E0' },
        borders: createBorder,
      })
    );
  });

  // Add remaining columns
  headerCells.push(
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Total Quantity', bold: true })], alignment: AlignmentType.CENTER })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Unit Price ($)', bold: true })], alignment: AlignmentType.RIGHT })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true })], alignment: AlignmentType.RIGHT })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    })
  );

  rows.push(new TableRow({ children: headerCells }));

  // Data rows
  items.forEach((item, index) => {
    const dataCells: TableCell[] = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun((index + 1).toString())], alignment: AlignmentType.CENTER })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(item.name)], alignment: AlignmentType.LEFT })],
        borders: createBorder,
      }),
    ];

    // Add quantity for each floorplan
    floorplans.forEach((floorplan) => {
      const qty = item.floorQuantities[floorplan.id] || 0;
      dataCells.push(
        new TableCell({
          children: [new Paragraph({ children: [new TextRun(qty.toString())], alignment: AlignmentType.CENTER })],
          borders: createBorder,
        })
      );
    });

    // Add total quantity, unit price, and total
    dataCells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(item.totalQuantity.toString())], alignment: AlignmentType.CENTER })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(`$${item.unitPrice.toLocaleString('en-US')}`)], alignment: AlignmentType.RIGHT })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(`$${item.total.toLocaleString('en-US')}`)], alignment: AlignmentType.RIGHT })],
        borders: createBorder,
      })
    );

    rows.push(new TableRow({ children: dataCells }));
  });

  // Calculate summary values
  const discount = data.invoiceSettings?.discount_usd || 0;
  const services = data.invoiceSettings?.services_usd || 0;
  const afterDiscount = data.projectTotal - discount;
  const grandTotalUsd = afterDiscount + services;
  const exchangeRate = data.invoiceSettings?.exchange_rate || 0;
  const grandTotalLocal = grandTotalUsd * exchangeRate;
  const currencyCode = data.invoiceSettings?.local_currency_code || 'PKR';

  // Summary rows - calculate colspan based on floorplan count
  // Span: # + Item Description + floorplans + Total Quantity
  const labelColSpan = 1 + 1 + numFloorplanCols + 1; // # + Item + floors + TotalQty

  // Total for all floors
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
          columnSpan: labelColSpan,
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun('')] })],
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

  // Discount row
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
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun('')] })],
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

    // Total after discount
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
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun('')] })],
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

  // Services row
  if (services > 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'System Design, Programming & Commissioning', bold: true, italics: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun('')] })],
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

  // Grand Total (USD)
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
          columnSpan: labelColSpan,
          borders: createBorder,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun('')] })],
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

  // Grand Total (Local Currency)
  if (exchangeRate > 0) {
    const currencySymbol = currencyCode === 'PKR' ? 'PKR' : currencyCode;
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
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun('')] })],
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${currencySymbol} ${Math.round(grandTotalLocal).toLocaleString('en-US')}`,
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
