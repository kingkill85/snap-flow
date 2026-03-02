/**
 * BOM Image Migration Service
 * Automatically migrates existing BOM images from catalog to project folders
 * Runs automatically on server startup and tracks progress
 */

import { getDb } from '../config/database.ts';
import type { bomEntryRepository } from '../repositories/bom-entry.ts';
import { fileStorageService } from './file-storage.ts';

interface MigrationProgress {
  totalEntries: number;
  migratedEntries: number;
  failedEntries: number;
}

/**
 * Setup the migration tracking table
 */
async function setupMigrationTracking(): Promise<void> {
  getDb().execute(`
    CREATE TABLE IF NOT EXISTS bom_image_migration (
      id INTEGER PRIMARY KEY,
      bom_entry_id INTEGER NOT NULL UNIQUE,
      old_picture_path TEXT,
      new_picture_path TEXT,
      migrated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed'))
    )
  `);
}

/**
 * Get all BOM entries that need image migration
 */
async function getPendingMigrations(): Promise<Array<{
  id: number;
  project_id: number;
  picture_path: string | null;
}>> {
  const result = getDb().queryEntries(`
    SELECT id, project_id, picture_path
    FROM project_bom
    WHERE picture_path IS NOT NULL
      AND picture_path NOT LIKE 'projects/%'
      AND id NOT IN (
        SELECT bom_entry_id FROM bom_image_migration WHERE status = 'completed'
      )
    ORDER BY id
  `);
  
  return result as Array<{
    id: number;
    project_id: number;
    picture_path: string | null;
  }>;
}

/**
 * Migrate a single BOM entry's image
 */
async function migrateEntry(
  entryId: number,
  projectId: number,
  oldPicturePath: string
): Promise<string | null> {
  try {
    // Check if source file exists
    const sourceExists = await fileStorageService.fileExists(oldPicturePath);
    if (!sourceExists) {
      console.log(`  ⚠️ Source image not found: ${oldPicturePath}, skipping`);
      return null;
    }

    // Copy image to project folder
    const fileName = oldPicturePath.split('/').pop() || 'image.jpg';
    const newFileName = `${entryId}-${fileName}`;
    const destSubdir = `projects/${projectId}/bom-images`;

    const newPath = await fileStorageService.copyFile(
      oldPicturePath,
      destSubdir,
      newFileName
    );

    // Update database record
    getDb().query(`
      UPDATE project_bom
      SET picture_path = ?
      WHERE id = ?
    `, [newPath, entryId]);

    return newPath;
  } catch (error) {
    console.error(`  ❌ Failed to migrate entry ${entryId}:`, error);
    return null;
  }
}

/**
 * Record migration status
 */
async function recordMigration(
  entryId: number,
  oldPath: string,
  newPath: string | null,
  status: 'completed' | 'failed'
): Promise<void> {
  getDb().query(`
    INSERT OR REPLACE INTO bom_image_migration 
    (bom_entry_id, old_picture_path, new_picture_path, status)
    VALUES (?, ?, ?, ?)
  `, [entryId, oldPath, newPath, status]);
}

/**
 * Run the BOM image migration
 * This should be called on server startup
 */
export async function runBomImageMigration(): Promise<MigrationProgress> {
  const progress: MigrationProgress = {
    totalEntries: 0,
    migratedEntries: 0,
    failedEntries: 0,
  };

  console.log('🖼️ Checking for BOM image migrations...');

  try {
    // Setup tracking table
    await setupMigrationTracking();

    // Get pending migrations
    const pendingEntries = await getPendingMigrations();
    
    if (pendingEntries.length === 0) {
      console.log('✅ All BOM images already migrated');
      return progress;
    }

    console.log(`🔄 Found ${pendingEntries.length} BOM entries needing image migration`);
    progress.totalEntries = pendingEntries.length;

    // Migrate each entry
    for (const entry of pendingEntries) {
      if (!entry.picture_path) continue;

      console.log(`  Migrating entry ${entry.id}: ${entry.picture_path}`);

      const newPath = await migrateEntry(
        entry.id,
        entry.project_id,
        entry.picture_path
      );

      if (newPath) {
        await recordMigration(entry.id, entry.picture_path, newPath, 'completed');
        console.log(`    ✅ Migrated to: ${newPath}`);
        progress.migratedEntries++;
      } else {
        await recordMigration(entry.id, entry.picture_path, null, 'failed');
        console.log(`    ❌ Migration failed`);
        progress.failedEntries++;
      }
    }

    console.log('✅ BOM image migration complete');
    console.log(`   Migrated: ${progress.migratedEntries}/${progress.totalEntries}`);
    if (progress.failedEntries > 0) {
      console.log(`   Failed: ${progress.failedEntries}`);
    }

    return progress;
  } catch (error) {
    console.error('❌ BOM image migration error:', error);
    throw error;
  }
}

/**
 * Get migration statistics (for admin/debugging)
 */
export async function getMigrationStats(): Promise<{
  total: number;
  completed: number;
  failed: number;
  pending: number;
}> {
  await setupMigrationTracking();
  
  const result = getDb().queryEntries(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM bom_image_migration
  `);

  return result[0] as {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
}

/**
 * Reset migration (for testing/debugging only)
 */
export async function resetMigration(): Promise<void> {
  console.log('⚠️ Resetting BOM image migration...');
  
  getDb().execute(`DELETE FROM bom_image_migration`);
  
  console.log('✅ Migration tracking reset');
}
