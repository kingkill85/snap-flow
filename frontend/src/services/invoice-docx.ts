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
import type { Area } from './area';
import type { Placement } from './placement';

export interface FloorplanAreaData {
  floorplan: Floorplan;
  areas: Area[];
  placements: Placement[];
}

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
  itemTypeName: string | null;
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
  floorplanAreaData?: FloorplanAreaData[];
  filterTypeName?: string;
  filenameSuffix?: string;
}

const createBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

// Transform data to pivot format, sorted by category then interleaved addons
const transformToPivot = (floorplanTotals: FloorplanTotal[], filterTypeName?: string): { items: PivotItem[], floorplans: Floorplan[] } => {
  const itemMap = new Map<string, PivotItem>();
  const floorplans: Floorplan[] = floorplanTotals.map(ft => ft.floorplan);

  floorplanTotals.forEach((floorplanData) => {
    const floorplanId = floorplanData.floorplan.id;

    floorplanData.items.filter((item: FloorplanItem) => {
      if (!filterTypeName) return true;
      return item.itemTypeName === filterTypeName;
    }).forEach((item: FloorplanItem) => {
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
          itemTypeName: item.itemTypeName,
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

function createAreaSummarySection(
  floorplanName: string,
  areas: Area[],
  placements: Placement[],
  items: Item[],
  categories: Category[],
  filterTypeName?: string,
): (Paragraph | Table)[] {
  // Only consider item-type placements, filtered by type if specified
  const itemPlacements = placements.filter(p => {
    if (p.type !== 'item') return false;
    if (!filterTypeName) return true;
    const item = items.find(i => i.id === p.item_id);
    return item?.type_name === filterTypeName;
  });

  // Collect unique category IDs that appear in placements for this floorplan
  const categoryIdSet = new Set<number>();
  itemPlacements.forEach(p => {
    const item = items.find(i => i.id === p.item_id);
    if (item) categoryIdSet.add(item.category_id);
  });

  // Get active categories sorted by sort_order
  const activeCategories = categories
    .filter(c => categoryIdSet.has(c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeCategories.length === 0) {
    return [
      new Paragraph({
        children: [new TextRun({ text: `${floorplanName} — Area Summary`, bold: true, size: 24, font: 'Bahnschrift Light' })],
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'No devices placed in this floorplan.', font: 'Bahnschrift Light', size: 18 })],
        spacing: { after: 200 },
      }),
    ];
  }

  // Build a map: areaId (or null) -> categoryId -> count
  const areaMap = new Map<number | null, Map<number, number>>();
  // Initialise all known areas
  areas.forEach(area => areaMap.set(area.id, new Map()));
  // Also initialise null (Unassigned)
  areaMap.set(null, new Map());

  itemPlacements.forEach(p => {
    const item = items.find(i => i.id === p.item_id);
    if (!item) return;
    const areaKey = p.area_id ?? null;
    if (!areaMap.has(areaKey)) {
      areaMap.set(areaKey, new Map());
    }
    const catMap = areaMap.get(areaKey)!;
    catMap.set(item.category_id, (catMap.get(item.category_id) || 0) + 1);
  });

  // Calculate total counts per category (header row suffix)
  const categoryTotals = new Map<number, number>();
  activeCategories.forEach(c => {
    let total = 0;
    areaMap.forEach(catMap => {
      total += catMap.get(c.id) || 0;
    });
    categoryTotals.set(c.id, total);
  });

  // Column widths: area name column + one per category
  const numCategoryCols = activeCategories.length;
  const areaColPercent = Math.max(20, 40 - numCategoryCols * 2);
  const catColPercent = Math.floor((100 - areaColPercent) / numCategoryCols);

  // Build header row
  const headerCells: TableCell[] = [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Area', bold: true, font: 'Bahnschrift Light' })] })],
      width: { size: areaColPercent, type: WidthType.PERCENTAGE },
      shading: { fill: 'E0E0E0' },
      borders: createBorder,
    }),
  ];
  activeCategories.forEach(cat => {
    const total = categoryTotals.get(cat.id) || 0;
    headerCells.push(
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: `${cat.name} (${total})`, bold: true, font: 'Bahnschrift Light', size: 16 })],
          alignment: AlignmentType.CENTER,
        })],
        width: { size: catColPercent, type: WidthType.PERCENTAGE },
        shading: { fill: 'E0E0E0' },
        borders: createBorder,
      })
    );
  });

  const tableRows: TableRow[] = [new TableRow({ children: headerCells })];

  // Area data rows (named areas first, then Unassigned)
  const orderedAreaKeys: Array<number | null> = [
    ...areas.map(a => a.id as number | null),
  ];
  // Only add Unassigned row if there are unassigned placements
  const unassignedMap = areaMap.get(null);
  const hasUnassigned = unassignedMap && Array.from(unassignedMap.values()).some(v => v > 0);
  if (hasUnassigned) {
    orderedAreaKeys.push(null);
  }

  orderedAreaKeys.forEach(areaKey => {
    const catMap = areaMap.get(areaKey) || new Map();
    // Skip areas with no devices
    const hasDevices = activeCategories.some(c => (catMap.get(c.id) || 0) > 0);
    if (!hasDevices) return;

    const areaName = areaKey === null
      ? 'Unassigned'
      : (areas.find(a => a.id === areaKey)?.name || `Area ${areaKey}`);

    const rowCells: TableCell[] = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: areaName, font: 'Bahnschrift Light', size: 18 })] })],
        borders: createBorder,
      }),
    ];
    activeCategories.forEach(cat => {
      const count = catMap.get(cat.id) || 0;
      rowCells.push(
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: count > 0 ? count.toString() : '', font: 'Bahnschrift Light', size: 18 })],
            alignment: AlignmentType.CENTER,
          })],
          borders: createBorder,
        })
      );
    });
    tableRows.push(new TableRow({ children: rowCells }));
  });

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  return [
    new Paragraph({
      children: [new TextRun({ text: `${floorplanName} — Area Summary`, bold: true, size: 24, font: 'Bahnschrift Light' })],
      spacing: { before: 400, after: 200 },
    }),
    table,
  ];
}

export const generateInvoiceDOCX = async (data: InvoiceDocxData): Promise<void> => {
  const { items, floorplans } = transformToPivot(data.floorplanTotals, data.filterTypeName);

  // When filtering by type, recalculate project total from the filtered items
  const effectiveProjectTotal = data.filterTypeName
    ? items.reduce((sum, item) => sum + item.total, 0)
    : data.projectTotal;

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
  const afterDiscount = Math.max(0, effectiveProjectTotal - discount);
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
              children: [new TextRun({ text: `$${effectiveProjectTotal.toLocaleString('en-US')}`, bold: true, font: 'Bahnschrift Light', size: 20 })],
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

  // Build area summary sections for each floorplan that has area data
  const areaSummaryElements: (Paragraph | Table)[] = [];
  if (data.floorplanAreaData && data.floorplanAreaData.length > 0) {
    data.floorplanAreaData.forEach(fpData => {
      const elements = createAreaSummarySection(
        fpData.floorplan.name,
        fpData.areas,
        fpData.placements,
        data.items,
        data.categories,
        data.filterTypeName,
      );
      areaSummaryElements.push(...elements);
    });
  }

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
      // Area summary sections — each floorplan on a new page
      ...areaSummaryElements.length > 0 ? [{
        properties: {},
        children: areaSummaryElements,
      }] : [],
    ],
  });

  // Generate blob and open in new tab
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.projectName.replace(/[/\\:*?"<>|]/g, '')}${data.filenameSuffix ? data.filenameSuffix.replace(/_/g, ' ') : ''} Proposal.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
