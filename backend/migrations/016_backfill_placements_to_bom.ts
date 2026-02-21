// Migration 016: Backfill existing placements to BOM entries
// Run: deno run --allow-all backend/migrations/016_backfill_placements_to_bom.ts

import { getDb } from '../src/config/database.ts';

async function backfillPlacements() {
  const db = getDb();
  
  console.log('Starting backfill of placements to BOM entries...');
  
  // Get all existing placements that haven't been migrated yet
  const placements = db.queryEntries(`
    SELECT id, floorplan_id, item_variant_id, x, y, width, height
    FROM placements
    WHERE bom_entry_id IS NULL
  `);
  
  console.log(`Found ${placements.length} placements to migrate`);
  
  let processed = 0;
  let errors = 0;
  
  for (const placement of placements) {
    try {
      const p = placement as Record<string, number>;
      
      // Get variant details with item info
      const variants = db.queryEntries(`
        SELECT v.id as variant_id, v.item_id, v.style_name, v.price, v.image_path,
               i.name, i.base_model_number
        FROM item_variants v
        JOIN items i ON v.item_id = i.id
        WHERE v.id = ?
      `, [p.item_variant_id]);
      
      if (variants.length === 0) {
        console.warn(`Variant ${p.item_variant_id} not found for placement ${p.id}`);
        errors++;
        continue;
      }
      
      const v = variants[0] as Record<string, unknown>;
      
      // Check if BOM entry already exists for this floorplan + variant
      const existingBom = db.queryEntries(`
        SELECT id FROM floorplan_bom_entries
        WHERE floorplan_id = ? AND variant_id = ? AND parent_bom_entry_id IS NULL
      `, [p.floorplan_id, p.item_variant_id]);
      
      let bomEntryId: number;
      
      if (existingBom.length > 0) {
        // Reuse existing BOM entry
        const existing = existingBom[0] as Record<string, number>;
        bomEntryId = existing.id;
        console.log(`Reusing existing BOM entry ${bomEntryId}`);
      } else {
        // Create new main BOM entry
        const baseModel = String(v.base_model_number || '');
        const styleName = String(v.style_name || '');
        const modelNumber = baseModel || styleName;
        const name = String(v.name || 'Unknown');
        const price = Number(v.price || 0);
        const picturePath = v.image_path ? String(v.image_path) : null;
        
        const result = db.queryEntries(`
          INSERT INTO floorplan_bom_entries 
          (floorplan_id, item_id, variant_id, parent_bom_entry_id, 
           name_snapshot, model_number_snapshot, price_snapshot, picture_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [
          p.floorplan_id,
          Number(v.item_id),
          p.item_variant_id,
          null,
          name,
          modelNumber,
          price,
          picturePath
        ]);
        
        const inserted = result[0] as Record<string, number>;
        bomEntryId = inserted.id;
        console.log(`Created BOM entry ${bomEntryId} for ${name}`);
        
        // Create required addon children
        const requiredAddons = db.queryEntries(`
          SELECT 
            ia.addon_item_id,
            i.name as addon_name,
            i.base_model_number as addon_base_model,
            iv.id as addon_variant_id,
            iv.price as addon_price,
            iv.image_path as addon_image
          FROM item_addons ia
          JOIN items i ON ia.addon_item_id = i.id
          JOIN item_variants iv ON i.id = iv.item_id
          WHERE ia.parent_item_id = ?
            AND ia.is_required = true
            AND iv.sort_order = (SELECT MIN(sort_order) FROM item_variants WHERE item_id = i.id)
          ORDER BY ia.slot_number
        `, [Number(v.item_id)]);
        
        for (const addon of requiredAddons) {
          const a = addon as Record<string, unknown>;
          const addonName = String(a.addon_name || 'Unknown');
          const addonBaseModel = String(a.addon_base_model || '');
          const addonPrice = Number(a.addon_price || 0);
          const addonPicture = a.addon_image ? String(a.addon_image) : null;
          
          db.query(`
            INSERT INTO floorplan_bom_entries 
            (floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            p.floorplan_id,
            Number(a.addon_item_id),
            Number(a.addon_variant_id),
            bomEntryId,
            addonName,
            addonBaseModel,
            addonPrice,
            addonPicture
          ]);
          
          console.log(`  Created addon: ${addonName}`);
        }
      }
      
      // Update placement to reference BOM entry
      db.query(`
        UPDATE placements SET bom_entry_id = ? WHERE id = ?
      `, [bomEntryId, p.id]);
      
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${placements.length} placements...`);
      }
    } catch (err) {
      console.error(`Error processing placement:`, err);
      errors++;
    }
  }
  
  console.log('\nBackfill complete!');
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${placements.length}`);
}

// Run the backfill
backfillPlacements().catch(console.error);
