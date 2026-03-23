import { bomEntryRepository } from '../repositories/bom-entry.ts';
import { placementRepository } from '../repositories/placement.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { itemRepository } from '../repositories/item.ts';
import { variantAddonRepository } from '../repositories/variant-addon.ts';
import { fileStorageService } from './file-storage.ts';
import type { ProjectBom } from '../models/index.ts';

export interface BomGroup {
  mainEntry: ProjectBom;
  children: ProjectBom[];
  quantity: number;
  totalPrice: number;
  bomEntryIds: number[]; // All BOM entry IDs in this group (for edit modal matching)
  isAvailable: boolean; // Whether the item/variant still exists in catalog
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
   * Helper method to copy variant/addon image to project folder
   */
  private async copyImageToProject(
    projectId: number,
    bomEntryId: number,
    sourceImagePath: string | null | undefined
  ): Promise<string | null> {
    if (!sourceImagePath) {
      return null;
    }

    try {
      const fileName = sourceImagePath.split('/').pop() || 'image.jpg';
      const newFileName = `${bomEntryId}-${fileName}`;
      const destSubdir = `projects/${projectId}/bom-images`;
      
      const newPath = await fileStorageService.copyFile(
        sourceImagePath,
        destSubdir,
        newFileName
      );
      
      return newPath;
    } catch (error) {
      console.error('Failed to copy image to project folder:', error);
      // Fallback to original path if copy fails
      return sourceImagePath;
    }
  }

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

    // Create main BOM entry (without image path initially)
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
      picture_path: null, // Will update after copying image
    });

    // Copy variant image to project folder and update entry
    const copiedImagePath = await this.copyImageToProject(
      projectId,
      mainEntry.id,
      variant.image_path
    );
    
    if (copiedImagePath) {
      await bomEntryRepository.update(mainEntry.id, {
        picture_path: copiedImagePath
      });
      mainEntry.picture_path = copiedImagePath;
    }

    // Create required addon children (only active required addons)
    const allAddons = await variantAddonRepository.findByVariantId(variantId);
    console.log(`Found ${allAddons.length} addons for variant ${variantId}`);
    const requiredAddons = allAddons.filter(addon => 
      addon.is_required && 
      addon.addon_variant?.is_active
    );
    console.log(`Found ${requiredAddons.length} active required addons`);
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

      // Create addon entry (without image path initially)
      const addonEntry = await bomEntryRepository.create({
        project_id: projectId,
        floorplan_id: floorplanId,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_id: mainEntry.id,
        item_name: addonItem.name,
        style_name: addon.addon_variant.style_name,
        model_number: addonItem.base_model_number || '',
        unit_price: addon.addon_variant.price,
        picture_path: null, // Will update after copying image
      });

      // Copy addon image to project folder and update entry
      const addonCopiedPath = await this.copyImageToProject(
        projectId,
        addonEntry.id,
        addon.addon_variant.image_path
      );
      
      if (addonCopiedPath) {
        await bomEntryRepository.update(addonEntry.id, {
          picture_path: addonCopiedPath
        });
      }
      
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

    // Copy new variant image to project folder
    const copiedImagePath = await this.copyImageToProject(
      entry.project_id,
      bomEntryId,
      newVariant.image_path
    );

    // Update main entry with new variant and snapshots
    const updated = await bomEntryRepository.update(bomEntryId, {
      variant_id: newVariantId,
      item_name: item.name,
      style_name: newVariant.style_name,
      model_number: item.base_model_number || `${newVariant.style_name}`,
      unit_price: newVariant.price,
      picture_path: copiedImagePath,
    });

    if (!updated) {
      throw new Error('Failed to update BOM entry');
    }

    // Delete old addon children
    const oldChildren = await bomEntryRepository.findChildren(bomEntryId);
    for (const child of oldChildren) {
      await bomEntryRepository.delete(child.id);
    }

    // Create new addon children for new variant (only active required addons)
    const allAddons = await variantAddonRepository.findByVariantId(newVariantId);
    const requiredAddons = allAddons.filter(addon => 
      addon.is_required && 
      addon.addon_variant?.is_active
    );
    for (const addon of requiredAddons) {
      if (!addon.addon_variant) continue;

      const addonItem = await itemRepository.findById(addon.addon_variant.item_id);
      if (!addonItem) continue;

      // Create addon entry (without image path initially)
      const addonEntry = await bomEntryRepository.create({
        project_id: entry.project_id,
        floorplan_id: entry.floorplan_id,
        item_id: addon.addon_variant.item_id,
        variant_id: addon.addon_variant_id,
        parent_bom_id: bomEntryId,
        item_name: addonItem.name,
        style_name: addon.addon_variant.style_name,
        model_number: addonItem.base_model_number || '',
        unit_price: addon.addon_variant.price,
        picture_path: null, // Will update after copying image
      });

      // Copy addon image to project folder and update entry
      const addonCopiedPath = await this.copyImageToProject(
        entry.project_id,
        addonEntry.id,
        addon.addon_variant.image_path
      );
      
      if (addonCopiedPath) {
        await bomEntryRepository.update(addonEntry.id, {
          picture_path: addonCopiedPath
        });
      }
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

    // ALWAYS create a new BOM entry for this specific placement configuration
    // Don't reuse existing entries - each placement gets its own BOM entry
    // This allows different placements of the same variant to have different addons
    const newMainEntry = await bomEntryRepository.create({
      project_id: floorplan.project_id,
      floorplan_id: floorplanId,
      item_id: newVariant.item_id,
      variant_id: newVariantId,
      parent_bom_id: null,
      item_name: item.name,
      style_name: newVariant.style_name,
      model_number: item.base_model_number || `${newVariant.style_name}`,
      unit_price: newVariant.price,
      picture_path: null, // Will update after copying image
    });

    // Copy variant image to project folder and update entry
    const copiedImagePath = await this.copyImageToProject(
      floorplan.project_id,
      newMainEntry.id,
      newVariant.image_path
    );
    
    if (copiedImagePath) {
      await bomEntryRepository.update(newMainEntry.id, {
        picture_path: copiedImagePath
      });
      newMainEntry.picture_path = copiedImagePath;
    }

    // Create all selected addons for this new entry
    for (const addonVariantId of selectedAddonIds) {
      const addonVariant = await itemVariantRepository.findById(addonVariantId);
      if (!addonVariant) continue;

      const addonItem = await itemRepository.findById(addonVariant.item_id);
      if (!addonItem) continue;

      // Create addon entry (without image path initially)
      const addonEntry = await bomEntryRepository.create({
        project_id: floorplan.project_id,
        floorplan_id: floorplanId,
        item_id: addonVariant.item_id,
        variant_id: addonVariantId,
        parent_bom_id: newMainEntry.id,
        item_name: addonItem.name,
        style_name: addonVariant.style_name,
        model_number: addonItem.base_model_number || '',
        unit_price: addonVariant.price,
        picture_path: null, // Will update after copying image
      });

      // Copy addon image to project folder and update entry
      const addonCopiedPath = await this.copyImageToProject(
        floorplan.project_id,
        addonEntry.id,
        addonVariant.image_path
      );
      
      if (addonCopiedPath) {
        await bomEntryRepository.update(addonEntry.id, {
          picture_path: addonCopiedPath
        });
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
   * Groups by variant + addon configuration (not by individual BOM entry)
   */
  async getBomForFloorplan(floorplanId: number): Promise<FloorplanBom> {
    // Get all BOM entries for floorplan
    const allEntries = await bomEntryRepository.findByFloorplan(floorplanId);
    
    // Separate main entries and children
    const mainEntries = allEntries.filter(e => e.parent_bom_id === null);
    const childEntries = allEntries.filter(e => e.parent_bom_id !== null);

    // Group by variant + addon configuration
    const groupMap = new Map<string, {
      mainEntry: ProjectBom;
      children: ProjectBom[];
      quantity: number;
      bomEntryIds: number[];
      isAvailable: boolean;
    }>();
    
    for (const mainEntry of mainEntries) {
      // Get children (addons) for this entry
      const children = childEntries.filter(c => c.parent_bom_id === mainEntry.id);
      
      // Get placement count (quantity)
      const quantity = await bomEntryRepository.getPlacementCount(mainEntry.id);
      
      // Check if item/variant is still available in catalog
      let isAvailable = true;
      if (mainEntry.item_id && mainEntry.variant_id) {
        const item = await itemRepository.findById(mainEntry.item_id);
        // Convert is_active to boolean (SQLite returns 0/1)
        const itemIsActive = item ? Boolean(item.is_active) : false;
        if (!item || !itemIsActive) {
          isAvailable = false;
        } else {
          const variant = await itemVariantRepository.findById(mainEntry.variant_id);
          // Variant repository already converts is_active to boolean
          if (!variant || !variant.is_active) {
            isAvailable = false;
          }
        }
      } else {
        // No item_id or variant_id means item was deleted
        isAvailable = false;
      }
      
      // Check availability for each child addon
      for (const child of children) {
        let childIsAvailable = true;
        if (child.item_id && child.variant_id) {
          const childItem = await itemRepository.findById(child.item_id);
          const childItemIsActive = childItem ? Boolean(childItem.is_active) : false;
          if (!childItem || !childItemIsActive) {
            childIsAvailable = false;
          } else {
            const childVariant = await itemVariantRepository.findById(child.variant_id);
            if (!childVariant || !childVariant.is_active) {
              childIsAvailable = false;
            }
          }
        } else {
          childIsAvailable = false;
        }
        // Add is_available property to child
        (child as ProjectBom).is_available = childIsAvailable;
      }
      
      // Create a unique key based on variant + sorted addon variant IDs
      // This groups identical configurations together
      const addonVariantIds = children.map(c => c.variant_id).sort().join(',');
      const groupKey = `${mainEntry.variant_id}:${addonVariantIds}`;
      
      if (groupMap.has(groupKey)) {
        // Merge with existing group
        const existing = groupMap.get(groupKey)!;
        existing.quantity += quantity;
        existing.bomEntryIds.push(mainEntry.id);
      } else {
        // Create new group
        groupMap.set(groupKey, {
          mainEntry,
          children,
          quantity,
          bomEntryIds: [mainEntry.id],
          isAvailable,
        });
      }
    }

    // Convert map to groups array
    const groups: BomGroup[] = Array.from(groupMap.values()).map(({ mainEntry, children, quantity, bomEntryIds, isAvailable }) => {
      const mainTotal = mainEntry.unit_price * quantity;
      const childrenTotal = children.reduce((sum, child) => sum + child.unit_price, 0) * quantity;
      const totalPrice = mainTotal + childrenTotal;
      
      return {
        mainEntry,
        children,
        quantity,
        totalPrice,
        bomEntryIds,
        isAvailable,
      };
    });

    // Calculate floorplan total from groups (already includes main + children)
    const totalPrice = groups.reduce((sum, group) => sum + group.totalPrice, 0);
    
    // Debug: log calculation details
    console.log(`Floorplan ${floorplanId} BOM calculation:`);
    groups.forEach((group, i) => {
      console.log(`  Group ${i}: ${group.mainEntry.item_name} x${group.quantity} = $${group.totalPrice} (main: $${group.mainEntry.unit_price}, children: ${group.children.length})`);
      group.children.forEach(child => {
        console.log(`    - ${child.item_name}: $${child.unit_price}`);
      });
    });
    console.log(`  Total: $${totalPrice}`);

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
   * Cascade delete handles children, also cleans up copied images
   */
  async deleteBomEntry(bomEntryId: number): Promise<void> {
    // Get the entry and its children before deleting
    const entry = await bomEntryRepository.findById(bomEntryId);
    if (!entry) {
      return; // Already deleted or doesn't exist
    }
    
    const children = await bomEntryRepository.findChildren(bomEntryId);
    const allEntries = [entry, ...children];
    
    // Collect all picture paths that need cleanup
    const picturePathsToCheck: string[] = [];
    for (const e of allEntries) {
      if (e.picture_path && e.picture_path.startsWith('projects/')) {
        picturePathsToCheck.push(e.picture_path);
      }
    }
    
    // Delete the BOM entries (this also cascades to placements)
    await bomEntryRepository.delete(bomEntryId);
    
    // Clean up images that are no longer referenced
    for (const picturePath of picturePathsToCheck) {
      try {
        // Check if any other BOM entries still use this image
        const otherEntries = await bomEntryRepository.findByPicturePath(picturePath);
        if (otherEntries.length === 0) {
          // Safe to delete the image file
          await fileStorageService.deleteFile(picturePath);
          console.log(`Cleaned up unused image: ${picturePath}`);
        }
      } catch (error) {
        console.error(`Failed to clean up image ${picturePath}:`, error);
        // Continue with other images even if one fails
      }
    }
  }

  /**
   * Duplicate a BOM entry with all its children
   * Creates a complete copy of the BOM hierarchy (main entry + addons)
   */
  async duplicateBomEntry(bomEntryId: number): Promise<ProjectBom> {
    // Get the original main entry
    const originalEntry = await bomEntryRepository.findById(bomEntryId);
    if (!originalEntry) {
      throw new Error('BOM entry not found');
    }

    // Get all children (addons) of the original entry
    const originalChildren = await bomEntryRepository.findChildren(bomEntryId);

    // Create new main BOM entry (copy of original)
    const newMainEntry = await bomEntryRepository.create({
      project_id: originalEntry.project_id,
      floorplan_id: originalEntry.floorplan_id,
      item_id: originalEntry.item_id,
      variant_id: originalEntry.variant_id,
      parent_bom_id: null,
      item_name: originalEntry.item_name,
      style_name: originalEntry.style_name,
      model_number: originalEntry.model_number || '',
      unit_price: originalEntry.unit_price,
      picture_path: null, // Will update after copying image
    });

    // Copy main entry image to project folder
    if (originalEntry.picture_path) {
      const copiedImagePath = await this.copyImageToProject(
        originalEntry.project_id,
        newMainEntry.id,
        originalEntry.picture_path
      );
      if (copiedImagePath) {
        await bomEntryRepository.update(newMainEntry.id, {
          picture_path: copiedImagePath
        });
        newMainEntry.picture_path = copiedImagePath;
      }
    }

    // Create child entries for each addon
    for (const originalChild of originalChildren) {
      const newChildEntry = await bomEntryRepository.create({
        project_id: originalChild.project_id,
        floorplan_id: originalChild.floorplan_id,
        item_id: originalChild.item_id,
        variant_id: originalChild.variant_id,
        parent_bom_id: newMainEntry.id,
        item_name: originalChild.item_name,
        style_name: originalChild.style_name,
        model_number: originalChild.model_number || '',
        unit_price: originalChild.unit_price,
        picture_path: null, // Will update after copying image
      });

      // Copy addon image to project folder
      if (originalChild.picture_path) {
        const copiedChildImagePath = await this.copyImageToProject(
          originalChild.project_id,
          newChildEntry.id,
          originalChild.picture_path
        );
        if (copiedChildImagePath) {
          await bomEntryRepository.update(newChildEntry.id, {
            picture_path: copiedChildImagePath
          });
        }
      }
    }

    return newMainEntry;
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

        // Copy image to project folder (not raw catalog path)
        const newPicturePath = variant.image_path
          ? await this.copyImageToProject(entry.project_id, entry.id, variant.image_path)
          : entry.picture_path;

        // Update snapshot
        await bomEntryRepository.update(entry.id, {
          item_name: item.name,
          style_name: variant.style_name,
          model_number: item.base_model_number || `${variant.style_name}`,
          unit_price: variant.price,
          picture_path: newPicturePath,
        });

        // Update in-memory entry so totalAfter calculation uses new price
        entry.unit_price = variant.price;

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
