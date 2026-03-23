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
  await placementRepository.createWithBomEntry(bomEntry.id, { x: 10, y: 20, width: 50, height: 50, rotation: 0 });

  // Verify placement exists
  const placementsBefore = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsBefore.length, 1);

  // Delete by floorplan
  await bomEntryRepository.deleteByFloorplan(floorplan.id);

  // Placements should be cleaned up
  const placementsAfter = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsAfter.length, 0);
});
