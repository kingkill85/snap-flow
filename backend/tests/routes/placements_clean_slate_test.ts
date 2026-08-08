import { assertEquals } from '@std/assert';
import { getDb } from '../../src/config/database.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { clearDatabase, setupTestDatabase } from '../test-utils.ts';
import { parseJSON, testRequest } from '../test-client.ts';

await setupTestDatabase();

interface Fixture {
  floorplanId: number;
  otherFloorplanId: number;
  placementIds: number[];
  orphanedBomId: number;
  orphanedChildId: number;
  retainedBomId: number;
  areaPlacementId: number;
}

function insertId(sql: string, params: (string | number | null)[]): number {
  return getDb().queryEntries<{ id: number }>(sql, params)[0]!.id;
}

function createFixture(
  tenantId = 1,
  status: 'active' | 'completed' = 'active',
): Fixture {
  const db = getDb();
  const groupId = insertId(
    `INSERT INTO project_groups (customer_name, status, tenant_id) VALUES (?, ?, ?) RETURNING id`,
    [`Tenant ${tenantId}`, status, tenantId],
  );
  const projectId = insertId(
    `INSERT INTO projects (project_group_id, version_name, tenant_id) VALUES (?, 'v1', ?) RETURNING id`,
    [groupId, tenantId],
  );
  const floorplanId = insertId(
    `INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, 'Main', 'floorplans/main.png', 1) RETURNING id`,
    [projectId],
  );
  const otherFloorplanId = insertId(
    `INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, 'Other', 'floorplans/other.png', 2) RETURNING id`,
    [projectId],
  );

  const orphanedBomId = insertId(
    `INSERT INTO project_bom (project_id, floorplan_id, item_name, unit_price, picture_path)
     VALUES (?, ?, 'Placed product', 10, 'projects/1/bom-images/placed.png') RETURNING id`,
    [projectId, floorplanId],
  );
  const orphanedChildId = insertId(
    `INSERT INTO project_bom (project_id, floorplan_id, parent_bom_id, item_name, unit_price, picture_path)
     VALUES (?, ?, ?, 'Addon', 2, 'projects/1/bom-images/addon.png') RETURNING id`,
    [projectId, floorplanId, orphanedBomId],
  );
  const retainedBomId = insertId(
    `INSERT INTO project_bom (project_id, floorplan_id, item_name, unit_price)
     VALUES (?, ?, 'Manual BOM row', 20) RETURNING id`,
    [projectId, floorplanId],
  );
  const otherBomId = insertId(
    `INSERT INTO project_bom (project_id, floorplan_id, item_name, unit_price)
     VALUES (?, ?, 'Other product', 30) RETURNING id`,
    [projectId, otherFloorplanId],
  );
  const placementIds = [10, 20].map((x) =>
    insertId(
      `INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
     VALUES (?, ?, 'item', ?, 10, 50, 50, 0) RETURNING id`,
      [orphanedBomId, floorplanId, x],
    )
  );
  insertId(
    `INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
     VALUES (?, ?, 'item', 30, 30, 50, 50, 0) RETURNING id`,
    [otherBomId, otherFloorplanId],
  );
  const areaPlacementId = insertId(
    `INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
     VALUES (NULL, ?, 'area', 0, 0, 100, 100, 0) RETURNING id`,
    [floorplanId],
  );
  db.query(
    `INSERT INTO area_properties (placement_id, name, color, opacity) VALUES (?, 'Kitchen', '#fff', 0.2)`,
    [areaPlacementId],
  );

  return {
    floorplanId,
    otherFloorplanId,
    placementIds,
    orphanedBomId,
    orphanedChildId,
    retainedBomId,
    areaPlacementId,
  };
}

async function token(
  role: 'admin' | 'tenant_admin' | 'user',
  tenantId = 1,
): Promise<string> {
  return await generateToken(
    tenantId,
    `${role}-${tenantId}@example.com`,
    role,
    tenantId,
  );
}

async function clearFloorplan(
  floorplanId: string | number,
  bearer?: string,
): Promise<Response> {
  return await testRequest(`/api/placements/floorplan/${floorplanId}`, {
    method: 'DELETE',
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

Deno.test('Clean Slate route enforces trust boundaries and route ordering', async (t) => {
  clearDatabase();
  getDb().query(
    `INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Tenant 2', 0, 1)`,
  );
  const own = createFixture(1);
  const foreign = createFixture(2);
  const completed = createFixture(1, 'completed');
  const adminToken = await token('tenant_admin');

  await t.step('requires authentication', async () => {
    assertEquals((await clearFloorplan(own.floorplanId)).status, 401);
  });
  await t.step('rejects malformed ID through the specific route', async () => {
    assertEquals(
      (await clearFloorplan('not-a-number', adminToken)).status,
      400,
    );
  });
  await t.step('does not reveal missing or cross-tenant targets', async () => {
    assertEquals((await clearFloorplan(999999, adminToken)).status, 404);
    assertEquals(
      (await clearFloorplan(foreign.floorplanId, adminToken)).status,
      404,
    );
  });
  await t.step(
    'rejects read-only user and completed project group',
    async () => {
      assertEquals(
        (await clearFloorplan(own.floorplanId, await token('user'))).status,
        403,
      );
      assertEquals(
        (await clearFloorplan(completed.floorplanId, adminToken)).status,
        403,
      );
    },
  );
});

Deno.test('Clean Slate atomically removes only target item placements and newly orphaned BOM trees', async () => {
  clearDatabase();
  const fixture = createFixture();
  const response = await clearFloorplan(
    fixture.floorplanId,
    await token('tenant_admin'),
  );
  assertEquals(response.status, 200);
  assertEquals(await parseJSON(response), {
    data: { deleted_count: 2 },
    message: 'Floorplan placements deleted successfully',
  });

  const db = getDb();
  assertEquals(
    db.queryEntries(
      `SELECT id FROM placements WHERE floorplan_id = ? AND type = 'item'`,
      [fixture.floorplanId],
    ),
    [],
  );
  assertEquals(
    db.queryEntries<{ id: number }>(`SELECT id FROM placements WHERE id = ?`, [
      fixture.areaPlacementId,
    ])[0]?.id,
    fixture.areaPlacementId,
  );
  assertEquals(
    db.queryEntries<{ id: number }>(`SELECT id FROM floorplans WHERE id = ?`, [
      fixture.floorplanId,
    ])[0]?.id,
    fixture.floorplanId,
  );
  assertEquals(
    db.queryEntries<{ image_path: string }>(
      `SELECT image_path FROM floorplans WHERE id = ?`,
      [fixture.floorplanId],
    )[0]?.image_path,
    'floorplans/main.png',
  );
  assertEquals(
    db.queryEntries(`SELECT id FROM project_bom WHERE id IN (?, ?)`, [
      fixture.orphanedBomId,
      fixture.orphanedChildId,
    ]),
    [],
  );
  assertEquals(
    db.queryEntries<{ id: number }>(`SELECT id FROM project_bom WHERE id = ?`, [
      fixture.retainedBomId,
    ])[0]?.id,
    fixture.retainedBomId,
  );
  assertEquals(
    db.queryEntries(
      `SELECT id FROM placements WHERE floorplan_id = ? AND type = 'item'`,
      [fixture.otherFloorplanId],
    ).length,
    1,
  );

  const repeated = await clearFloorplan(
    fixture.floorplanId,
    await token('tenant_admin'),
  );
  assertEquals(repeated.status, 200);
  assertEquals((await parseJSON(repeated)).data.deleted_count, 0);
});

Deno.test('Clean Slate rolls back placement deletion when BOM cleanup fails', async () => {
  clearDatabase();
  const fixture = createFixture();
  const db = getDb();
  db.query(
    `CREATE TRIGGER fail_clean_slate BEFORE DELETE ON project_bom BEGIN SELECT RAISE(ABORT, 'forced cleanup failure'); END`,
  );

  const response = await clearFloorplan(
    fixture.floorplanId,
    await token('tenant_admin'),
  );
  assertEquals(response.status, 500);
  assertEquals(
    db.queryEntries(
      `SELECT id FROM placements WHERE floorplan_id = ? AND type = 'item'`,
      [fixture.floorplanId],
    ).length,
    2,
  );
  assertEquals(
    db.queryEntries(`SELECT id FROM project_bom WHERE id = ?`, [
      fixture.orphanedBomId,
    ]).length,
    1,
  );
  db.query(`DROP TRIGGER fail_clean_slate`);
});
