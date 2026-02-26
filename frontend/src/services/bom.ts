import api from './api';

export interface BomEntry {
  id: number;
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id: number | null;
  item_name: string;
  style_name: string | null;
  model_number: string | null;
  unit_price: number;
  picture_path: string | null;
  created_at: string;
  updated_at: string;
  children?: BomEntry[];
  placement_count?: number;
  is_available?: boolean;
}

export interface BomGroup {
  mainEntry: BomEntry;
  children: BomEntry[];
  bomEntryIds?: number[];
  quantity: number;
  totalPrice: number;
  isAvailable: boolean;
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
  async getBomForFloorplan(floorplanId: number, signal?: AbortSignal): Promise<FloorplanBom> {
    const response = await api.get(`/floorplans/${floorplanId}/bom`, { signal });
    return response.data.data;
  },

  async createBomEntry(floorplanId: number, variantId: number, signal?: AbortSignal): Promise<BomEntry> {
    const response = await api.post(`/floorplans/${floorplanId}/bom-entries`, {
      variant_id: variantId,
    }, { signal });
    return response.data.data;
  },

  async switchVariant(entryId: number, variantId: number, signal?: AbortSignal): Promise<BomEntry> {
    const response = await api.put(`/bom-entries/${entryId}/variant`, {
      variant_id: variantId,
    }, { signal });
    return response.data.data;
  },

  async deleteBomEntry(floorplanId: number, entryId: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/floorplans/${floorplanId}/bom-entries/${entryId}`, { signal });
  },

  async updateFromCatalog(floorplanId: number, signal?: AbortSignal): Promise<ChangeReport> {
    const response = await api.post(`/floorplans/${floorplanId}/bom/update-from-catalog`, {}, { signal });
    return response.data.data;
  },

  async getProjectTotal(projectId: number, signal?: AbortSignal): Promise<{ totalPrice: number }> {
    const response = await api.get(`/projects/${projectId}/total`, { signal });
    return response.data.data;
  },
};
