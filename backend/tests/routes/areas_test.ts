import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';

await setupTestDatabase();

const { areaRepository } = await import('../../src/repositories/area.ts');

/**
 * Creates a test project and floorplan, returning the floorplan ID.
 */
function createTestFloorplan(): number {
  const db = getDb();
  db.query(`INSERT INTO projects (name, customer_name) VALUES ('Test Project', 'Test Customer')`);
  const projectId = Number(db.lastInsertRowId);
  db.query(`INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, 'Floor 1', 'test.png', 0)`, [projectId]);
  return Number(db.lastInsertRowId);
}

/**
 * Creates the full chain needed for placement tests:
 * category → item → variant → project_bom entry → placement
 * Returns { floorplanId, projectId, placementId, bomId }
 */
function createTestPlacementData(): {
  floorplanId: number;
  projectId: number;
  placementId: number;
  bomId: number;
} {
  const db = getDb();

  db.query(`INSERT INTO projects (name, customer_name) VALUES ('Placement Project', 'Test Customer')`);
  const projectId = Number(db.lastInsertRowId);

  db.query(`INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, 'Floor 1', 'test.png', 0)`, [projectId]);
  const floorplanId = Number(db.lastInsertRowId);

  db.query(`INSERT INTO categories (name, sort_order) VALUES ('Test Category', 1)`);
  const categoryId = Number(db.lastInsertRowId);

  db.query(`INSERT INTO items (name, category_id) VALUES ('Test Item', ?)`, [categoryId]);
  const itemId = Number(db.lastInsertRowId);

  db.query(
    `INSERT INTO item_variants (item_id, style_name, price) VALUES (?, 'Default', 100)`,
    [itemId],
  );
  const variantId = Number(db.lastInsertRowId);

  db.query(
    `INSERT INTO project_bom (project_id, floorplan_id, item_id, variant_id, item_name, unit_price) VALUES (?, ?, ?, ?, 'Test Item', 100)`,
    [projectId, floorplanId, itemId, variantId],
  );
  const bomId = Number(db.lastInsertRowId);

  db.query(
    `INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation) VALUES (?, ?, 'item', 10, 20, 50, 50, 0)`,
    [bomId, floorplanId],
  );
  const placementId = Number(db.lastInsertRowId);

  return { floorplanId, projectId, placementId, bomId };
}

Deno.test('AreaRepository - should create an area with default vertices', async () => {
  clearDatabase();

  const floorplanId = createTestFloorplan();

  const area = await areaRepository.create({
    floorplan_id: floorplanId,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    name: 'Living Room',
    color: '#FF0000',
    opacity: 0.3,
  });

  assertExists(area.id);
  assertEquals(area.name, 'Living Room');
  assertEquals(area.color, '#FF0000');
  assertEquals(area.opacity, 0.3);
  assertEquals(area.vertices.length, 4);
  assertEquals(area.device_count, 0);
  assertEquals(area.floorplan_id, floorplanId);
  assertEquals(area.x, 10);
  assertEquals(area.y, 20);
  assertEquals(area.width, 100);
  assertEquals(area.height, 80);
});

Deno.test('AreaRepository - should list areas by floorplan', async () => {
  clearDatabase();

  const floorplanId = createTestFloorplan();

  await areaRepository.create({
    floorplan_id: floorplanId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    name: 'Area One',
  });

  await areaRepository.create({
    floorplan_id: floorplanId,
    x: 200,
    y: 200,
    width: 150,
    height: 120,
    name: 'Area Two',
  });

  const areas = await areaRepository.findByFloorplan(floorplanId);

  assertEquals(areas.length, 2);

  const names = areas.map((a) => a.name);
  assertEquals(names.includes('Area One'), true);
  assertEquals(names.includes('Area Two'), true);
});

Deno.test('AreaRepository - should update area properties', async () => {
  clearDatabase();

  const floorplanId = createTestFloorplan();

  const area = await areaRepository.create({
    floorplan_id: floorplanId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    name: 'Original Name',
    color: '#0000FF',
  });

  const updated = await areaRepository.updateProperties(area.id, {
    name: 'Updated Name',
    color: '#00FF00',
  });

  assertExists(updated);
  assertEquals(updated!.name, 'Updated Name');
  assertEquals(updated!.color, '#00FF00');
  assertEquals(updated!.floorplan_id, floorplanId);
});

Deno.test('AreaRepository - should update vertices and recompute bounding box', async () => {
  clearDatabase();

  const floorplanId = createTestFloorplan();

  const area = await areaRepository.create({
    floorplan_id: floorplanId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });

  // L-shaped polygon with 6 vertices
  const lShapeVertices = [
    { x: 0,   y: 0   },
    { x: 100, y: 0   },
    { x: 100, y: 50  },
    { x: 50,  y: 50  },
    { x: 50,  y: 100 },
    { x: 0,   y: 100 },
  ];

  const updated = await areaRepository.updateVertices(area.id, lShapeVertices);

  assertExists(updated);
  assertEquals(updated!.vertices.length, 6);

  // Bounding box: minX=0, minY=0, maxX=100, maxY=100 → width=100, height=100
  assertEquals(updated!.x, 0);
  assertEquals(updated!.y, 0);
  assertEquals(updated!.width, 100);
  assertEquals(updated!.height, 100);
});

Deno.test('AreaRepository - should delete area and nullify area_id on contained placements', async () => {
  clearDatabase();

  const { floorplanId, placementId } = createTestPlacementData();

  // Create area on that floorplan
  const area = await areaRepository.create({
    floorplan_id: floorplanId,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    name: 'Zone A',
  });

  // Assign the placement to this area
  await areaRepository.assignPlacementToArea(placementId, area.id);

  // Verify assignment took effect
  const db = getDb();
  const beforeRows = db.queryEntries<{ area_id: number | null }>(
    `SELECT area_id FROM placements WHERE id = ?`,
    [placementId],
  );
  assertEquals(beforeRows[0].area_id, area.id);

  // Delete the area
  await areaRepository.delete(area.id);

  // Area should no longer exist
  const deleted = await areaRepository.findById(area.id);
  assertEquals(deleted, null);

  // Placement should still exist with area_id nullified
  const afterRows = db.queryEntries<{ id: number; area_id: number | null }>(
    `SELECT id, area_id FROM placements WHERE id = ?`,
    [placementId],
  );
  assertEquals(afterRows.length, 1);
  assertEquals(afterRows[0].area_id, null);
});

Deno.test('AreaRepository - should assign placement to area', async () => {
  clearDatabase();

  const { floorplanId, placementId } = createTestPlacementData();

  const area = await areaRepository.create({
    floorplan_id: floorplanId,
    x: 0,
    y: 0,
    width: 300,
    height: 300,
    name: 'Assigned Zone',
  });

  await areaRepository.assignPlacementToArea(placementId, area.id);

  const db = getDb();
  const rows = db.queryEntries<{ area_id: number | null }>(
    `SELECT area_id FROM placements WHERE id = ?`,
    [placementId],
  );

  assertEquals(rows.length, 1);
  assertEquals(rows[0].area_id, area.id);
});
