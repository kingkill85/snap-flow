import api from './api';
import type { ApiResponse } from '@/types';

export interface Tenant {
  id: number;
  name: string;
  is_distributor: number;
  is_active: number;
  created_at: string;
}

export interface CreateTenantDTO {
  name: string;
  is_distributor?: number;
}

export interface UpdateTenantDTO {
  name?: string;
  is_active?: number;
  is_distributor?: number;
}

export const tenantService = {
  async getAll(signal?: AbortSignal): Promise<Tenant[]> {
    const response = await api.get<ApiResponse<Tenant[]>>('/tenants', { signal });
    return response.data.data;
  },

  async getById(id: number): Promise<Tenant> {
    const response = await api.get<ApiResponse<Tenant>>(`/tenants/${id}`);
    return response.data.data;
  },

  async create(data: CreateTenantDTO): Promise<Tenant> {
    const response = await api.post<ApiResponse<Tenant>>('/tenants', data);
    return response.data.data;
  },

  async update(id: number, data: UpdateTenantDTO): Promise<Tenant> {
    const response = await api.put<ApiResponse<Tenant>>(`/tenants/${id}`, data);
    return response.data.data;
  },

  async deactivate(id: number): Promise<Tenant> {
    const response = await api.delete<ApiResponse<Tenant>>(`/tenants/${id}`);
    return response.data.data;
  },
};
