import { bomEntryRepository } from '../repositories/bom-entry.ts';
import { placementRepository } from '../repositories/placement.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { itemRepository } from '../repositories/item.ts';
import { variantAddonRepository } from '../repositories/variant-addon.ts';
import type { ProjectBom, CreateBomEntryDTO } from '../models/index.ts';

export interface BomGroup {
  mainEntry: ProjectBom;
  children: ProjectBom[];
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
    projectId: number,
    floorplanId: number,
    variantId: number
  ): Promise<ProjectBom> {
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
      project_id: projectId,
      floorplan_id: floorplanId,
      item_id: variant.item_id,
      variant_id: variantId,
      parent_bom_id: null,
      item_name: item.name,
      style_name: variant.style_name,
      model_number: item.base_model_number || `${variant.style_name}`,
      unit_price: variant.price,
      picture_path: variant.image_path,
    });

    // Create required addon children (only required addons)
    const allAddons = await variantAddonRepository.findByVariantId(variantId);
    console.log(`Found ${allAddons.length} addons for variant ${variantId}`);
    const requiredAddons = allAddons.filter(addon => addon.is_required);
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
        project_id: projectId,
        floorplan_id: floorplanId,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_id: mainEntry.id,
        item_name: addonItem.name,
        style_name: addon.addon_variant.style_name,
        model_number: addonItem.base_model_number || '',
        unit_price: addon.addon_variant.price,
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
  ): Promise<ProjectBom> {
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
      item_name: item.name,
      style_name: newVariant.style_name,
      model_number: item.base_model_number || `${newVariant.style_name}`,
      unit_price: newVariant.price,
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
        project_id: entry.project_id,
        floorplan_id: entry.floorplan_id,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_id: bomEntryId,
        item_name: addonItem.name,
        style_name: addon.addon_variant.style_name,
        model_number: addonItem.base_model_number || '',
        unit_price: addon.addon_variant.price,
        picture_path: addon.addon_variant.image_path,
      });
    }

    return updated;
  }

  /**
   * Recreate BOM entry for a placement with new variant and selected addons
   * Deletes old entry and creates fresh one - cleanest approach
   */
  async recreateBomEntry(
    placementId: number,
    newVariantId: number,
    selectedAddonIds: number[]
  ): Promise<ProjectBom> {
    // Get placement details
    const placement = await placementRepository.findById(placementId);
    if (!placement) {
      throw new Error('Placement not found');
    }

    const oldBomId = placement.bom_id;
    const floorplanId = placement.floorplan_id;

    // Get floorplan to find project_id
    const floorplan = await floorplanRepository.findById(floorplanId);
    if (!floorplan) {
      throw new Error('Floorplan not found');
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

    // Check if a BOM entry already exists for this variant on this floorplan
    let newMainEntry = await bomEntryRepository.findByVariantAddons(floorplanId, newVariantId, null);
    
    if (!newMainEntry) {
      // Create new main BOM entry only if one doesn't exist
      newMainEntry = await bomEntryRepository.create({
        project_id: floorplan.project_id,
        floorplan_id: floorplanId,
        item_id: newVariant.item_id,
        variant_id: newVariantId,
        parent_bom_id: null,
        item_name: item.name,
        style_name: newVariant.style_name,
        model_number: item.base_model_number || `${newVariant.style_name}`,
        unit_price: newVariant.price,
        picture_path: newVariant.image_path,
      });
    }

    // Ensure all selected addons exist (create if missing)
    // AND remove addons that are no longer selected
    if (selectedAddonIds.length > 0 || true) { // Always run this to handle removals too
      // Get existing children
      const existingChildren = await bomEntryRepository.findChildren(newMainEntry.id);
      const existingChildVariantIds = new Set(existingChildren.map(c => c.variant_id));
      const selectedAddonIdsSet = new Set(selectedAddonIds);
      
      // Add missing addons
      for (const addonVariantId of selectedAddonIds) {
        if (existingChildVariantIds.has(addonVariantId)) continue;
        
        const addonVariant = await itemVariantRepository.findById(addonVariantId);
        if (!addonVariant) continue;

        const addonItem = await itemRepository.findById(addonVariant.item_id);
        if (!addonItem) continue;

        await bomEntryRepository.create({
          project_id: floorplan.project_id,
          floorplan_id: floorplanId,
          item_id: addonVariant.item_id,
          variant_id: addonVariantId,
          parent_bom_id: newMainEntry.id,
          item_name: addonItem.name,
          style_name: addonVariant.style_name,
          model_number: addonItem.base_model_number || '',
          unit_price: addonVariant.price,
          picture_path: addonVariant.image_path,
        });
      }
      
      // Remove addons that are no longer selected
      for (const child of existingChildren) {
        if (!selectedAddonIdsSet.has(child.variant_id)) {
          await bomEntryRepository.delete(child.id);
        }
      }
    }

    // Update placement to reference the BOM entry (new or existing)
    await placementRepository.update(placementId, { bom_id: newMainEntry.id });

    // Delete old BOM entry only if no other placements reference it
    const remainingPlacements = await placementRepository.findByBomId(oldBomId);
    if (remainingPlacements.length === 0) {
      await bomEntryRepository.delete(oldBomId);
    }

    return newMainEntry;
  }

  /**
   * Get full BOM for a floorplan with hierarchical structure
   */
  async getBomForFloorplan(floorplanId: number): Promise<FloorplanBom> {
    // Get all BOM entries for floorplan
    const allEntries = await bomEntryRepository.findByFloorplan(floorplanId);
    
    // Separate main entries and children
    const mainEntries = allEntries.filter(e => e.parent_bom_id === null);
    const childEntries = allEntries.filter(e => e.parent_bom_id !== null);

    // Build groups
    const groups: BomGroup[] = [];
    
    for (const mainEntry of mainEntries) {
      // Get children for this entry
      const children = childEntries.filter(c => c.parent_bom_id === mainEntry.id);
      
      // Get placement count (quantity)
      const quantity = await bomEntryRepository.getPlacementCount(mainEntry.id);
      
      // Calculate total price for group
      const mainTotal = mainEntry.unit_price * quantity;
      const childrenTotal = children.reduce((sum, child) => sum + child.unit_price, 0) * quantity;
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
   * Get total price for entire project (all floorplans)
   */
  async getProjectTotal(projectId: number): Promise<{ totalPrice: number }> {
    // Get all floorplans for project
    const floorplans = await floorplanRepository.findByProject(projectId);
    
    // Sum up totals from all floorplans
    let totalPrice = 0;
    for (const floorplan of floorplans) {
      const floorplanBom = await this.getBomForFloorplan(floorplan.id);
      totalPrice += floorplanBom.totalPrice;
    }
    
    return { totalPrice };
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
      if (entry.parent_bom_id === null) {
        const qty = await bomEntryRepository.getPlacementCount(entry.id);
        totalBefore += entry.unit_price * qty;
      }

      // Get current variant data
      const variant = await itemVariantRepository.findById(entry.variant_id);
      const item = variant ? await itemRepository.findById(variant.item_id) : null;

      if (!variant || !item || !variant.is_active) {
        // Mark as invalid
        report.invalid.push({
          entryId: entry.id,
          name: entry.item_name,
          reason: variant ? 'Item/variant inactive' : 'Variant not found in catalog',
        });
        continue;
      }

      // Check if price changed
      if (variant.price !== entry.unit_price) {
        const oldPrice = entry.unit_price;
        const newPrice = variant.price;
        
        // Update snapshot
        await bomEntryRepository.update(entry.id, {
          item_name: item.name,
          style_name: variant.style_name,
          model_number: item.base_model_number || `${variant.style_name}`,
          unit_price: variant.price,
          picture_path: variant.image_path,
        });

        report.updated.push({
          entryId: entry.id,
          name: entry.item_name,
          oldPrice,
          newPrice,
        });
      }
    }

    // Recalculate totals after updates
    for (const entry of entries) {
      if (entry.parent_bom_id === null) {
        const qty = await bomEntryRepository.getPlacementCount(entry.id);
        totalAfter += entry.unit_price * qty;
      }
    }

    report.totalBefore = totalBefore;
    report.totalAfter = totalAfter;

    return report;
  }
}

export const bomService = new BomService();
