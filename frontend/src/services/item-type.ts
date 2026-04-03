import api from './api';

export interface ItemType {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateItemTypeDTO {
  name: string;
  abbreviation: string;
  color?: string;
}

export interface UpdateItemTypeDTO {
  name?: string;
  abbreviation?: string;
  color?: string;
  is_active?: boolean;
}

export const itemTypeService = {
  async getAll(signal?: AbortSignal, includeInactive = false): Promise<ItemType[]> {
    const params = includeInactive ? { include_inactive: 'true' } : undefined;
    const response = await api.get('/item-types', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.get(`/item-types/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateItemTypeDTO, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.post('/item-types', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateItemTypeDTO, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.put(`/item-types/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/item-types/${id}`, { signal });
  },

  async deactivate(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.patch(`/item-types/${id}/deactivate`, {}, { signal });
    return response.data.data;
  },

  async activate(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.patch(`/item-types/${id}/activate`, {}, { signal });
    return response.data.data;
  },

  async reorder(ids: number[]): Promise<ItemType[]> {
    const response = await api.patch('/item-types/reorder', { ids });
    return response.data.data;
  },
};
