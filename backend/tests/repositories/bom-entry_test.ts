import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');

Deno.test('BomEntryRepository - findByPicturePath', async (t) => {
  clearDatabase();

  // Create test data
  const project = await projectRepository.create({
    name: 'Picture Path Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Test Floorplan',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Test Category' });

  await t.step('findByPicturePath returns matching entries', async () => {
    const picturePath = 'projects/123/bom-images/456-image.jpg';
    
    // Create item and variant
    const item = await itemRepository.create({
      category_id: category.id,
      name: 'Test Item',
      base_model_number: 'TEST-001',
      is_active: true,
    });
    
    const variant = await itemVariantRepository.create({
      item_id: item.id,
      style_name: 'Default',
      price: 29.99,
    });
    
    // Create BOM entry with specific picture path
    const entry = await bomEntryRepository.create({
      project_id: project.id,
      floorplan_id: floorplan.id,
      item_id: item.id,
      variant_id: variant.id,
      parent_bom_id: null,
      item_name: 'Test Item',
      style_name: 'Default',
      model_number: 'TEST-001',
      unit_price: 29.99,
      picture_path: picturePath,
    });

    // Find by picture path
    const results = await bomEntryRepository.findByPicturePath(picturePath);
    
    assertEquals(results.length, 1);
    assertEquals(results[0].id, entry.id);
    assertEquals(results[0].picture_path, picturePath);
  });

  await t.step('findByPicturePath returns empty array when no matches', async () => {
    const results = await bomEntryRepository.findByPicturePath('non-existent/path.jpg');
    
    assertEquals(results.length, 0);
  });

  await t.step('findByPicturePath returns multiple entries with same path', async () => {
    const sharedPicturePath = 'projects/123/bom-images/shared-image.jpg';
    
    // Create items and variants
    const item1 = await itemRepository.create({
      category_id: category.id,
      name: 'Item 1',
      base_model_number: 'TEST-001',
      is_active: true,
    });
    
    const variant1 = await itemVariantRepository.create({
      item_id: item1.id,
      style_name: 'Default',
      price: 29.99,
    });

    const item2 = await itemRepository.create({
      category_id: category.id,
      name: 'Item 2',
      base_model_number: 'TEST-002',
      is_active: true,
    });
    
    const variant2 = await itemVariantRepository.create({
      item_id: item2.id,
      style_name: 'Default',
      price: 39.99,
    });
    
    // Create multiple entries with same picture path
    const entry1 = await bomEntryRepository.create({
      project_id: project.id,
      floorplan_id: floorplan.id,
      item_id: item1.id,
      variant_id: variant1.id,
      parent_bom_id: null,
      item_name: 'Item 1',
      style_name: 'Default',
      model_number: 'TEST-001',
      unit_price: 29.99,
      picture_path: sharedPicturePath,
    });

    const entry2 = await bomEntryRepository.create({
      project_id: project.id,
      floorplan_id: floorplan.id,
      item_id: item2.id,
      variant_id: variant2.id,
      parent_bom_id: null,
      item_name: 'Item 2',
      style_name: 'Default',
      model_number: 'TEST-002',
      unit_price: 39.99,
      picture_path: sharedPicturePath,
    });

    // Find by picture path
    const results = await bomEntryRepository.findByPicturePath(sharedPicturePath);
    
    assertEquals(results.length, 2);
    const ids = results.map(r => r.id).sort();
    assertEquals(ids, [entry1.id, entry2.id].sort());
  });

  await t.step('findByPicturePath excludes entries with null picture_path', async () => {
    // Create item and variant
    const item3 = await itemRepository.create({
      category_id: category.id,
      name: 'Item No Image',
      base_model_number: 'TEST-003',
      is_active: true,
    });
    
    const variant3 = await itemVariantRepository.create({
      item_id: item3.id,
      style_name: 'Default',
      price: 19.99,
    });
    
    // Create entry without picture path
    await bomEntryRepository.create({
      project_id: project.id,
      floorplan_id: floorplan.id,
      item_id: item3.id,
      variant_id: variant3.id,
      parent_bom_id: null,
      item_name: 'Item No Image',
      style_name: 'Default',
      model_number: 'TEST-003',
      unit_price: 19.99,
      picture_path: null,
    });

    // Search for null should return empty
    const results = await bomEntryRepository.findByPicturePath('null');
    assertEquals(results.length, 0);
  });
});
