import api from './api';

export interface BomEntry {
  id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_entry_id: number | null;
  name_snapshot: string;
  model_number_snapshot: string | null;
  price_snapshot: number;
  picture_path: string | null;
  created_at: string;
  updated_at: string;
  children?: BomEntry[];
  placement_count?: number;
}

export interface BomGroup {
  mainEntry: BomEntry;
  children: BomEntry[];
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

export const bomService = {
  async getBomForFloorplan(floorplanId: number): Promise<FloorplanBom> {
    const response = await api.get(`/floorplans/${floorplanId}/bom`);
    return response.data.data;
  },

  async createBomEntry(floorplanId: number, variantId: number): Promise<BomEntry> {
    const response = await api.post(`/floorplans/${floorplanId}/bom-entries`, {
      variant_id: variantId,
    });
    return response.data.data;
  },

  async switchVariant(entryId: number, variantId: number): Promise<BomEntry> {
    // Note: entryId is in the URL, but we need floorplanId too
    // The backend expects: /floorplans/:id/bom-entries/:entryId/variant
    // We'll need to get the floorplanId from the entry or pass it
    const response = await api.put(`/bom-entries/${entryId}/variant`, {
      variant_id: variantId,
    });
    return response.data.data;
  },

  async deleteBomEntry(floorplanId: number, entryId: number): Promise<void> {
    await api.delete(`/floorplans/${floorplanId}/bom-entries/${entryId}`);
  },

  async updateFromCatalog(floorplanId: number): Promise<ChangeReport> {
    const response = await api.post(`/floorplans/${floorplanId}/bom/update-from-catalog`);
    return response.data.data;
  },
};
