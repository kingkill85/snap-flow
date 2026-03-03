import api from './api';

export interface Placement {
  id: number;
  bom_id: number;
  floorplan_id: number;
  item_id: number;
  item_variant_id: number;
  item_variant_image_path?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;  // Rotation in degrees (0-360)
  created_at: string;
}

export interface CreatePlacementDTO {
  floorplan_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;  // Optional, defaults to 0
}

export interface UpdatePlacementDTO {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export const placementService = {
  async getAll(floorplanId?: number, signal?: AbortSignal): Promise<Placement[]> {
    const params = floorplanId ? { floorplan_id: floorplanId } : undefined;
    const response = await api.get('/placements', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<Placement> {
    const response = await api.get(`/placements/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreatePlacementDTO, signal?: AbortSignal): Promise<Placement> {
    const response = await api.post('/placements', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdatePlacementDTO, signal?: AbortSignal): Promise<Placement> {
    const response = await api.put(`/placements/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/placements/${id}`, { signal });
  },

  async switchVariant(id: number, variantId: number, signal?: AbortSignal): Promise<{ placement: Placement; bomEntry: import('./bom').BomEntry }> {
    const response = await api.put(`/placements/${id}/variant`, { variant_id: variantId }, { signal });
    return response.data.data;
  },

  async updateBom(id: number, variantId: number, addonIds: number[], signal?: AbortSignal): Promise<{ placement: Placement; bomEntry: import('./bom').BomEntry }> {
    const response = await api.post(`/placements/${id}/update-bom`, { variant_id: variantId, addon_ids: addonIds }, { signal });
    return response.data.data;
  },

  async updateDimensions(
    floorplanId: number,
    itemId: number,
    width: number,
    height: number,
    signal?: AbortSignal
  ): Promise<void> {
    await api.post('/placements/bulk-update', { width, height }, {
      params: { floorplan_id: floorplanId, item_id: itemId },
      signal,
    });
  },

  async duplicate(id: number, x: number, y: number, signal?: AbortSignal): Promise<Placement> {
    const response = await api.post(`/placements/${id}/duplicate`, { x, y }, { signal });
    return response.data.data;
  },
};
