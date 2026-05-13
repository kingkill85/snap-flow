import api from './api';
import type { Project } from './project';

export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  status: 'active' | 'completed' | 'cancelled';
  tenant_id: number;
  created_at: string;
  // Invoice settings
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: number;
  version_name: string;
  created_at: string;
}

export interface UpdateProjectGroupDTO {
  status?: 'active' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  discount_percentage?: number;
  discount_usd?: number;
  services_percentage?: number;
  services_usd?: number;
  local_currency_code?: string;
  exchange_rate?: number;
}

export interface CreateVersionDTO {
  version_name: string;
}

export const projectGroupService = {
  async getAll(search?: string, signal?: AbortSignal): Promise<ProjectGroup[]> {
    const params = search ? { search } : undefined;
    const response = await api.get('/project-groups', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<ProjectGroup> {
    const response = await api.get(`/project-groups/${id}`, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateProjectGroupDTO, signal?: AbortSignal): Promise<ProjectGroup> {
    const response = await api.put(`/project-groups/${id}`, data, { signal });
    return response.data.data;
  },

  async createVersion(
    id: number,
    data: CreateVersionDTO & { source_project_id: number },
    signal?: AbortSignal
  ): Promise<Project> {
    const response = await api.post(`/project-groups/${id}/versions`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/project-groups/${id}`, { signal });
  },
};
