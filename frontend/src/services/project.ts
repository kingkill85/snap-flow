import api from './api';

export interface Project {
  id: number;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  created_at: string;
  // Invoice settings
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
}

export interface CreateProjectDTO {
  name: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export interface UpdateProjectDTO {
  name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
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
