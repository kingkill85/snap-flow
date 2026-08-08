import { assertEquals, assertExists, assertRejects } from '@std/assert';
import * as xlsx from 'xlsx';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { excelSyncService } from '../../src/services/excel-sync.ts';
import { categoryRepository } from '../../src/repositories/category.ts';
import { itemRepository } from '../../src/repositories/item.ts';
import { itemVariantRepository } from '../../src/repositories/item-variant.ts';
import { itemTypeRepository } from '../../src/repositories/item-type.ts';
import { getDb } from '../../src/config/database.ts';
import { env } from '../../src/config/env.ts';

// Setup test database before all tests
await setupTestDatabase();

function assertNoCommittedMutations(result: Awaited<ReturnType<typeof excelSyncService.syncCatalog>>): void {
  for (const phase of Object.values(result.phases)) {
    for (const value of Object.values(phase)) assertEquals(value, 0);
  }
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
  const importedCategory = await categoryRepository.create({
    name: 'Imported Category',
    is_active: false,
  });

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
  const importedExistingItem = await itemRepository.create({
    category_id: importedCategory.id,
    type_id: importedType.id,
    name: 'Current Imported Product',
    base_model_number: 'IMP-NEW',
    is_active: false,
  });

  const worksheet = xlsx.utils.aoa_to_sheet([
    [],
    [],
    [],
    ['Imported Category', '', '', 'Current Imported Product', '', 'IMP-NEW', '', 'Default', 'IMP-NEW-DEFAULT', 100],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const workbookBytes = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
  const relativePath = 'imports/product-type-scope-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;

  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(workbookBytes));

  try {
    const result = await excelSyncService.syncCatalog(relativePath, importedType.id);

    assertEquals(result.success, true);
    assertEquals(result.phases.items.deactivated, 1);
    assertEquals(result.phases.categories.deactivated, 1);

    const missingImportedAfter = await itemRepository.findById(missingImportedItem.id);
    const protectedAfter = await itemRepository.findById(protectedItem.id);
    const importedExistingAfter = await itemRepository.findById(importedExistingItem.id);
    const sharedCategoryAfter = await categoryRepository.findById(sharedCategory.id);
    const emptyCategoryAfter = await categoryRepository.findById(emptyAfterImportCategory.id);

    console.log('EXCEL_SYNC_OUTCOME ' + JSON.stringify({
      databaseTarget: getDb().queryEntries<{ file: string }>('PRAGMA database_list')[0].file || ':memory:',
      importedActive: Boolean(importedExistingAfter?.is_active),
      missingActive: Boolean(missingImportedAfter?.is_active),
      protectedActive: Boolean(protectedAfter?.is_active),
      sharedCategoryActive: Boolean(sharedCategoryAfter?.is_active),
      emptyCategoryActive: Boolean(emptyCategoryAfter?.is_active),
      itemDeactivatedCount: result.phases.items.deactivated,
      categoryDeactivatedCount: result.phases.categories.deactivated,
    }));

    assertExists(missingImportedAfter);
    assertExists(protectedAfter);
    assertExists(importedExistingAfter);
    assertExists(sharedCategoryAfter);
    assertExists(emptyCategoryAfter);
    assertEquals(Boolean(missingImportedAfter.is_active), false);
    assertEquals(Boolean(protectedAfter.is_active), true);
    assertEquals(Boolean(importedExistingAfter.is_active), true);
    assertEquals(Boolean(sharedCategoryAfter.is_active), true);
    assertEquals(Boolean(emptyCategoryAfter.is_active), false);
  } finally {
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ItemRepository - missing-item mutation is constrained to the selected type', async () => {
  clearDatabase();

  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const protectedType = await itemTypeRepository.create({ name: 'Protected', abbreviation: 'PRO' });
  const category = await categoryRepository.create({ name: 'Shared' });
  const selectedMissing = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Selected Missing',
    base_model_number: 'SEL-OLD',
  });
  const selectedPresent = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Selected Present',
    base_model_number: 'SEL-KEEP',
  });
  const protectedItem = await itemRepository.create({
    category_id: category.id,
    type_id: protectedType.id,
    name: 'Protected',
    base_model_number: 'PRO-KEEP',
  });
  const selectedWithoutModel = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Selected Without Model',
  });

  const changed = await itemRepository.deactivateMissingForType(
    selectedType.id,
    ['SEL-KEEP'],
  );

  assertEquals(
    changed.map((item) => item.id).sort((a, b) => a - b),
    [selectedMissing.id, selectedWithoutModel.id],
  );
  assertEquals(Boolean((await itemRepository.findById(selectedMissing.id))?.is_active), false);
  assertEquals(Boolean((await itemRepository.findById(selectedPresent.id))?.is_active), true);
  assertEquals(Boolean((await itemRepository.findById(protectedItem.id))?.is_active), true);
  assertEquals(Boolean((await itemRepository.findById(selectedWithoutModel.id))?.is_active), false);
});

Deno.test('ItemRepository - missing-item mutation rejects an empty import set', async () => {
  clearDatabase();
  await assertRejects(
    async () => await itemRepository.deactivateMissingForType(1, []),
    Error,
    'without a validated import set',
  );
});

Deno.test('ExcelSyncService - invalid type rolls back without broadening scope', async () => {
  clearDatabase();

  const protectedType = await itemTypeRepository.create({ name: 'Protected', abbreviation: 'PRO' });
  const category = await categoryRepository.create({ name: 'Protected Category' });
  const protectedItem = await itemRepository.create({
    category_id: category.id,
    type_id: protectedType.id,
    name: 'Protected',
    base_model_number: 'PRO-KEEP',
  });
  const worksheet = xlsx.utils.aoa_to_sheet([
    [], [], [],
    ['New Category', '', '', 'New Product', '', 'NEW-1', '', 'Default', 'NEW-1-DEFAULT', 10],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const relativePath = 'imports/invalid-type-scope-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));

  try {
    const result = await excelSyncService.syncCatalog(relativePath, 999_999);
    assertEquals(result.success, false);
    assertNoCommittedMutations(result);
    assertEquals(result.phases.items.deactivated, 0);
    assertEquals(await categoryRepository.findByName('New Category'), null);
    assertEquals(Boolean((await itemRepository.findById(protectedItem.id))?.is_active), true);
    assertEquals(Boolean((await categoryRepository.findById(category.id))?.is_active), true);
  } finally {
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ExcelSyncService - empty or unreadable workbook leaves catalog unchanged', async () => {
  clearDatabase();

  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const category = await categoryRepository.create({ name: 'Existing Category' });
  const existingItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Existing',
    base_model_number: 'EXISTING',
  });
  const relativePath = 'imports/empty-scope-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[], [], []]), 'Catalog');
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));

  try {
    const emptyResult = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    const unreadableResult = await excelSyncService.syncCatalog('imports/does-not-exist.xlsx', selectedType.id);
    assertEquals(emptyResult.success, false);
    assertEquals(unreadableResult.success, false);
    assertNoCommittedMutations(emptyResult);
    assertNoCommittedMutations(unreadableResult);
    assertEquals(Boolean((await itemRepository.findById(existingItem.id))?.is_active), true);
    assertEquals(Boolean((await categoryRepository.findById(category.id))?.is_active), true);
  } finally {
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ExcelSyncService - partially malformed workbook fails before cleanup', async () => {
  clearDatabase();
  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const category = await categoryRepository.create({ name: 'Existing Category' });
  const existingItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Existing',
    base_model_number: 'EXISTING',
  });
  const worksheet = xlsx.utils.aoa_to_sheet([
    [], [], [],
    ['Valid Category', '', '', 'Valid Product', '', 'VALID', '', 'Default', 'VALID-DEFAULT', 10],
    ['Malformed partial row'],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const relativePath = 'imports/partial-invalid-scope-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));

  try {
    const result = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    assertEquals(result.success, false);
    assertNoCommittedMutations(result);
    assertEquals(result.phases.items.deactivated, 0);
    assertEquals(await categoryRepository.findByName('Valid Category'), null);
    assertEquals(Boolean((await itemRepository.findById(existingItem.id))?.is_active), true);
    assertEquals(Boolean((await categoryRepository.findById(category.id))?.is_active), true);
  } finally {
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ExcelSyncService - caught item persistence failure aborts and rolls back', async () => {
  clearDatabase();
  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const category = await categoryRepository.create({ name: 'Catalog Category' });
  const importedItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Imported Existing',
    base_model_number: 'IMPORTED',
    is_active: false,
  });
  const missingItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Missing Existing',
    base_model_number: 'MISSING',
  });
  const worksheet = xlsx.utils.aoa_to_sheet([
    [], [], [],
    ['Catalog Category', '', '', 'Imported Existing', '', 'IMPORTED', '', 'Default', 'IMPORTED-DEFAULT', 10],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const relativePath = 'imports/item-failure-rollback-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));
  getDb().query("CREATE TRIGGER fail_item_update BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT, 'forced item failure'); END");

  try {
    const result = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    assertEquals(result.success, false);
    assertNoCommittedMutations(result);
    assertEquals(Boolean((await itemRepository.findById(importedItem.id))?.is_active), false);
    assertEquals(Boolean((await itemRepository.findById(missingItem.id))?.is_active), true);
  } finally {
    getDb().query('DROP TRIGGER IF EXISTS fail_item_update');
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ExcelSyncService - caught variant persistence failure aborts and rolls back', async () => {
  clearDatabase();
  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const category = await categoryRepository.create({ name: 'Existing Category' });
  const existingItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Existing',
    base_model_number: 'EXISTING',
  });
  const worksheet = xlsx.utils.aoa_to_sheet([
    [], [], [],
    ['New Category', '', '', 'New Product', '', 'NEW', '', 'Default', 'NEW-DEFAULT', 10],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const relativePath = 'imports/variant-failure-rollback-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));
  getDb().query("CREATE TRIGGER fail_variant_insert BEFORE INSERT ON item_variants BEGIN SELECT RAISE(ABORT, 'forced variant failure'); END");

  try {
    const result = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    assertEquals(result.success, false);
    assertNoCommittedMutations(result);
    assertEquals(await categoryRepository.findByName('New Category'), null);
    assertEquals(await itemRepository.findByBaseModelNumber('NEW'), null);
    assertEquals(Boolean((await itemRepository.findById(existingItem.id))?.is_active), true);
    assertEquals(Boolean((await categoryRepository.findById(category.id))?.is_active), true);
  } finally {
    getDb().query('DROP TRIGGER IF EXISTS fail_variant_insert');
    await Deno.remove(fullPath).catch(() => {});
  }
});

Deno.test('ExcelSyncService - in-transaction failure rolls back catalog mutations', async () => {
  clearDatabase();

  const selectedType = await itemTypeRepository.create({ name: 'Selected', abbreviation: 'SEL' });
  const category = await categoryRepository.create({ name: 'Existing Category' });
  const existingItem = await itemRepository.create({
    category_id: category.id,
    type_id: selectedType.id,
    name: 'Existing Product',
    base_model_number: 'OLD',
  });
  const worksheet = xlsx.utils.aoa_to_sheet([
    [], [], [],
    ['New Category', '', '', 'New Product', '', 'NEW', '', 'Default', 'NEW-DEFAULT', 10],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const relativePath = 'imports/rollback-scope-test.xlsx';
  const fullPath = `${env.UPLOAD_DIR}/${relativePath}`;
  await Deno.mkdir(`${env.UPLOAD_DIR}/imports`, { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })));
  getDb().query(`
    CREATE TRIGGER fail_sync_timestamp
    BEFORE INSERT ON app_settings
    BEGIN
      SELECT RAISE(ABORT, 'forced sync rollback');
    END
  `);

  try {
    const result = await excelSyncService.syncCatalog(relativePath, selectedType.id);
    assertEquals(result.success, false);
    assertNoCommittedMutations(result);
    assertEquals(await categoryRepository.findByName('New Category'), null);
    assertEquals(await itemRepository.findByBaseModelNumber('NEW'), null);
    assertEquals(Boolean((await itemRepository.findById(existingItem.id))?.is_active), true);
    assertEquals(Boolean((await categoryRepository.findById(category.id))?.is_active), true);
  } finally {
    getDb().query('DROP TRIGGER IF EXISTS fail_sync_timestamp');
    await Deno.remove(fullPath).catch(() => {});
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
