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
import type { FloorplanItem, FloorplanTotal } from './bom';
import type { Item } from './item';
import type { Category } from './category';

interface PivotItem {
  name: string;
  floorQuantities: Record<number, number>; // floorplanId -> quantity
  totalQuantity: number;
  unitPrice: number;
  total: number;
  categoryId: number;
  categorySortOrder: number;
  categoryName: string;
  isAddon: boolean;
  parentItemName: string | null;
}

interface InvoiceDocxData {
  projectName: string;
  projectNumber: string;
  customerName: string;
  floorplanTotals: FloorplanTotal[];
  projectTotal: number;
  invoiceSettings: InvoiceSettings | null;
  items: Item[];
  categories: Category[];
}

const createBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

// Transform data to pivot format, sorted by category then interleaved addons
const transformToPivot = (floorplanTotals: FloorplanTotal[]): { items: PivotItem[], floorplans: Floorplan[] } => {
  const itemMap = new Map<string, PivotItem>();
  const floorplans: Floorplan[] = floorplanTotals.map(ft => ft.floorplan);

  floorplanTotals.forEach((floorplanData) => {
    const floorplanId = floorplanData.floorplan.id;

    floorplanData.items.forEach((item: FloorplanItem) => {
      // For addons, key by parentItemName + " > " + name to prevent cross-parent merging
      const pivotKey = item.isAddon ? `${item.parentItemName} > ${item.name}` : item.name;
      const existingItem = itemMap.get(pivotKey);

      if (existingItem) {
        existingItem.floorQuantities[floorplanId] = (existingItem.floorQuantities[floorplanId] || 0) + item.quantity;
        existingItem.totalQuantity += item.quantity;
        existingItem.total += item.total;
      } else {
        itemMap.set(pivotKey, {
          name: item.name,
          floorQuantities: { [floorplanId]: item.quantity },
          totalQuantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          categoryId: item.categoryId,
          categorySortOrder: item.categorySortOrder,
          categoryName: item.categoryName,
          isAddon: item.isAddon,
          parentItemName: item.parentItemName,
        });
      }
    });
  });

  // Group by category, sort categories by sort_order
  const categoryGroups = new Map<string, { sortOrder: number; nonAddons: PivotItem[]; addonsByParent: Map<string, PivotItem[]> }>();

  itemMap.forEach((pivotItem) => {
    const catKey = pivotItem.categoryName;
    if (!categoryGroups.has(catKey)) {
      categoryGroups.set(catKey, {
        sortOrder: pivotItem.categorySortOrder,
        nonAddons: [],
        addonsByParent: new Map(),
      });
    }
    const group = categoryGroups.get(catKey)!;
    if (!pivotItem.isAddon) {
      group.nonAddons.push(pivotItem);
    } else {
      const parentKey = pivotItem.parentItemName ?? '';
      if (!group.addonsByParent.has(parentKey)) {
        group.addonsByParent.set(parentKey, []);
      }
      group.addonsByParent.get(parentKey)!.push(pivotItem);
    }
  });

  // Sort categories by sort_order
  const sortedCategories = Array.from(categoryGroups.entries()).sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  // Flatten: for each category, sort non-addons alphabetically, then interleave their addons
  const sortedItems: PivotItem[] = [];
  sortedCategories.forEach(([, group]) => {
    group.nonAddons.sort((a, b) => a.name.localeCompare(b.name));
    group.nonAddons.forEach((nonAddon) => {
      sortedItems.push(nonAddon);
      const addons = group.addonsByParent.get(nonAddon.name) || [];
      addons.sort((a, b) => a.name.localeCompare(b.name));
      addons.forEach(addon => sortedItems.push(addon));
    });
    // Also handle addons whose parent wasn't found in this category (edge case)
    group.addonsByParent.forEach((addons, parentKey) => {
      if (!group.nonAddons.find(n => n.name === parentKey)) {
        addons.sort((a, b) => a.name.localeCompare(b.name));
        addons.forEach(addon => sortedItems.push(addon));
      }
    });
  });

  return { items: sortedItems, floorplans };
};

export const generateInvoiceDOCX = async (data: InvoiceDocxData): Promise<void> => {
  const { items, floorplans } = transformToPivot(data.floorplanTotals);
  const rows: TableRow[] = [];

  // Calculate column widths
  const numFloorplanCols = floorplans.length;
  const floorplanWidthPercent = 12; // Each floorplan column gets ~12%
  const itemWidthPercent = 28 - (numFloorplanCols * 2); // Adjust item width based on floor count
  const fixedWidthPercent = 8; // For #, TotalQty, UnitPrice, Total columns

  // Header row
  const headerCells: TableCell[] = [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true, font: 'Bahnschrift Light' })] })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Item Description', bold: true, font: 'Bahnschrift Light' })], alignment: AlignmentType.LEFT })],
      width: { size: itemWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
  ];

  // Add floorplan columns
  floorplans.forEach((floorplan) => {
    headerCells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: floorplan.name, bold: true, font: 'Bahnschrift Light' })], alignment: AlignmentType.CENTER })],
        width: { size: floorplanWidthPercent, type: WidthType.PERCENTAGE },
        shading: { fill: 'E0E0E0' },
        borders: createBorder,
      })
    );
  });

  // Add remaining columns
  headerCells.push(
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Total\nQuantity', bold: true, font: 'Bahnschrift Light' })], alignment: AlignmentType.CENTER })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Unit Price ($)', bold: true, font: 'Bahnschrift Light' })], alignment: AlignmentType.RIGHT })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true, font: 'Bahnschrift Light' })], alignment: AlignmentType.RIGHT })],
      width: { size: fixedWidthPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    })
  );

  rows.push(new TableRow({ children: headerCells }));

  // Data rows — track category to insert header rows when category changes
  const totalCols = numFloorplanCols + 6; // # + Item + floors + TotalQty + UnitPrice + Total
  let currentCategoryName: string | null = null;
  let rowNumber = 0;

  items.forEach((item) => {
    // Insert category header row when category changes
    if (item.categoryName !== currentCategoryName) {
      currentCategoryName = item.categoryName;
      const categoryHeaderRow = new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: item.categoryName, bold: true, font: 'Bahnschrift Light', size: 18 })],
                alignment: AlignmentType.LEFT,
              }),
            ],
            columnSpan: totalCols,
            shading: { fill: 'D0D0D0' },
            borders: createBorder,
          }),
        ],
      });
      rows.push(categoryHeaderRow);
    }

    rowNumber++;
    const displayName = item.isAddon ? `  ↳ ${item.name}` : item.name;

    const dataCells: TableCell[] = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: rowNumber.toString(), font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.CENTER })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: displayName, font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.LEFT })],
        borders: createBorder,
      }),
    ];

    // Add quantity for each floorplan
    floorplans.forEach((floorplan) => {
      const qty = item.floorQuantities[floorplan.id] || 0;
      dataCells.push(
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: qty.toString(), font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.CENTER })],
          borders: createBorder,
        })
      );
    });

    // Add total quantity, unit price, and total
    dataCells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: item.totalQuantity.toString(), font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.CENTER })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: `$${item.unitPrice.toLocaleString('en-US')}`, font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.RIGHT })],
        borders: createBorder,
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: `$${item.total.toLocaleString('en-US')}`, font: 'Bahnschrift Light', size: 18 })], alignment: AlignmentType.RIGHT })],
        borders: createBorder,
      })
    );

    rows.push(new TableRow({ children: dataCells }));
  });

  // Calculate summary values
  const discount = data.invoiceSettings?.discount_usd || 0;
  const services = data.invoiceSettings?.services_usd || 0;
  const afterDiscount = Math.max(0, data.projectTotal - discount);
  const grandTotalUsd = Math.max(0, afterDiscount + services);
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
              children: [new TextRun({ text: 'Total for all floors (USD)', bold: true, font: 'Bahnschrift Light', size: 20 })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          columnSpan: labelColSpan,
          borders: createBorder,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: `$${data.projectTotal.toLocaleString('en-US')}`, bold: true, font: 'Bahnschrift Light', size: 20 })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          columnSpan: 2,
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
                children: [new TextRun({ text: 'DISCOUNT', bold: true, color: 'FF0000', font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `-$${discount.toLocaleString('en-US')}`, bold: true, color: 'FF0000', font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 2,
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
                children: [new TextRun({ text: 'Total after Discount (USD)', bold: true, font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `$${afterDiscount.toLocaleString('en-US')}`, bold: true, font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 2,
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
                children: [new TextRun({ text: 'System Design, Programming & Commissioning', bold: true, italics: true, font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `$${services.toLocaleString('en-US')}`, bold: true, font: 'Bahnschrift Light', size: 20 })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 2,
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
              children: [new TextRun({ text: 'Grand Total (USD)', bold: true, size: 20, font: 'Bahnschrift Light' })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          columnSpan: labelColSpan,
          borders: createBorder,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: `$${grandTotalUsd.toLocaleString('en-US')}`, bold: true, size: 20, font: 'Bahnschrift Light' })],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          columnSpan: 2,
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
                children: [new TextRun({ text: `Grand Total (${currencyCode})`, bold: true, size: 20, font: 'Bahnschrift Light' })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: labelColSpan,
            borders: createBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${currencySymbol} ${Math.round(grandTotalLocal).toLocaleString('en-US')}`,
                    bold: true,
                    size: 20,
                    font: 'Bahnschrift Light',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            columnSpan: 2,
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
    styles: {
      default: {
        document: {
          run: {
            font: 'Bahnschrift Light',
            size: 18, // 9pt
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: `Project: ${data.projectName}`, size: 22, bold: true, font: 'Bahnschrift Light' })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Customer: ${data.customerName}`, size: 22, bold: true, font: 'Bahnschrift Light' })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Ref: ${data.projectNumber}`, size: 22, bold: true, font: 'Bahnschrift Light' })],
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
