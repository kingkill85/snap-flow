#!/usr/bin/env -S deno run --allow-all
/**
 * Repair tool: shared & missing BOM picture files
 *
 * Background: until the createVersion fix, duplicating a project version
 * copied floorplan image files but only copied the BOM `picture_path` string.
 * That left both versions' project_bom rows pointing at the same file on
 * disk. Deleting one version (or even one placement in one version) then
 * unlinked the file out from under the surviving version.
 *
 * This script scans project_bom and repairs two situations:
 *
 *   1. Shared path: a picture_path is referenced by 2+ project_bom rows.
 *      The earliest-created row keeps the original file; every other row
 *      gets its own copy at projects/<row.project_id>/bom-images/<id>-<name>.
 *
 *   2. Missing file: picture_path is set but the file is gone. We try to
 *      recover from item_variants.image_path (the catalog source), copying
 *      it into the row's project folder. If the source is also missing the
 *      row is reported and skipped.
 *
 * Defaults to dry-run. Pass --apply to actually mutate. Run from backend/:
 *
 *   deno run --allow-all src/scripts/fix-shared-bom-images.ts            # dry run
 *   deno run --allow-all src/scripts/fix-shared-bom-images.ts --apply    # mutate
 */

import { getDb } from '../config/database.ts';
import { fileStorageService } from '../services/file-storage.ts';

interface BomRow {
  id: number;
  project_id: number;
  variant_id: number | null;
  picture_path: string;
  created_at: string;
}

interface Summary {
  totalWithPath: number;
  sharedRows: number;
  sharedGroups: number;
  rowsRecopied: number;
  rowsRecoveredFromCatalog: number;
  rowsUnrecoverable: number;
  errors: Array<{ bomId: number; error: string }>;
}

function deriveDestFilename(bomId: number, sourcePath: string): string {
  const base = sourcePath.split('/').pop() || 'image.jpg';
  return `${bomId}-${base}`;
}

async function repairRow(
  row: BomRow,
  source: string,
  apply: boolean,
): Promise<string> {
  const destDir = `projects/${row.project_id}/bom-images`;
  const newName = deriveDestFilename(row.id, source);
  const destPath = `${destDir}/${newName}`;

  if (!apply) {
    return destPath;
  }

  const copied = await fileStorageService.copyFile(source, destDir, newName);
  // copyFile returns the original source path if it fails — guard against that
  if (copied === source) {
    throw new Error(`copyFile fell back to source path (copy likely failed): ${source}`);
  }

  getDb().query(`UPDATE project_bom SET picture_path = ? WHERE id = ?`, [copied, row.id]);
  return copied;
}

async function main(): Promise<void> {
  const apply = Deno.args.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY-RUN';

  console.log('='.repeat(72));
  console.log(`Fix shared/missing BOM picture files — ${mode}`);
  console.log('='.repeat(72));

  const db = getDb();

  const rows = db.queryEntries(`
    SELECT id, project_id, variant_id, picture_path, created_at
    FROM project_bom
    WHERE picture_path IS NOT NULL
    ORDER BY picture_path, created_at, id
  `) as unknown as BomRow[];

  const summary: Summary = {
    totalWithPath: rows.length,
    sharedRows: 0,
    sharedGroups: 0,
    rowsRecopied: 0,
    rowsRecoveredFromCatalog: 0,
    rowsUnrecoverable: 0,
    errors: [],
  };

  // Group by picture_path
  const byPath = new Map<string, BomRow[]>();
  for (const r of rows) {
    const list = byPath.get(r.picture_path) ?? [];
    list.push(r);
    byPath.set(r.picture_path, list);
  }

  console.log(`Found ${rows.length} BOM rows with picture_path`);
  console.log(`Found ${byPath.size} distinct paths`);

  // -------- Phase 1: shared paths --------
  for (const [path, group] of byPath.entries()) {
    if (group.length < 2) continue;

    summary.sharedGroups++;
    // Keep the oldest row (already first thanks to ORDER BY created_at, id)
    const keeper = group[0];
    const dupes = group.slice(1);

    const sourceExists = await fileStorageService.fileExists(path);

    console.log(
      `\n[SHARED] ${path}  refs=${group.length}  keeper=bom#${keeper.id} (project ${keeper.project_id})  sourceOnDisk=${sourceExists}`,
    );

    for (const dup of dupes) {
      summary.sharedRows++;
      try {
        if (!sourceExists) {
          console.log(`  [SKIP-PHASE-1] bom#${dup.id}: source missing, will try catalog recovery in phase 2`);
          continue;
        }
        const newPath = await repairRow(dup, path, apply);
        console.log(`  ${apply ? '[COPY]' : '[PLAN]'} bom#${dup.id} → ${newPath}`);
        if (apply) summary.rowsRecopied++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  [ERR ] bom#${dup.id}: ${msg}`);
        summary.errors.push({ bomId: dup.id, error: msg });
      }
    }
  }

  // -------- Phase 2: missing files (regenerate from variant catalog) --------
  // Re-read in case phase 1 already updated some rows
  const rowsForPhase2 = (apply
    ? (db.queryEntries(`
        SELECT id, project_id, variant_id, picture_path, created_at
        FROM project_bom
        WHERE picture_path IS NOT NULL
      `) as unknown as BomRow[])
    : rows);

  console.log(`\n--- Phase 2: missing files ---`);

  for (const r of rowsForPhase2) {
    const exists = await fileStorageService.fileExists(r.picture_path);
    if (exists) continue;

    if (r.variant_id == null) {
      console.log(`[UNRECOVERABLE] bom#${r.id}: file missing and no variant_id link`);
      summary.rowsUnrecoverable++;
      continue;
    }

    const variant = db.queryEntries(
      `SELECT image_path FROM item_variants WHERE id = ?`,
      [r.variant_id],
    ) as unknown as Array<{ image_path: string | null }>;

    const catalogPath = variant[0]?.image_path ?? null;
    if (!catalogPath) {
      console.log(`[UNRECOVERABLE] bom#${r.id}: variant ${r.variant_id} has no image_path`);
      summary.rowsUnrecoverable++;
      continue;
    }

    const catalogExists = await fileStorageService.fileExists(catalogPath);
    if (!catalogExists) {
      console.log(`[UNRECOVERABLE] bom#${r.id}: catalog source also missing (${catalogPath})`);
      summary.rowsUnrecoverable++;
      continue;
    }

    try {
      const newPath = await repairRow(r, catalogPath, apply);
      console.log(`${apply ? '[RECOVER]' : '[PLAN-RECOVER]'} bom#${r.id} from ${catalogPath} → ${newPath}`);
      if (apply) summary.rowsRecoveredFromCatalog++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ERR ] bom#${r.id}: ${msg}`);
      summary.errors.push({ bomId: r.id, error: msg });
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(`Summary (${mode})`);
  console.log('='.repeat(72));
  console.log(`BOM rows with picture_path:     ${summary.totalWithPath}`);
  console.log(`Distinct picture_paths:         ${byPath.size}`);
  console.log(`Shared path groups:             ${summary.sharedGroups}`);
  console.log(`Duplicate rows (need own copy): ${summary.sharedRows}`);
  if (apply) {
    console.log(`Rows re-copied from sibling:    ${summary.rowsRecopied}`);
    console.log(`Rows recovered from catalog:    ${summary.rowsRecoveredFromCatalog}`);
  }
  console.log(`Unrecoverable rows:             ${summary.rowsUnrecoverable}`);
  if (summary.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of summary.errors) console.log(`  - bom#${e.bomId}: ${e.error}`);
  }

  if (!apply) {
    console.log(`\nDry run — re-run with --apply to mutate files and DB.`);
  } else {
    console.log(`\nDone.`);
  }
}

if (import.meta.main) {
  try {
    await main();
    Deno.exit(0);
  } catch (e) {
    console.error('Fatal:', e);
    Deno.exit(1);
  }
}
