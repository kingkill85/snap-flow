import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';


// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up

const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { variantAddonRepository } = await import('../../src/repositories/variant-addon.ts');
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');
const { bomService } = await import('../../src/services/bom.ts');

Deno.test('BOM Service - createBomEntry adds required addons', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  // Create main item
  const mainItem = await itemRepository.create({
    category_id: category.id,
    name: 'Main Item',
    description: 'Test description',
    base_model_number: 'MAIN-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  // Create main variant
  const mainVariant = await itemVariantRepository.create({
    item_id: mainItem.id,
    style_name: 'Default',
    price: 29.99,
    image_path: 'items/main.jpg',
  });

  // Create addon item
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Addon Item',
    description: 'Test addon',
    base_model_number: 'ADDON-001',
    dimensions: '50x50',
    is_active: true,
    type_id: 1,
  });

  // Create addon variant
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'Standard',
    price: 5.99,
    image_path: 'items/addon.jpg',
  });

  await t.step('createBomEntry includes required addons', async () => {
    // Create a REQUIRED addon relationship
    await variantAddonRepository.create({
      variant_id: mainVariant.id,
      addon_variant_id: addonVariant.id,
      is_required: true,
      sort_order: 1,
    });

    // Create BOM entry
    const bomEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      mainVariant.id
    );

    assertExists(bomEntry);
    assertEquals(bomEntry.item_id, mainItem.id);
    assertEquals(bomEntry.variant_id, mainVariant.id);

    // Check that required addon was created as child
    const children = await bomEntryRepository.findChildren(bomEntry.id);
    assertEquals(children.length, 1, 'Should have 1 required addon child');
    assertEquals(children[0].item_id, addonItem.id);
    assertEquals(children[0].variant_id, addonVariant.id);
  });

  await t.step('createBomEntry does NOT include optional addons', async () => {
    clearDatabase();

    // Recreate test data
    const project2 = await projectRepository.create({
     
      customer_name: 'Test Customer',
      customer_address: '123 Test St',
      tenant_id: 1,
    });

    const floorplan2 = await floorplanRepository.create({
      project_id: project2.id,
      name: 'Ground Floor',
      image_path: 'floorplans/test.jpg',
    });

    const category2 = await categoryRepository.create({ name: 'Test Category' });

    const mainItem2 = await itemRepository.create({
      category_id: category2.id,
      name: 'Main Item',
      description: 'Test description',
      base_model_number: 'MAIN-001',
      dimensions: '100x100',
      is_active: true,
      type_id: 1,
    });

    const mainVariant2 = await itemVariantRepository.create({
      item_id: mainItem2.id,
      style_name: 'Default',
      price: 29.99,
      image_path: 'items/main.jpg',
    });

    const addonItem2 = await itemRepository.create({
      category_id: category2.id,
      name: 'Addon Item',
      description: 'Test addon',
      base_model_number: 'ADDON-001',
      dimensions: '50x50',
      is_active: true,
      type_id: 1,
    });

    const addonVariant2 = await itemVariantRepository.create({
      item_id: addonItem2.id,
      style_name: 'Standard',
      price: 5.99,
      image_path: 'items/addon.jpg',
    });

    // Create an OPTIONAL addon relationship
    await variantAddonRepository.create({
      variant_id: mainVariant2.id,
      addon_variant_id: addonVariant2.id,
      is_required: false, // Optional
      sort_order: 1,
    });

    // Create BOM entry
    const bomEntry = await bomService.createBomEntry(
      project2.id,
      floorplan2.id,
      mainVariant2.id
    );

    assertExists(bomEntry);

    // Check that optional addon was NOT created as child
    const children = await bomEntryRepository.findChildren(bomEntry.id);
    assertEquals(children.length, 0, 'Should have 0 addon children (optional not included)');
  });
});

Deno.test('BOM Service - recreateBomEntry with addons', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  const mainItem = await itemRepository.create({
    category_id: category.id,
    name: 'Main Item',
    description: 'Test description',
    base_model_number: 'MAIN-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  const mainVariant = await itemVariantRepository.create({
    item_id: mainItem.id,
    style_name: 'Default',
    price: 29.99,
    image_path: 'items/main.jpg',
  });

  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Addon Item',
    description: 'Test addon',
    base_model_number: 'ADDON-001',
    dimensions: '50x50',
    is_active: true,
    type_id: 1,
  });

  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'Standard',
    price: 5.99,
    image_path: 'items/addon.jpg',
  });

  const { placementRepository } = await import('../../src/repositories/placement.ts');

  await t.step('recreateBomEntry creates BOM with specified addons', async () => {
    // Create initial BOM entry
    const initialBom = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      mainVariant.id
    );

    // Create placement
    const placement = await placementRepository.createWithBomEntry(initialBom.id, floorplan.id, {
      x: 100,
      y: 100,
      width: 60,
      height: 60,
    });

    // Recreate with addon
    const newBom = await bomService.recreateBomEntry(
      placement.id,
      mainVariant.id,
      [addonVariant.id]
    );

    assertExists(newBom);
    assertEquals(newBom.item_id, mainItem.id);

    // Check addon was added
    const children = await bomEntryRepository.findChildren(newBom.id);
    assertEquals(children.length, 1);
    assertEquals(children[0].item_id, addonItem.id);
    assertEquals(children[0].variant_id, addonVariant.id);
  });
});

// Image copying tests
const { fileStorageService } = await import('../../src/services/file-storage.ts');

Deno.test('BOM Service - createBomEntry handles image copying', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  // Create main item with image
  const mainItem = await itemRepository.create({
    category_id: category.id,
    name: 'Main Item',
    description: 'Test description',
    base_model_number: 'MAIN-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  // Create test image file for main variant
  const testImageContent = new TextEncoder().encode('test image data');
  const mainImagePath = await fileStorageService.saveFile(
    testImageContent,
    'test-main.jpg',
    'items'
  );

  // Create main variant with image path
  const mainVariant = await itemVariantRepository.create({
    item_id: mainItem.id,
    style_name: 'Default',
    price: 29.99,
    image_path: mainImagePath,
  });

  // Create addon item with image
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Addon Item',
    description: 'Test addon',
    base_model_number: 'ADDON-001',
    dimensions: '50x50',
    is_active: true,
    type_id: 1,
  });

  // Create test image file for addon
  const addonImagePath = await fileStorageService.saveFile(
    testImageContent,
    'test-addon.jpg',
    'items'
  );

  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'Standard',
    price: 5.99,
    image_path: addonImagePath,
  });

  await t.step('BOM entry picture_path references project folder', async () => {
    // Create a required addon relationship
    await variantAddonRepository.create({
      variant_id: mainVariant.id,
      addon_variant_id: addonVariant.id,
      is_required: true,
      sort_order: 1,
    });

    // Create BOM entry
    const bomEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      mainVariant.id
    );

    assertExists(bomEntry);
    
    // Main entry should have picture_path in project folder
    assertEquals(
      bomEntry.picture_path?.startsWith(`projects/${project.id}/bom-images/`),
      true,
      'Main entry picture_path should be in project folder'
    );
    
    // Check addon child
    const children = await bomEntryRepository.findChildren(bomEntry.id);
    assertEquals(children.length, 1);
    
    // Addon should also have picture_path in project folder
    assertEquals(
      children[0].picture_path?.startsWith(`projects/${project.id}/bom-images/`),
      true,
      'Addon entry picture_path should be in project folder'
    );
    
    // Cleanup test files
    await fileStorageService.deleteFile(mainImagePath);
    await fileStorageService.deleteFile(addonImagePath);
    if (bomEntry.picture_path) await fileStorageService.deleteFile(bomEntry.picture_path);
    if (children[0]?.picture_path) await fileStorageService.deleteFile(children[0].picture_path);
  });

  await t.step('BOM entry picture_path contains entry ID', async () => {
    // Create another test image
    const blueImagePath = await fileStorageService.saveFile(
      testImageContent,
      'test-blue.jpg',
      'items'
    );
    
    const newVariant = await itemVariantRepository.create({
      item_id: mainItem.id,
      style_name: 'Blue',
      price: 34.99,
      image_path: blueImagePath,
    });

    const bomEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      newVariant.id
    );

    assertExists(bomEntry);
    
    // Picture path should contain the BOM entry ID
    const expectedPrefix = `projects/${project.id}/bom-images/${bomEntry.id}-`;
    assertEquals(
      bomEntry.picture_path?.startsWith(expectedPrefix),
      true,
      `Picture path should start with "${expectedPrefix}"`
    );
    
    // Cleanup
    await fileStorageService.deleteFile(blueImagePath);
    if (bomEntry.picture_path) await fileStorageService.deleteFile(bomEntry.picture_path);
  });
});

Deno.test('BOM Service - recreateBomEntry copies new images', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  const variant1 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Red',
    price: 29.99,
    image_path: await fileStorageService.saveFile(
      new TextEncoder().encode('red image'),
      'test-red.jpg',
      'items'
    ),
  });

  const variant2 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Blue',
    price: 34.99,
    image_path: await fileStorageService.saveFile(
      new TextEncoder().encode('blue image'),
      'test-blue.jpg',
      'items'
    ),
  });

  await t.step('recreateBomEntry copies new variant image', async () => {
    // Create initial placement
    const initialEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      variant1.id
    );

    const { placementRepository } = await import('../../src/repositories/placement.ts');
    const placement = await placementRepository.createWithBomEntry(initialEntry.id, floorplan.id, {
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    });

    // Store old picture path
    const oldPicturePath = initialEntry.picture_path;

    // Recreate with new variant
    const newEntry = await bomService.recreateBomEntry(
      placement.id,
      variant2.id,
      []
    );

    assertExists(newEntry);
    
    // New entry should have different picture path
    assertEquals(
      newEntry.picture_path !== oldPicturePath,
      true,
      'New entry should have different picture path'
    );
    
    // New path should reference project folder
    assertEquals(
      newEntry.picture_path?.startsWith(`projects/${project.id}/bom-images/`),
      true,
      'New entry picture_path should be in project folder'
    );
    
    // Cleanup
    if (initialEntry.picture_path) await fileStorageService.deleteFile(initialEntry.picture_path);
    if (newEntry.picture_path) await fileStorageService.deleteFile(newEntry.picture_path);
  });
});

Deno.test('BOM Service - switchVariant copies new variant image', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  const variant1 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Red',
    price: 29.99,
    image_path: await fileStorageService.saveFile(
      new TextEncoder().encode('red image'),
      'test-red.jpg',
      'items'
    ),
  });

  const variant2 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Blue',
    price: 34.99,
    image_path: await fileStorageService.saveFile(
      new TextEncoder().encode('blue image'),
      'test-blue.jpg',
      'items'
    ),
  });

  await t.step('switchVariant updates picture_path', async () => {
    const bomEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      variant1.id
    );

    const oldPicturePath = bomEntry.picture_path;

    // Switch variant
    const updatedEntry = await bomService.switchVariant(
      bomEntry.id,
      variant2.id
    );

    assertExists(updatedEntry);
    
    // Picture path should be updated
    assertEquals(
      updatedEntry.picture_path !== oldPicturePath,
      true,
      'Picture path should be updated after variant switch'
    );
    
    // Cleanup
    if (oldPicturePath) await fileStorageService.deleteFile(oldPicturePath);
    if (updatedEntry.picture_path) await fileStorageService.deleteFile(updatedEntry.picture_path);
  });
});

Deno.test('BOM Service - deleteBomEntry cleans up images', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });

  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Red',
    price: 29.99,
    image_path: 'items/catalog-red.jpg',
  });

  await t.step('deleteBomEntry removes unused images', async () => {
    const bomEntry = await bomService.createBomEntry(
      project.id,
      floorplan.id,
      variant.id
    );

    const picturePath = bomEntry.picture_path;
    assertExists(picturePath);

    // Verify the image file would be tracked for deletion
    // (Note: We can't actually test file deletion without mocking file system)
    const otherEntries = await bomEntryRepository.findByPicturePath(picturePath);
    assertEquals(otherEntries.length, 1);
    assertEquals(otherEntries[0].id, bomEntry.id);

    // Delete the entry
    await bomService.deleteBomEntry(bomEntry.id);

    // Verify the entry is deleted
    const deletedEntry = await bomEntryRepository.findById(bomEntry.id);
    assertEquals(deletedEntry, null);
  });
});
