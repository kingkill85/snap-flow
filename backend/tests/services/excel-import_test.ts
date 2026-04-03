import { assertEquals, assertExists, assertInstanceOf } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import {
  ExcelImportService,
  excelImportService,
  type ImportPreview,
  type ImportPreviewItem,
} from '../../src/services/excel-import.ts';

await setupTestDatabase();

// ---------------------------------------------------------------------------
// Helper: build a minimal valid ImportPreview
// ---------------------------------------------------------------------------
function makePreview(items: ImportPreviewItem[] = []): ImportPreview {
  return {
    items,
    errors: [],
    warnings: [],
    summary: {
      totalRows: items.length,
      itemsToCreate: items.filter((i) => i.action === 'create').length,
      itemsToUpdate: items.filter((i) => i.action === 'update').length,
    },
  };
}

function makePreviewItem(overrides: Partial<ImportPreviewItem> = {}): ImportPreviewItem {
  return {
    baseModelNumber: 'TEST-001',
    name: 'Test Item',
    category: 'Test Category',
    description: 'A test item',
    dimensions: '10x10x10',
    variants: [{ style: 'Black', price: 99.99 }],
    addons: [],
    existingItemId: undefined,
    action: 'create',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - can be instantiated directly', () => {
  clearDatabase();
  const service = new ExcelImportService();
  assertInstanceOf(service, ExcelImportService);
});

Deno.test('ExcelImportService - module exports a singleton instance', () => {
  clearDatabase();
  assertInstanceOf(excelImportService, ExcelImportService);
});

// ---------------------------------------------------------------------------
// executeImport — empty items array
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport with empty items returns zero counts', async () => {
  clearDatabase();

  const preview = makePreview([]);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 0);
  assertEquals(result.itemsUpdated, 0);
  assertEquals(result.variantsCreated, 0);
  assertEquals(result.variantsUpdated, 0);
  assertEquals(result.addonsCreated, 0);
  assertEquals(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// executeImport — create a new item with a variant
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport creates item and variant', async () => {
  clearDatabase();

  const item = makePreviewItem({
    baseModelNumber: 'IMPORT-100',
    name: 'Imported Light',
    category: 'Lighting',
    variants: [{ style: 'White', price: 149.0 }],
  });

  const preview = makePreview([item]);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 1);
  assertEquals(result.itemsUpdated, 0);
  assertEquals(result.variantsCreated, 1);
  assertEquals(result.errors.length, 0);
  // Category was not pre-existing, so a warning should be emitted
  assertEquals(result.warnings.some((w) => w.includes('Lighting')), true);
});

// ---------------------------------------------------------------------------
// executeImport — creates new category automatically
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport creates missing category with a warning', async () => {
  clearDatabase();

  const item = makePreviewItem({
    baseModelNumber: 'IMPORT-200',
    category: 'UnknownCategoryXYZ',
    variants: [{ style: 'Silver', price: 59.0 }],
  });

  const preview = makePreview([item]);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 1);
  assertExists(result.warnings.find((w) => w.includes('UnknownCategoryXYZ')));
});

// ---------------------------------------------------------------------------
// executeImport — multiple variants for one item
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport creates all variants for an item', async () => {
  clearDatabase();

  const item = makePreviewItem({
    baseModelNumber: 'IMPORT-300',
    category: 'Switches',
    variants: [
      { style: 'Black', price: 29.0 },
      { style: 'White', price: 29.0 },
      { style: 'Ivory', price: 32.0 },
    ],
  });

  const preview = makePreview([item]);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 1);
  assertEquals(result.variantsCreated, 3);
  assertEquals(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// executeImport — multiple items in one preview
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport handles multiple items', async () => {
  clearDatabase();

  const items = [
    makePreviewItem({ baseModelNumber: 'MULTI-001', name: 'Item One', category: 'CatA', variants: [{ style: 'S1', price: 10 }] }),
    makePreviewItem({ baseModelNumber: 'MULTI-002', name: 'Item Two', category: 'CatA', variants: [{ style: 'S2', price: 20 }] }),
  ];

  const preview = makePreview(items);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 2);
  assertEquals(result.variantsCreated, 2);
});

// ---------------------------------------------------------------------------
// executeImport — ImportResult shape
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport result has expected shape', async () => {
  clearDatabase();

  const preview = makePreview([]);
  const result = await excelImportService.executeImport(preview);

  assertExists(result);
  assertEquals(typeof result.success, 'boolean');
  assertEquals(typeof result.itemsCreated, 'number');
  assertEquals(typeof result.itemsUpdated, 'number');
  assertEquals(typeof result.variantsCreated, 'number');
  assertEquals(typeof result.variantsUpdated, 'number');
  assertEquals(typeof result.addonsCreated, 'number');
  assertExists(result.errors);
  assertExists(result.warnings);
});

// ---------------------------------------------------------------------------
// executeImport — update path (existingItemId provided)
// ---------------------------------------------------------------------------

Deno.test('ExcelImportService - executeImport updates existing item', async () => {
  clearDatabase();

  // First, create the item so it has an ID we can reference
  const { itemRepository } = await import('../../src/repositories/item.ts');
  const { categoryRepository } = await import('../../src/repositories/category.ts');

  const cat = await categoryRepository.create({ name: 'Sensors' });
  const existingItem = await itemRepository.create({
    category_id: cat.id,
    name: 'Old Sensor Name',
    description: 'Old description',
    base_model_number: 'SENSOR-001',
    dimensions: '5x5x5',
    type_id: 1,
  });

  const item = makePreviewItem({
    baseModelNumber: 'SENSOR-001',
    name: 'New Sensor Name',
    description: 'New description',
    category: 'Sensors',
    existingItemId: existingItem.id,
    action: 'update',
    variants: [{ style: 'Grey', price: 75.0 }],
  });

  const preview = makePreview([item]);
  const result = await excelImportService.executeImport(preview);

  assertEquals(result.success, true);
  assertEquals(result.itemsCreated, 0);
  assertEquals(result.itemsUpdated, 1);
  assertEquals(result.variantsCreated, 1);
  assertEquals(result.errors.length, 0);
});
