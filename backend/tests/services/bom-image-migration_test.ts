import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';

// Setup test database before all tests
await setupTestDatabase();


const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');
const { fileStorageService } = await import('../../src/services/file-storage.ts');

Deno.test('BOM Image Migration - runs automatically and is idempotent', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
    name: 'Migration Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Test Floorplan',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TEST-001',
    is_active: true,
  });

  // Create test image
  const testImage = new TextEncoder().encode('test image data');
  const catalogImagePath = await fileStorageService.saveFile(
    testImage,
    'test-item.jpg',
    'items'
  );

  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Default',
    price: 29.99,
    image_path: catalogImagePath,
  });

  // Create BOM entry with catalog image path
  const bomEntry = await bomEntryRepository.create({
    project_id: project.id,
    floorplan_id: floorplan.id,
    item_id: item.id,
    variant_id: variant.id,
    parent_bom_id: null,
    item_name: item.name,
    style_name: variant.style_name,
    model_number: item.base_model_number,
    unit_price: variant.price,
    picture_path: catalogImagePath,
  });

  await t.step('first run migrates entries', async () => {
    const { runBomImageMigration } = await import('../../src/services/bom-image-migration.ts');
    
    const result = await runBomImageMigration();
    
    assertEquals(result.totalEntries, 1);
    assertEquals(result.migratedEntries, 1);
    assertEquals(result.failedEntries, 0);

    // Verify image was copied
    const updatedEntry = await bomEntryRepository.findById(bomEntry.id);
    assertExists(updatedEntry?.picture_path);
    assertEquals(
      updatedEntry.picture_path?.startsWith(`projects/${project.id}/bom-images/`),
      true,
      'Picture path should be in project folder after migration'
    );
    assertEquals(
      updatedEntry.picture_path !== catalogImagePath,
      true,
      'Picture path should be different from catalog path'
    );
  });

  await t.step('second run is idempotent', async () => {
    const { runBomImageMigration } = await import('../../src/services/bom-image-migration.ts');
    
    const result = await runBomImageMigration();
    
    // Should report no entries to migrate
    assertEquals(result.totalEntries, 0);
    assertEquals(result.migratedEntries, 0);
    assertEquals(result.failedEntries, 0);
  });

  await t.step('cleanup', async () => {
    const updatedEntry = await bomEntryRepository.findById(bomEntry.id);
    if (updatedEntry?.picture_path) {
      await fileStorageService.deleteFile(updatedEntry.picture_path);
    }
    await fileStorageService.deleteFile(catalogImagePath);
  });
});


