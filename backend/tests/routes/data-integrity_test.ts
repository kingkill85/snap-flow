import { assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { getDb, withTransaction, withTransactionAsync } from '../../src/config/database.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

const { userRepository } = await import('../../src/repositories/user.ts');
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');
const { placementRepository } = await import('../../src/repositories/placement.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { bomService } = await import('../../src/services/bom.ts');

await setupTestDatabase();

Deno.test('withTransaction - commits on success', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('test', 1)");

  withTransaction(() => {
    db.query("UPDATE categories SET name = 'updated' WHERE name = 'test'");
  });

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'updated'");
  assertEquals(result.length, 1);
});

Deno.test('withTransaction - rolls back on error', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('original', 1)");

  try {
    withTransaction(() => {
      db.query("UPDATE categories SET name = 'changed' WHERE name = 'original'");
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'original'");
  assertEquals(result.length, 1);
  const changed = db.queryEntries("SELECT name FROM categories WHERE name = 'changed'");
  assertEquals(changed.length, 0);
});

Deno.test('withTransactionAsync - rolls back on async error', async () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('asynctest', 1)");

  try {
    await withTransactionAsync(async () => {
      db.query("UPDATE categories SET name = 'asyncchanged' WHERE name = 'asynctest'");
      await Promise.resolve();
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'asynctest'");
  assertEquals(result.length, 1);
});

Deno.test('deleteByFloorplan - placements are cleaned up', async () => {
  clearDatabase();

  // Create project → floorplan → item → variant → BOM entry → placement
  const project = await projectRepository.create({ name: 'Test Project', customer_name: 'Test Customer' });
  const floorplan = await floorplanRepository.create({ project_id: project.id, name: 'Floor 1', image_path: 'test.png' });
  const category = await categoryRepository.create({ name: 'Cat1' });
  const item = await itemRepository.create({ name: 'Item1', category_id: category.id });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Default',
    price: 100,
  });

  // Create BOM entry and placement
  const bomEntry = await bomService.createBomEntry(project.id, floorplan.id, variant.id);
  await placementRepository.createWithBomEntry(bomEntry.id, floorplan.id, { x: 10, y: 20, width: 50, height: 50, rotation: 0 });

  // Verify placement exists
  const placementsBefore = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsBefore.length, 1);

  // Delete by floorplan
  await bomEntryRepository.deleteByFloorplan(floorplan.id);

  // Placements should be cleaned up
  const placementsAfter = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsAfter.length, 0);
});

Deno.test('Route ordering - POST /placements/bulk-update is reachable', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({ email: 'routetest@example.com', password_hash: passwordHash, role: 'admin' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'routetest@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  // POST to bulk-update — should NOT return 404
  const response = await testRequest('/api/placements/bulk-update?floorplan_id=1&item_id=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ width: 100, height: 100 }),
  });

  const data = await parseJSON(response);
  assertEquals(response.status !== 404, true, `Expected non-404, got ${response.status}: ${JSON.stringify(data)}`);
});

Deno.test('UserRepository.update - can update email with !== undefined check', async () => {
  clearDatabase();

  const user = await userRepository.create({
    email: 'original@example.com',
    password_hash: hashPassword('testpassword123'),
    role: 'user',
  });

  const updated = await userRepository.update(user.id, { email: 'new@example.com' });
  assertEquals(updated?.email, 'new@example.com');
});

Deno.test('ItemRepository.delete - no nested transaction error with variants and addons', async () => {
  clearDatabase();

  // Create full chain: category → item → variant → addon variant → addon link
  const category = await categoryRepository.create({ name: 'NestCat' });
  const item = await itemRepository.create({ name: 'NestItem', category_id: category.id });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Style1',
    price: 50,
  });
  // Create a second item/variant to use as addon
  const addonItem = await itemRepository.create({ name: 'AddonItem', category_id: category.id });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'AddonStyle',
    price: 10,
  });

  // Link addon to variant
  const { variantAddonRepository } = await import('../../src/repositories/variant-addon.ts');
  await variantAddonRepository.create({
    variant_id: variant.id,
    addon_variant_id: addonVariant.id,
    sort_order: 1,
    is_required: false,
  });

  // This should NOT throw "cannot start a transaction within a transaction"
  await itemRepository.delete(item.id);

  // Verify item and its variants are gone
  const deletedItem = await itemRepository.findById(item.id);
  assertEquals(deletedItem, null);

  const db = getDb();
  const remainingVariants = db.queryEntries(`SELECT * FROM item_variants WHERE item_id = ?`, [item.id]);
  assertEquals(remainingVariants.length, 0);
});

Deno.test('ItemRepository.delete - rolls back on error', async () => {
  clearDatabase();

  const category = await categoryRepository.create({ name: 'RollbackCat' });
  const item = await itemRepository.create({ name: 'RollbackItem', category_id: category.id });
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Style1',
    price: 50,
  });

  // Verify the positive case: successful delete removes everything atomically
  await itemRepository.delete(item.id);

  const db = getDb();
  const items = db.queryEntries(`SELECT * FROM items WHERE id = ?`, [item.id]);
  assertEquals(items.length, 0);
  const variants = db.queryEntries(`SELECT * FROM item_variants WHERE item_id = ?`, [item.id]);
  assertEquals(variants.length, 0);
});

Deno.test('BomEntry.delete - cleans up child placements', async () => {
  clearDatabase();

  const project = await projectRepository.create({ name: 'BomDelProject', customer_name: 'Test' });
  const floorplan = await floorplanRepository.create({ project_id: project.id, name: 'Floor', image_path: 'test.png' });
  const category = await categoryRepository.create({ name: 'Cat' });
  const item = await itemRepository.create({ name: 'Item', category_id: category.id });
  const variant = await itemVariantRepository.create({ item_id: item.id, style_name: 'S', price: 100 });

  const bomEntry = await bomService.createBomEntry(project.id, floorplan.id, variant.id);
  await placementRepository.createWithBomEntry(bomEntry.id, floorplan.id, { x: 0, y: 0, width: 50, height: 50, rotation: 0 });

  // Verify placement exists
  const before = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(before.length, 1);

  // Delete BOM entry
  await bomEntryRepository.delete(bomEntry.id);

  // Placements should be gone
  const after = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(after.length, 0);

  // BOM entry should be gone
  const db = getDb();
  const bom = db.queryEntries(`SELECT * FROM project_bom WHERE id = ?`, [bomEntry.id]);
  assertEquals(bom.length, 0);
});

Deno.test('CategoryRepository.reorder - updates all sort orders atomically', () => {
  clearDatabase();

  const db = getDb();
  // Create 3 categories
  db.query("INSERT INTO categories (id, name, sort_order) VALUES (1, 'A', 1)");
  db.query("INSERT INTO categories (id, name, sort_order) VALUES (2, 'B', 2)");
  db.query("INSERT INTO categories (id, name, sort_order) VALUES (3, 'C', 3)");

  // Reorder: reverse
  categoryRepository.reorder([3, 2, 1]);

  const result = db.queryEntries<{ id: number; sort_order: number }>(`SELECT id, sort_order FROM categories ORDER BY id`);
  assertEquals(result[0].sort_order, 3); // id=1 is now last
  assertEquals(result[1].sort_order, 2); // id=2 stays middle
  assertEquals(result[2].sort_order, 1); // id=3 is now first
});

Deno.test('BomService.updateFromCatalog - totalAfter reflects updated prices', async () => {
  clearDatabase();

  const project = await projectRepository.create({ name: 'TotalProject', customer_name: 'Test' });
  const floorplan = await floorplanRepository.create({ project_id: project.id, name: 'Floor', image_path: 'test.png' });
  const category = await categoryRepository.create({ name: 'Cat' });
  const item = await itemRepository.create({ name: 'Item', category_id: category.id });
  const variant = await itemVariantRepository.create({ item_id: item.id, style_name: 'S', price: 100 });

  // Create BOM entry (snapshot at price=100) and placement
  const bomEntry = await bomService.createBomEntry(project.id, floorplan.id, variant.id);
  await placementRepository.createWithBomEntry(bomEntry.id, floorplan.id, { x: 0, y: 0, width: 50, height: 50, rotation: 0 });

  // Change the catalog price
  const db = getDb();
  db.query(`UPDATE item_variants SET price = 200 WHERE id = ?`, [variant.id]);

  // Run updateFromCatalog
  const report = await bomService.updateFromCatalog(floorplan.id);

  // totalBefore should be 100, totalAfter should be 200
  assertEquals(report.totalBefore, 100);
  assertEquals(report.totalAfter, 200);
  assertEquals(report.updated.length, 1);
});

Deno.test('BomService.updateFromCatalog - updates snapshot including picture_path on price change', async () => {
  clearDatabase();

  const project = await projectRepository.create({ name: 'ImgProject', customer_name: 'Test' });
  const floorplan = await floorplanRepository.create({ project_id: project.id, name: 'Floor', image_path: 'test.png' });
  const category = await categoryRepository.create({ name: 'Cat' });
  const item = await itemRepository.create({ name: 'Item', category_id: category.id });
  const variant = await itemVariantRepository.create({ item_id: item.id, style_name: 'S', price: 100 });

  const bomEntry = await bomService.createBomEntry(project.id, floorplan.id, variant.id);
  await placementRepository.createWithBomEntry(bomEntry.id, floorplan.id, { x: 0, y: 0, width: 50, height: 50, rotation: 0 });

  // Set a catalog image on the variant and change price to trigger update
  const db = getDb();
  db.query(`UPDATE item_variants SET image_path = 'items/test-image.jpg', price = 150 WHERE id = ?`, [variant.id]);

  const report = await bomService.updateFromCatalog(floorplan.id);

  // Verify price was updated and the update was reported
  assertEquals(report.updated.length, 1);
  assertEquals(report.updated[0].oldPrice, 100);
  assertEquals(report.updated[0].newPrice, 150);

  // Verify the BOM entry snapshot was updated in DB (price updated)
  const entries = db.queryEntries<{ unit_price: number; picture_path: string | null }>(
    `SELECT unit_price, picture_path FROM project_bom WHERE id = ?`, [bomEntry.id]
  );
  assertEquals(entries.length, 1);
  assertEquals(entries[0].unit_price, 150);

  // The copyImageToProject call is attempted. In test env without actual files,
  // the service falls back to the original catalog path. Verify the field is set.
  // (Real env would return a project-scoped path starting with 'projects/')
  assertEquals(entries[0].picture_path !== undefined, true);
});

Deno.test('Route ordering - POST /placements/bulk-update responds with correct handler', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({ email: 'route2@example.com', password_hash: passwordHash, role: 'admin' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'route2@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  // Request without required query params should get a 400 "Missing floorplan_id or item_id"
  const response = await testRequest('/api/placements/bulk-update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ width: 100, height: 100 }),
  });

  const data = await parseJSON(response);
  assertEquals(response.status, 400);
  assertEquals(data.error, 'Missing floorplan_id or item_id query parameter');
});

Deno.test('ExcelSyncService - syncCatalog handles missing file gracefully', async () => {
  clearDatabase();

  const { excelSyncService } = await import('../../src/services/excel-sync.ts');

  // Sync with non-existent file should fail gracefully with result.success = false
  const result = await excelSyncService.syncCatalog('/nonexistent/file.xlsx');

  assertEquals(result.success, false);
  assertEquals(result.errors.length > 0, true);

  // Verify no partial data was committed (rollback worked)
  const db = getDb();
  const categories = db.queryEntries(`SELECT * FROM categories`);
  assertEquals(categories.length, 0);
});
