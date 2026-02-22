import { bomEntryRepository } from '../repositories/bom-entry.ts';
import { placementRepository } from '../repositories/placement.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { itemRepository } from '../repositories/item.ts';
import { variantAddonRepository } from '../repositories/variant-addon.ts';
import type { FloorplanBomEntry, CreateBomEntryDTO } from '../models/index.ts';

export interface BomGroup {
  mainEntry: FloorplanBomEntry;
  children: FloorplanBomEntry[];
  quantity: number;
  totalPrice: number;
}

export interface FloorplanBom {
  floorplanId: number;
  groups: BomGroup[];
  totalPrice: number;
}

export interface ChangeReport {
  updated: Array<{
    entryId: number;
    name: string;
    oldPrice: number;
    newPrice: number;
  }>;
  invalid: Array<{
    entryId: number;
    name: string;
    reason: string;
  }>;
  totalBefore: number;
  totalAfter: number;
}

/**
 * BOM Service
 * Handles business logic for BOM operations
 */
export class BomService {
  /**
   * Create a new BOM entry for a placement
   * Creates main entry + required addon children
   */
  async createBomEntry(
    floorplanId: number,
    variantId: number
  ): Promise<FloorplanBomEntry> {
    // Check if BOM entry already exists
    const existing = await bomEntryRepository.findByVariantAddons(
      floorplanId,
      variantId,
      null
    );
    
    if (existing) {
      return existing;
    }

    // Get variant details
    const variant = await itemVariantRepository.findById(variantId);
    if (!variant) {
      throw new Error('Variant not found');
    }

    const item = await itemRepository.findById(variant.item_id);
    if (!item) {
      throw new Error('Item not found');
    }

    // Create main BOM entry
    const mainEntry = await bomEntryRepository.create({
      floorplan_id: floorplanId,
      item_id: variant.item_id,
      variant_id: variantId,
      parent_bom_entry_id: null,
      name_snapshot: item.name,
      model_number_snapshot: item.base_model_number || `${variant.style_name}`,
      price_snapshot: variant.price,
      picture_path: variant.image_path,
    });

    // Create required addon children (only non-optional addons)
    const allAddons = await variantAddonRepository.findByVariantId(variantId);
    console.log(`Found ${allAddons.length} addons for variant ${variantId}`);
    const requiredAddons = allAddons.filter(addon => !addon.is_optional);
    console.log(`Found ${requiredAddons.length} required addons`);
    for (const addon of requiredAddons) {
      console.log(`Processing addon:`, addon);
      if (!addon.addon_variant) {
        console.log(`  Skipping: no addon_variant`);
        continue;
      }

      const addonItem = await itemRepository.findById(addon.addon_variant.item_id);
      if (!addonItem) {
        console.log(`  Skipping: no addonItem found`);
        continue;
      }

      await bomEntryRepository.create({
        floorplan_id: floorplanId,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_entry_id: mainEntry.id,
        name_snapshot: addonItem.name,
        model_number_snapshot: addonItem.base_model_number || '',
        price_snapshot: addon.addon_variant.price,
        picture_path: addon.addon_variant.image_path,
      });
      
      console.log(`  Created addon: ${addonItem.name}`);
    }

    return mainEntry;
  }

  /**
   * Switch variant for a BOM entry (same item)
   * Updates snapshots and recreates addons
   */
  async switchVariant(
    bomEntryId: number,
    newVariantId: number
  ): Promise<FloorplanBomEntry> {
    const entry = await bomEntryRepository.findById(bomEntryId);
    if (!entry) {
      throw new Error('BOM entry not found');
    }

    // Get new variant details
    const newVariant = await itemVariantRepository.findById(newVariantId);
    if (!newVariant) {
      throw new Error('New variant not found');
    }

    const item = await itemRepository.findById(newVariant.item_id);
    if (!item) {
      throw new Error('Item not found');
    }

    // Update main entry with new variant and snapshots
    const updated = await bomEntryRepository.update(bomEntryId, {
      variant_id: newVariantId,
      name_snapshot: item.name,
      model_number_snapshot: item.base_model_number || `${newVariant.style_name}`,
      price_snapshot: newVariant.price,
      picture_path: newVariant.image_path,
    });

    if (!updated) {
      throw new Error('Failed to update BOM entry');
    }

    // Delete old addon children
    const oldChildren = await bomEntryRepository.findChildren(bomEntryId);
    for (const child of oldChildren) {
      await bomEntryRepository.delete(child.id);
    }

    // Create new addon children for new variant
    const requiredAddons = await variantAddonRepository.findByVariantId(newVariantId);
    for (const addon of requiredAddons) {
      if (!addon.addon_variant) continue;

      const addonItem = await itemRepository.findById(addon.addon_variant.item_id);
      if (!addonItem) continue;

      await bomEntryRepository.create({
        floorplan_id: entry.floorplan_id,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_entry_id: bomEntryId,
        name_snapshot: addonItem.name,
        model_number_snapshot: addonItem.base_model_number || '',
        price_snapshot: addon.addon_variant.price,
        picture_path: addon.addon_variant.image_path,
      });
    }

    return updated;
  }

  /**
   * Get full BOM for a floorplan with hierarchical structure
   */
  async getBomForFloorplan(floorplanId: number): Promise<FloorplanBom> {
    // Get all BOM entries for floorplan
    const allEntries = await bomEntryRepository.findByFloorplan(floorplanId);
    
    // Separate main entries and children
    const mainEntries = allEntries.filter(e => e.parent_bom_entry_id === null);
    const childEntries = allEntries.filter(e => e.parent_bom_entry_id !== null);

    // Build groups
    const groups: BomGroup[] = [];
    
    for (const mainEntry of mainEntries) {
      // Get children for this entry
      const children = childEntries.filter(c => c.parent_bom_entry_id === mainEntry.id);
      
      // Get placement count (quantity)
      const quantity = await bomEntryRepository.getPlacementCount(mainEntry.id);
      
      // Calculate total price for group
      const mainTotal = mainEntry.price_snapshot * quantity;
      const childrenTotal = children.reduce((sum, child) => sum + child.price_snapshot, 0) * quantity;
      const totalPrice = mainTotal + childrenTotal;
      
      groups.push({
        mainEntry,
        children,
        quantity,
        totalPrice,
      });
    }

    // Calculate floorplan total
    const totalPrice = groups.reduce((sum, group) => sum + group.totalPrice, 0);

    return {
      floorplanId,
      groups,
      totalPrice,
    };
  }

  /**
   * Delete a BOM entry and all its placements
   * Cascade delete handles children
   */
  async deleteBomEntry(bomEntryId: number): Promise<void> {
    await bomEntryRepository.delete(bomEntryId);
  }

  /**
   * Update BOM snapshots from current catalog data
   * Returns change report
   */
  async updateFromCatalog(floorplanId: number): Promise<ChangeReport> {
    const entries = await bomEntryRepository.findByFloorplan(floorplanId);
    const report: ChangeReport = {
      updated: [],
      invalid: [],
      totalBefore: 0,
      totalAfter: 0,
    };

    let totalBefore = 0;
    let totalAfter = 0;

    for (const entry of entries) {
      // Calculate contribution to total (main entries only)
      if (entry.parent_bom_entry_id === null) {
        const qty = await bomEntryRepository.getPlacementCount(entry.id);
        totalBefore += entry.price_snapshot * qty;
      }

      // Get current variant data
      const variant = await itemVariantRepository.findById(entry.variant_id);
      const item = variant ? await itemRepository.findById(variant.item_id) : null;

      if (!variant || !item || !variant.is_active) {
        // Mark as invalid
        report.invalid.push({
          entryId: entry.id,
          name: entry.name_snapshot,
          reason: variant ? 'Item/variant inactive' : 'Variant not found in catalog',
        });
        continue;
      }

      // Check if price changed
      if (variant.price !== entry.price_snapshot) {
        const oldPrice = entry.price_snapshot;
        const newPrice = variant.price;
        
        // Update snapshot
        await bomEntryRepository.update(entry.id, {
          name_snapshot: item.name,
          model_number_snapshot: item.base_model_number || `${variant.style_name}`,
          price_snapshot: variant.price,
          picture_path: variant.image_path,
        });

        report.updated.push({
          entryId: entry.id,
          name: entry.name_snapshot,
          oldPrice,
          newPrice,
        });
      }
    }

    // Recalculate totals after updates
    for (const entry of entries) {
      if (entry.parent_bom_entry_id === null) {
        const qty = await bomEntryRepository.getPlacementCount(entry.id);
        totalAfter += entry.price_snapshot * qty;
      }
    }

    report.totalBefore = totalBefore;
    report.totalAfter = totalAfter;

    return report;
  }
}

export const bomService = new BomService();
