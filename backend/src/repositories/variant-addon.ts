import { getDb } from '../config/database.ts';
import type { VariantAddon, CreateVariantAddonDTO, ItemVariant } from '../models/index.ts';

/**
 * Variant Add-On Repository
 * Handles all database operations for variant add-ons (add-ons per variant, not per item)
 */
export class VariantAddonRepository {
  async findByVariantId(variantId: number): Promise<VariantAddon[]> {
    const result = getDb().queryEntries(`
      SELECT 
        va.id, va.variant_id, va.addon_variant_id, va.is_optional, va.sort_order, va.created_at,
        iv.item_id as addon_item_id, iv.style_name as addon_style_name, iv.price as addon_price, iv.image_path as addon_image_path,
        i.name as addon_item_name, i.base_model_number as addon_model_number
      FROM variant_addons va
      JOIN item_variants iv ON va.addon_variant_id = iv.id
      JOIN items i ON iv.item_id = i.id
      WHERE va.variant_id = ?
      ORDER BY va.sort_order ASC, va.id ASC
    `, [variantId]);

    return result.map(row => ({
      id: row.id,
      variant_id: row.variant_id,
      addon_variant_id: row.addon_variant_id,
      is_required: !(row.is_optional === 1 || row.is_optional === true), // Convert is_optional to is_required
      sort_order: row.sort_order,
      created_at: row.created_at,
      addon_variant: {
        id: row.addon_variant_id,
        item_id: row.addon_item_id,
        item_name: row.addon_item_name,
        style_name: row.addon_style_name,
        price: row.addon_price,
        image_path: row.addon_image_path,
        sort_order: 0,
        created_at: row.created_at,
        is_active: true,
      } as ItemVariant,
    })) as VariantAddon[];
  }

  async findById(id: number): Promise<VariantAddon | null> {
    const result = getDb().queryEntries(`
      SELECT id, variant_id, addon_variant_id, is_optional, sort_order, created_at
      FROM variant_addons
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as VariantAddon) : null;
  }

  async create(data: CreateVariantAddonDTO): Promise<VariantAddon> {
    const result = getDb().queryEntries(`
      INSERT INTO variant_addons (variant_id, addon_variant_id, is_optional, sort_order)
      VALUES (?, ?, ?, ?)
      RETURNING id, variant_id, addon_variant_id, is_optional, sort_order, created_at
    `, [
      data.variant_id,
      data.addon_variant_id,
      !(data.is_required ?? false), // Convert is_required to is_optional for database
      data.sort_order || 0,
    ]);

    const row = result[0];
    return {
      id: row.id,
      variant_id: row.variant_id,
      addon_variant_id: row.addon_variant_id,
      is_required: !(row.is_optional === 1 || row.is_optional === true),
      sort_order: row.sort_order,
      created_at: row.created_at,
    } as VariantAddon;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM variant_addons WHERE id = ?`, [id]);
  }

  async deleteByVariantId(variantId: number): Promise<void> {
    getDb().query(`DELETE FROM variant_addons WHERE variant_id = ?`, [variantId]);
  }

  async deleteByAddonVariantId(addonVariantId: number): Promise<void> {
    getDb().query(`DELETE FROM variant_addons WHERE addon_variant_id = ?`, [addonVariantId]);
  }

  async addAddonIfNotExists(
    variantId: number,
    addonVariantId: number,
    isOptional: boolean
  ): Promise<VariantAddon> {
    // Check if relationship already exists
    const result = getDb().queryEntries(`
      SELECT id, variant_id, addon_variant_id, is_optional, sort_order, created_at
      FROM variant_addons
      WHERE variant_id = ? AND addon_variant_id = ?
    `, [variantId, addonVariantId]);

    if (result.length > 0) {
      return result[0] as unknown as VariantAddon;
    }

    return this.create({
      variant_id: variantId,
      addon_variant_id: addonVariantId,
      is_required: !isOptional,
    });
  }
}

export const variantAddonRepository = new VariantAddonRepository();
