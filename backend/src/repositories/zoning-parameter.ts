import { getDb, withTransaction } from "../config/database.ts";

export interface ZoningParameter {
  id: number;
  item_type_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class ZoningConflictError extends Error {}
export class ZoningValidationError extends Error {}

const nameKey = (name: string) =>
  name.normalize("NFKC").toLocaleLowerCase("und");

export class ZoningParameterRepository {
  findAll(itemTypeId: number, includeInactive = false): ZoningParameter[] {
    const rows = getDb().queryEntries(
      `
      SELECT id, item_type_id, name, sort_order, is_active, created_at, updated_at
      FROM item_type_zoning_parameters
      WHERE item_type_id = ? ${includeInactive ? "" : "AND is_active = 1"}
      ORDER BY sort_order, id
    `,
      [itemTypeId],
    );
    return rows as unknown as ZoningParameter[];
  }

  findById(itemTypeId: number, id: number): ZoningParameter | null {
    const rows = getDb().queryEntries(
      `
      SELECT id, item_type_id, name, sort_order, is_active, created_at, updated_at
      FROM item_type_zoning_parameters WHERE item_type_id = ? AND id = ?
    `,
      [itemTypeId, id],
    );
    return rows.length ? rows[0] as unknown as ZoningParameter : null;
  }

  create(
    itemTypeId: number,
    name: string,
    sortOrder?: number,
  ): ZoningParameter {
    this.assertItemType(itemTypeId);
    const order = sortOrder ?? Number(
      (getDb().queryEntries(
        `
      SELECT COALESCE(MAX(sort_order), 0) + 1 next FROM item_type_zoning_parameters WHERE item_type_id = ?
    `,
        [itemTypeId],
      )[0] as { next: number }).next,
    );
    try {
      const rows = getDb().queryEntries(
        `
        INSERT INTO item_type_zoning_parameters(item_type_id, name, name_key, sort_order)
        VALUES (?, ?, ?, ?) RETURNING id
      `,
        [itemTypeId, name, nameKey(name), order],
      );
      return this.findById(itemTypeId, (rows[0] as { id: number }).id)!;
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new ZoningValidationError(
          "An equivalent parameter name already exists",
        );
      }
      throw error;
    }
  }

  update(
    itemTypeId: number,
    id: number,
    data: { name?: string; sort_order?: number },
  ): ZoningParameter | null {
    const current = this.findById(itemTypeId, id);
    if (!current) return null;
    const name = data.name ?? current.name;
    try {
      getDb().query(
        `UPDATE item_type_zoning_parameters
        SET name = ?, name_key = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE item_type_id = ? AND id = ?`,
        [
          name,
          nameKey(name),
          data.sort_order ?? current.sort_order,
          itemTypeId,
          id,
        ],
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new ZoningValidationError(
          "An equivalent parameter name already exists",
        );
      }
      throw error;
    }
    return this.findById(itemTypeId, id);
  }

  setActive(
    itemTypeId: number,
    id: number,
    active: boolean,
  ): ZoningParameter | null {
    const current = this.findById(itemTypeId, id);
    if (!current) return null;
    try {
      getDb().query(
        `UPDATE item_type_zoning_parameters SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE item_type_id = ? AND id = ?`,
        [active ? 1 : 0, itemTypeId, id],
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new ZoningValidationError(
          "An equivalent active parameter name already exists",
        );
      }
      throw error;
    }
    return this.findById(itemTypeId, id);
  }

  reorder(itemTypeId: number, ids: number[]): ZoningParameter[] {
    withTransaction(() => {
      const existing = this.findAll(itemTypeId, true).map((row) => row.id);
      if (
        ids.length !== existing.length || new Set(ids).size !== ids.length ||
        [...ids].sort((a, b) => a - b).some((id, i) =>
          id !== [...existing].sort((a, b) => a - b)[i]
        )
      ) {
        throw new ZoningValidationError(
          "Order must contain every parameter exactly once",
        );
      }
      ids.forEach((id, index) =>
        getDb().query(
          "UPDATE item_type_zoning_parameters SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE item_type_id = ? AND id = ?",
          [index + 1, itemTypeId, id],
        )
      );
    });
    return this.findAll(itemTypeId, true);
  }

  delete(itemTypeId: number, id: number): boolean {
    if (!this.findById(itemTypeId, id)) return false;
    const used = getDb().queryEntries(
      "SELECT 1 FROM area_zoning_values WHERE parameter_id = ? LIMIT 1",
      [id],
    );
    if (used.length) {
      throw new ZoningConflictError(
        "Parameter is in use; deactivate it instead",
      );
    }
    getDb().query(
      "DELETE FROM item_type_zoning_parameters WHERE item_type_id = ? AND id = ?",
      [itemTypeId, id],
    );
    return true;
  }

  private assertItemType(id: number): void {
    if (
      !getDb().queryEntries("SELECT 1 FROM item_types WHERE id = ?", [id])
        .length
    ) {
      throw new ZoningValidationError("Product Type not found");
    }
  }
}

export const zoningParameterRepository = new ZoningParameterRepository();
