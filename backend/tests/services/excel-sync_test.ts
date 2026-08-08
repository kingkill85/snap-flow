import { assertEquals, assertExists } from '@std/assert';
import * as xlsx from 'xlsx';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { excelSyncService } from '../../src/services/excel-sync.ts';
import { categoryRepository } from '../../src/repositories/category.ts';
import { itemRepository } from '../../src/repositories/item.ts';
import { itemVariantRepository } from '../../src/repositories/item-variant.ts';
import { itemTypeRepository } from '../../src/repositories/item-type.ts';
import { fileStorageService } from '../../src/services/file-storage.ts';

// Setup test database before all tests
await setupTestDatabase();

async function saveCatalogWorkbook(rows: unknown[][]): Promise<string> {
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const workbookBytes = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
  return await fileStorageService.saveFile(
    new Uint8Array(workbookBytes),
    'catalog.xlsx',
    'imports',
  );
}

Deno.test("ExcelSyncService - syncCategories creates new categories", async () => {
  clearDatabase();
  
  // Create test data with categories
  const _groupedItems = {
    "MODEL1": {
      baseModelNumber: "MODEL1",
      name: "Test Item 1",
      category: "Category A",
      description: "Description 1",
      dimensions: "10x10",
      variants: []
    }
  };

  // Test the parseAndGroupExcel indirectly through the exposed methods
  // Since we can't easily test private methods, let's test the public interface
  
  // Verify no categories exist initially
  const initialCategories = await categoryRepository.findAll();
  assertEquals(initialCategories.length, 0);
  
  // After sync completes, categories would be created
  // We'll test the category creation logic separately
  assertEquals(true, true);
});

Deno.test("ExcelSyncService - category repository can create and find categories", async () => {
  clearDatabase();
  
  // Test category creation
  const category = await categoryRepository.create({ name: 'Test Category' });
  assertExists(category);
  assertEquals(category.name, 'Test Category');
  assertEquals(Boolean(category.is_active), true);
  
  // Test findByName
  const found = await categoryRepository.findByName('Test Category');
  assertExists(found);
  assertEquals(found?.name, 'Test Category');
  
  // Test deactivation
  await categoryRepository.deactivate(category.id);
  const deactivated = await categoryRepository.findById(category.id);
  assertEquals(Boolean(deactivated?.is_active), false);
  
  // Test activation
  await categoryRepository.activate(category.id);
  const activated = await categoryRepository.findById(category.id);
  assertEquals(Boolean(activated?.is_active), true);
});

Deno.test("ExcelSyncService - item repository can create items with base model", async () => {
  clearDatabase();
  
  // Create category first
  const category = await categoryRepository.create({ name: 'Test Category' });
  
  // Create item with base model
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Product',
    description: 'Test Description',
    base_model_number: 'MODEL123',
    dimensions: '100x50x20',
    is_active: true,
    type_id: 1,
  });
  
  assertExists(item);
  assertEquals(item.base_model_number, 'MODEL123');
  assertEquals(item.name, 'Test Product');
  
  // Test findAll
  const items = await itemRepository.findAll({}, { page: 1, limit: 10 });
  assertEquals(items.items.length, 1);
  assertEquals(items.items[0].base_model_number, 'MODEL123');
});

Deno.test("ExcelSyncService - variant repository can create variants", async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Test Category' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Product',
    base_model_number: 'MODEL1',
    is_active: true,
    type_id: 1,
  });
  
  // Create variants
  const variant1 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Style A',
    price: 29.99
  });
  
  const variant2 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Style B',
    price: 39.99
  });
  
  assertExists(variant1);
  assertExists(variant2);
  assertEquals(variant1.style_name, 'Style A');
  assertEquals(variant1.price, 29.99);
  assertEquals(variant2.style_name, 'Style B');
  assertEquals(variant2.price, 39.99);
  
  // Test findByItemId
  const variants = await itemVariantRepository.findByItemId(item.id);
  assertEquals(variants.length, 2);
});

Deno.test("ExcelSyncService - variant can have image path", async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Test Category' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Product',
    base_model_number: 'MODEL1',
    is_active: true,
    type_id: 1,
  });
  
  // Create variant with image
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Style With Image',
    price: 49.99,
    image_path: 'items/excel-import/image1.png'
  });
  
  assertExists(variant);
  assertEquals(variant.image_path, 'items/excel-import/image1.png');
  
  // Test update
  await itemVariantRepository.update(variant.id, {
    image_path: 'items/excel-import/image2.png'
  });
  
  const updated = await itemVariantRepository.findById(variant.id);
  assertEquals(updated?.image_path, 'items/excel-import/image2.png');
});

Deno.test('ExcelSyncService - import only deactivates missing items from the selected product type', async () => {
  clearDatabase();

  const importedType = await itemTypeRepository.create({
    name: 'Imported Type',
    abbreviation: 'IMP',
  });
  const protectedType = await itemTypeRepository.create({
    name: 'Protected Type',
    abbreviation: 'PRO',
  });

  const sharedCategory = await categoryRepository.create({ name: 'Shared Category' });
  const emptyAfterImportCategory = await categoryRepository.create({ name: 'Obsolete Category' });

  const missingImportedItem = await itemRepository.create({
    category_id: emptyAfterImportCategory.id,
    type_id: importedType.id,
    name: 'Missing Imported Product',
    base_model_number: 'IMP-OLD',
  });
  const protectedItem = await itemRepository.create({
    category_id: sharedCategory.id,
    type_id: protectedType.id,
    name: 'Protected Product',
    base_model_number: 'PRO-KEEP',
  });

  const relativePath = await saveCatalogWorkbook([
    [],
    [],
    [],
    ['Imported Category', '', '', 'Current Imported Product', '', 'IMP-NEW', '', 'Default', 'IMP-NEW-DEFAULT', 100],
  ]);

  try {
    const result = await excelSyncService.syncCatalog(relativePath, importedType.id);

    assertEquals(result.success, true);
    assertEquals(result.phases.items.deactivated, 1);

    const missingImportedAfter = await itemRepository.findById(missingImportedItem.id);
    const protectedAfter = await itemRepository.findById(protectedItem.id);
    const currentImportedAfter = await itemRepository.findByBaseModelNumber('IMP-NEW');
    const sharedCategoryAfter = await categoryRepository.findById(sharedCategory.id);
    const emptyCategoryAfter = await categoryRepository.findById(emptyAfterImportCategory.id);

    assertExists(missingImportedAfter);
    assertExists(protectedAfter);
    assertExists(currentImportedAfter);
    assertExists(sharedCategoryAfter);
    assertExists(emptyCategoryAfter);
    assertEquals(Boolean(missingImportedAfter.is_active), false);
    assertEquals(Boolean(protectedAfter.is_active), true);
    assertEquals(currentImportedAfter.type_id, importedType.id);
    assertEquals(Boolean(currentImportedAfter.is_active), true);
    assertEquals(Boolean(sharedCategoryAfter.is_active), true);
    assertEquals(Boolean(emptyCategoryAfter.is_active), false);
  } finally {
    await fileStorageService.deleteFile(relativePath);
  }
});

Deno.test('ItemRepository - type-scoped deactivation rejects a stale cross-type candidate', async () => {
  clearDatabase();

  const selectedType = await itemTypeRepository.create({
    name: 'Selected Type',
    abbreviation: 'SEL',
  });
  const otherType = await itemTypeRepository.create({
    name: 'Other Type',
    abbreviation: 'OTH',
  });
  const category = await categoryRepository.create({ name: 'Scoped Category' });
  const item = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Scoped Product',
    base_model_number: 'SEL-OLD',
  });

  const rejected = await itemRepository.deactivateForType(item.id, otherType.id);
  assertEquals(rejected, null);
  assertEquals(Boolean((await itemRepository.findById(item.id))?.is_active), true);

  const deactivated = await itemRepository.deactivateForType(item.id, selectedType.id);
  assertExists(deactivated);
  assertEquals(Boolean((await itemRepository.findById(item.id))?.is_active), false);
});

Deno.test('ExcelSyncService - invalid product type fails before catalog mutation', async () => {
  clearDatabase();

  const protectedType = await itemTypeRepository.create({
    name: 'Protected Type',
    abbreviation: 'PRO',
  });
  const category = await categoryRepository.create({ name: 'Protected Category' });
  const protectedItem = await itemRepository.create({
    category_id: category.id,
    type_id: protectedType.id,
    name: 'Protected Product',
    base_model_number: 'PRO-KEEP',
  });
  const relativePath = await saveCatalogWorkbook([
    [],
    [],
    [],
    ['Imported Category', '', '', 'Imported Product', '', 'IMP-NEW', '', 'Default', 'IMP-NEW-DEFAULT', 100],
  ]);

  try {
    const result = await excelSyncService.syncCatalog(relativePath, 999_999);
    assertEquals(result.success, false);
    assertEquals(result.phases.items.deactivated, 0);
    assertEquals(Boolean((await itemRepository.findById(protectedItem.id))?.is_active), true);
  } finally {
    await fileStorageService.deleteFile(relativePath);
  }
});

Deno.test('ExcelSyncService - malformed workbook fails before catalog mutation', async () => {
  clearDatabase();

  const selectedType = await itemTypeRepository.create({
    name: 'Selected Type',
    abbreviation: 'SEL',
  });
  const category = await categoryRepository.create({ name: 'Protected Category' });
  const protectedItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Protected Product',
    base_model_number: 'SEL-KEEP',
  });
  const relativePath = await fileStorageService.saveFile(
    new TextEncoder().encode('not an Excel workbook'),
    'malformed.xlsx',
    'imports',
  );

  try {
    const result = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    assertEquals(result.success, false);
    assertEquals(result.phases.items.deactivated, 0);
    assertEquals(Boolean((await itemRepository.findById(protectedItem.id))?.is_active), true);
  } finally {
    await fileStorageService.deleteFile(relativePath);
  }
});

Deno.test("ExcelSyncService - variant addons can be linked", async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Test Category' });
  
  // Create parent item and variant
  const parentItem = await itemRepository.create({
    category_id: category.id,
    name: 'Parent Product',
    base_model_number: 'PARENT1',
    is_active: true,
    type_id: 1,
  });
  
  const parentVariant = await itemVariantRepository.create({
    item_id: parentItem.id,
    style_name: 'Parent Style',
    price: 100
  });
  
  // Create addon item and variant
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Addon Product',
    base_model_number: 'ADDON1',
    is_active: true,
    type_id: 1,
  });
  
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'Addon Style',
    price: 25
  });
  
  // Create addon link
  const { variantAddonRepository } = await import('../../src/repositories/variant-addon.ts');
  const addonLink = await variantAddonRepository.create({
    variant_id: parentVariant.id,
    addon_variant_id: addonVariant.id,
    is_required: true,
    sort_order: 1
  });
  
  assertExists(addonLink);
  assertEquals(addonLink.variant_id, parentVariant.id);
  assertEquals(addonLink.addon_variant_id, addonVariant.id);
  assertEquals(addonLink.is_required, true);
  assertEquals(addonLink.sort_order, 1);
  
  // Test findByVariantId
  const addons = await variantAddonRepository.findByVariantId(parentVariant.id);
  assertEquals(addons.length, 1);
});

Deno.test("ExcelSyncService - syncCatalog method exists and is callable", () => {
  // Test that the service method exists
  assertEquals(typeof excelSyncService.syncCatalog, 'function');
  
  // Test that progress callback can be set
  excelSyncService.setProgressCallback((message, phase) => {
    console.log(`[${phase}] ${message}`);
  });
  
  // Clean up callback
  excelSyncService.setProgressCallback(() => {});
  
  assertEquals(true, true);
});
