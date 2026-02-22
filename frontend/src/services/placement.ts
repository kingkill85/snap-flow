import api from './api';
import axios from 'axios';

export interface Placement {
  id: number;
  bom_id: number;
  floorplan_id: number;
  item_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface CreatePlacementDTO {
  floorplan_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UpdatePlacementDTO {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const placementService = {
  async getAll(floorplanId?: number, signal?: AbortSignal): Promise<Placement[]> {
    try {
      const params = floorplanId ? { floorplan_id: floorplanId } : undefined;
      const response = await api.get('/placements', { params, signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) throw error;
      throw error;
    }
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
};

export type { Placement as PlacementType };
