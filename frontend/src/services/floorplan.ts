import api from './api';
import axios from 'axios';

export interface Floorplan {
  id: number;
  project_id: number;
  name: string;
  image_path: string;
  sort_order: number;
}

export interface CreateFloorplanDTO {
  project_id: number;
  name: string;
}

export interface UpdateFloorplanDTO {
  name?: string;
  sort_order?: number;
}

const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const floorplanService = {
  async getAll(projectId?: number, signal?: AbortSignal): Promise<Floorplan[]> {
    try {
      const params = projectId ? { project_id: projectId } : undefined;
      const response = await api.get('/floorplans', { params, signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) throw error;
      throw error;
    }
  },

  async getById(id: number, signal?: AbortSignal): Promise<Floorplan> {
    const response = await api.get(`/floorplans/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateFloorplanDTO, image: File, signal?: AbortSignal): Promise<Floorplan> {
    const formData = new FormData();
    formData.append('project_id', data.project_id.toString());
    formData.append('name', data.name);
    formData.append('image', image);

    const response = await api.post('/floorplans', formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  async update(id: number, data: UpdateFloorplanDTO, signal?: AbortSignal): Promise<Floorplan> {
    const response = await api.put(`/floorplans/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/floorplans/${id}`, { signal });
  },

  async reorder(projectId: number, floorplanIds: number[], signal?: AbortSignal): Promise<void> {
    await api.patch(`/floorplans/reorder?project_id=${projectId}`, { floorplan_ids: floorplanIds }, { signal });
  },

  getImageUrl(imagePath: string): string {
    return `/uploads/${imagePath}`;
  },
};

export type { Floorplan as FloorplanType };
