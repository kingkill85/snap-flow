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

export interface ZoningParameter {
  id: number; item_type_id: number; name: string; sort_order: number; is_active: boolean; created_at: string; updated_at: string;
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
  async getZoningParameters(id: number, includeInactive = false): Promise<ZoningParameter[]> {
    const response = await api.get(`/item-types/${id}/zoning-parameters`, { params: includeInactive ? { include_inactive: 'true' } : undefined });
    return response.data.data;
  },
  async createZoningParameter(id: number, data: { name: string; sort_order?: number }): Promise<ZoningParameter> {
    return (await api.post(`/item-types/${id}/zoning-parameters`, data)).data.data;
  },
  async updateZoningParameter(id: number, parameterId: number, data: { name?: string; sort_order?: number }): Promise<ZoningParameter> {
    return (await api.put(`/item-types/${id}/zoning-parameters/${parameterId}`, data)).data.data;
  },
  async setZoningParameterActive(id: number, parameterId: number, active: boolean): Promise<ZoningParameter> {
    return (await api.patch(`/item-types/${id}/zoning-parameters/${parameterId}/${active ? 'activate' : 'deactivate'}`)).data.data;
  },
  async deleteZoningParameter(id: number, parameterId: number): Promise<void> {
    await api.delete(`/item-types/${id}/zoning-parameters/${parameterId}`);
  },
  async reorderZoningParameters(id: number, ids: number[]): Promise<ZoningParameter[]> {
    return (await api.patch(`/item-types/${id}/zoning-parameters/reorder`, { ids })).data.data;
  },
};
