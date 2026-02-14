import { getDb } from '../config/database.ts';
import type { ItemAddon, CreateItemAddonDTO, Item } from '../models/index.ts';

/**
 * Item Add-On Repository
 * Handles all database operations for item add-on relationships
 */
export class ItemAddonRepository {
  async findByParentItemId(parentItemId: number): Promise<ItemAddon[]> {
    const result = getDb().queryEntries(`
      SELECT 
        ia.id, ia.parent_item_id, ia.addon_item_id, ia.slot_number, 
        ia.is_required, ia.sort_order, ia.created_at,
        i.id as addon_item_id, i.name as addon_item_name, 
        i.base_model_number as addon_item_model, i.description as addon_item_description
      FROM item_addons ia
      JOIN items i ON ia.addon_item_id = i.id
      WHERE ia.parent_item_id = ?
      ORDER BY ia.slot_number ASC, ia.sort_order ASC, ia.id ASC
    `, [parentItemId]);

    return result.map(row => ({
      id: row.id,
      parent_item_id: row.parent_item_id,
      addon_item_id: row.addon_item_id,
      slot_number: row.slot_number,
      is_required: Boolean(row.is_required),
      sort_order: row.sort_order,
      created_at: row.created_at,
      addon_item: {
        id: row.addon_item_id,
        name: row.addon_item_name,
        base_model_number: row.addon_item_model,
        description: row.addon_item_description,
      } as Item,
    })) as ItemAddon[];
  }

  async findById(id: number): Promise<ItemAddon | null> {
    const result = getDb().queryEntries(`
      SELECT id, parent_item_id, addon_item_id, slot_number, is_required, sort_order, created_at
      FROM item_addons
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as ItemAddon) : null;
  }

  async findByParentAndSlot(parentItemId: number, slotNumber: number): Promise<ItemAddon[]> {
    const result = getDb().queryEntries(`
      SELECT 
        ia.id, ia.parent_item_id, ia.addon_item_id, ia.slot_number, 
        ia.is_required, ia.sort_order, ia.created_at,
        i.id as addon_item_id, i.name as addon_item_name, 
        i.base_model_number as addon_item_model, i.description as addon_item_description
      FROM item_addons ia
      JOIN items i ON ia.addon_item_id = i.id
      WHERE ia.parent_item_id = ? AND ia.slot_number = ?
      ORDER BY ia.sort_order ASC, ia.id ASC
    `, [parentItemId, slotNumber]);

    return result.map(row => ({
      id: row.id,
      parent_item_id: row.parent_item_id,
      addon_item_id: row.addon_item_id,
      slot_number: row.slot_number,
      is_required: Boolean(row.is_required),
      sort_order: row.sort_order,
      created_at: row.created_at,
      addon_item: {
        id: row.addon_item_id,
        name: row.addon_item_name,
        base_model_number: row.addon_item_model,
        description: row.addon_item_description,
      } as Item,
    })) as ItemAddon[];
  }

  async create(data: CreateItemAddonDTO): Promise<ItemAddon> {
    const result = getDb().queryEntries(`
      INSERT INTO item_addons (parent_item_id, addon_item_id, slot_number, is_required, sort_order)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, parent_item_id, addon_item_id, slot_number, is_required, sort_order, created_at
    `, [
      data.parent_item_id,
      data.addon_item_id,
      data.slot_number,
      data.is_required ?? false,
      data.sort_order ?? 0,
    ]);

    return result[0] as unknown as ItemAddon;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM item_addons WHERE id = ?`, [id]);
  }

  async deleteByParentItemId(parentItemId: number): Promise<void> {
    getDb().query(`DELETE FROM item_addons WHERE parent_item_id = ?`, [parentItemId]);
  }

  async deleteByParentAndSlot(parentItemId: number, slotNumber: number): Promise<void> {
    getDb().query(`DELETE FROM item_addons WHERE parent_item_id = ? AND slot_number = ?`, [parentItemId, slotNumber]);
  }

  async getRequiredAddons(parentItemId: number): Promise<ItemAddon[]> {
    const result = getDb().queryEntries(`
      SELECT 
        ia.id, ia.parent_item_id, ia.addon_item_id, ia.slot_number, 
        ia.is_required, ia.sort_order, ia.created_at,
        i.id as addon_item_id, i.name as addon_item_name, 
        i.base_model_number as addon_item_model, i.description as addon_item_description
      FROM item_addons ia
      JOIN items i ON ia.addon_item_id = i.id
      WHERE ia.parent_item_id = ? AND ia.is_required = 1 AND ia.slot_number IN (1, 2)
      ORDER BY ia.slot_number ASC, ia.sort_order ASC
    `, [parentItemId]);

    return result.map(row => ({
      id: row.id,
      parent_item_id: row.parent_item_id,
      addon_item_id: row.addon_item_id,
      slot_number: row.slot_number,
      is_required: true,
      sort_order: row.sort_order,
      created_at: row.created_at,
      addon_item: {
        id: row.addon_item_id,
        name: row.addon_item_name,
        base_model_number: row.addon_item_model,
        description: row.addon_item_description,
      } as Item,
    })) as ItemAddon[];
  }

  async getOptionalAddons(parentItemId: number): Promise<ItemAddon[]> {
    const result = getDb().queryEntries(`
      SELECT 
        ia.id, ia.parent_item_id, ia.addon_item_id, ia.slot_number, 
        ia.is_required, ia.sort_order, ia.created_at,
        i.id as addon_item_id, i.name as addon_item_name, 
        i.base_model_number as addon_item_model, i.description as addon_item_description
      FROM item_addons ia
      JOIN items i ON ia.addon_item_id = i.id
      WHERE ia.parent_item_id = ? AND (ia.is_required = 0 OR ia.slot_number IN (3, 4))
      ORDER BY ia.slot_number ASC, ia.sort_order ASC
    `, [parentItemId]);

    return result.map(row => ({
      id: row.id,
      parent_item_id: row.parent_item_id,
      addon_item_id: row.addon_item_id,
      slot_number: row.slot_number,
      is_required: Boolean(row.is_required),
      sort_order: row.sort_order,
      created_at: row.created_at,
      addon_item: {
        id: row.addon_item_id,
        name: row.addon_item_name,
        base_model_number: row.addon_item_model,
        description: row.addon_item_description,
      } as Item,
    })) as ItemAddon[];
  }

  async addAddonIfNotExists(
    parentItemId: number,
    addonItemId: number,
    slotNumber: number,
    isRequired: boolean
  ): Promise<ItemAddon> {
    // Check if relationship already exists
    const result = getDb().queryEntries(`
      SELECT id, parent_item_id, addon_item_id, slot_number, is_required, sort_order, created_at
      FROM item_addons
      WHERE parent_item_id = ? AND addon_item_id = ? AND slot_number = ?
    `, [parentItemId, addonItemId, slotNumber]);

    if (result.length > 0) {
      return result[0] as unknown as ItemAddon;
    }

    return this.create({
      parent_item_id: parentItemId,
      addon_item_id: addonItemId,
      slot_number: slotNumber,
      is_required: isRequired,
    });
  }
}

export const itemAddonRepository = new ItemAddonRepository();
