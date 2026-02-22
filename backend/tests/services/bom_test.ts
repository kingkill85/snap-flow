import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
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
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
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
      name: 'Test Project 2',
      customer_name: 'Test Customer',
      customer_address: '123 Test St',
      status: 'active',
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
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
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
    const placement = await placementRepository.createWithBomEntry(initialBom.id, {
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
