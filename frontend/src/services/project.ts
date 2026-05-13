import api from './api';

export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
}

export interface Project {
  id: number;
  version_name: string;
  tenant_id: number;
  created_at: string;
  google_exchange_rate: number;
  item_type_ids?: number[];
  // Joined group info (from API)
  group?: ProjectGroup;
  customer_name?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
}

export interface CreateProjectDTO {
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  version_name?: string;
  item_type_ids?: number[];
}

export interface UpdateProjectDTO {
  version_name?: string;
  tenant_id?: number;
  item_type_ids?: number[];
}

export const projectService = {
  async getAll(search?: string, signal?: AbortSignal): Promise<Project[]> {
    const params = search ? { search } : undefined;
    const response = await api.get('/projects', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<Project> {
    const response = await api.get(`/projects/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateProjectDTO, signal?: AbortSignal): Promise<Project> {
    const response = await api.post('/projects', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateProjectDTO, signal?: AbortSignal): Promise<Project> {
    const response = await api.put(`/projects/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/projects/${id}`, { signal });
  },
};
