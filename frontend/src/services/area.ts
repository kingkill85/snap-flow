import api from './api';

export interface AreaVertex {
  id: number;
  placement_id: number;
  vertex_index: number;
  x: number;
  y: number;
}

export interface Area {
  id: number;
  floorplan_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color: string;
  opacity: number;
  vertices: AreaVertex[];
  device_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAreaDTO {
  floorplan_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color?: string;
  opacity?: number;
}

export interface UpdateAreaDTO {
  name?: string;
  color?: string;
  opacity?: number;
}

export const areaService = {
  async getByFloorplan(floorplanId: number, signal?: AbortSignal): Promise<Area[]> {
    const response = await api.get('/areas', { params: { floorplan_id: floorplanId }, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<Area> {
    const response = await api.get(`/areas/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateAreaDTO, signal?: AbortSignal): Promise<Area> {
    const response = await api.post('/areas', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateAreaDTO, signal?: AbortSignal): Promise<Area> {
    const response = await api.put(`/areas/${id}`, data, { signal });
    return response.data.data;
  },

  async updateVertices(id: number, vertices: { x: number; y: number }[], signal?: AbortSignal): Promise<Area> {
    const response = await api.put(`/areas/${id}/vertices`, { vertices }, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/areas/${id}`, { signal });
  },
};
