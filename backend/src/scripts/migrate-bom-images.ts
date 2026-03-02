#!/usr/bin/env -S deno run --allow-all
/**
 * Migration Script: Copy existing BOM images to project folders
 * 
 * This script copies all variant/addon images from the catalog (items/)
 * to their respective project folders (projects/{project-id}/bom-images/)
 * to make projects self-contained.
 * 
 * Run with: deno run --allow-all src/scripts/migrate-bom-images.ts
 */

import { getDb } from '../config/database.ts';

import { fileStorageService } from '../services/file-storage.ts';

interface MigrationResult {
  totalEntries: number;
  copiedEntries: number;
  skippedEntries: number;
  failedEntries: number;
  errors: Array<{ entryId: number; error: string }>;
}

async function migrateBomImages(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalEntries: 0,
    copiedEntries: 0,
    skippedEntries: 0,
    failedEntries: 0,
    errors: [],
  };

  console.log('Starting BOM image migration...\n');

  // Get all BOM entries with images
  const db = getDb();
  const entries = db.queryEntries(`
    SELECT id, project_id, picture_path
    FROM project_bom
    WHERE picture_path IS NOT NULL
    ORDER BY project_id, id
  `);

  result.totalEntries = entries.length;
  console.log(`Found ${entries.length} BOM entries with images\n`);

  for (const entry of entries as Array<{ id: number; project_id: number; picture_path: string }>) {
    try {
      // Skip if image is already in project folder (already migrated)
      if (entry.picture_path.startsWith('projects/')) {
        console.log(`  [SKIP] Entry ${entry.id}: Already in project folder`);
        result.skippedEntries++;
        continue;
      }

      // Skip if image path is from items/ catalog
      if (!entry.picture_path.startsWith('items/')) {
        console.log(`  [SKIP] Entry ${entry.id}: Not a catalog image (${entry.picture_path})`);
        result.skippedEntries++;
        continue;
      }

      // Check if source file exists
      const sourceExists = await fileStorageService.fileExists(entry.picture_path);
      if (!sourceExists) {
        console.log(`  [SKIP] Entry ${entry.id}: Source image not found (${entry.picture_path})`);
        result.skippedEntries++;
        continue;
      }

      // Copy image to project folder
      const fileName = entry.picture_path.split('/').pop() || 'image.jpg';
      const newFileName = `${entry.id}-${fileName}`;
      const destSubdir = `projects/${entry.project_id}/bom-images`;

      console.log(`  [COPY] Entry ${entry.id}: ${entry.picture_path} → ${destSubdir}/${newFileName}`);

      const newPath = await fileStorageService.copyFile(
        entry.picture_path,
        destSubdir,
        newFileName
      );

      // Update database record
      db.query(`
        UPDATE project_bom
        SET picture_path = ?
        WHERE id = ?
      `, [newPath, entry.id]);

      console.log(`  [DONE] Entry ${entry.id}: Updated to ${newPath}`);
      result.copiedEntries++;

    } catch (error) {
      console.error(`  [ERROR] Entry ${entry.id}:`, error);
      result.failedEntries++;
      result.errors.push({
        entryId: entry.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('BOM Image Migration Tool');
    console.log('='.repeat(60));
    console.log();

    // Initialize database (getDb will create the connection)
    console.log('Initializing database...');
    getDb();
    console.log('Database initialized\n');

    // Run migration
    const result = await migrateBomImages();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total entries processed: ${result.totalEntries}`);
    console.log(`Images copied:           ${result.copiedEntries}`);
    console.log(`Entries skipped:         ${result.skippedEntries}`);
    console.log(`Failed entries:          ${result.failedEntries}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  - Entry ${error.entryId}: ${error.error}`);
      }
    }

    console.log('\nMigration complete!');
    Deno.exit(0);

  } catch (error) {
    console.error('\nFatal error:', error);
    Deno.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  main();
}
