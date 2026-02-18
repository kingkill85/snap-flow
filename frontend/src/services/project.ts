import api from './api';
import axios from 'axios';

export interface Project {
  id: number;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  created_at: string;
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

// Helper to check if error is a cancellation error
const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const projectService = {
  async getAll(search?: string, signal?: AbortSignal): Promise<Project[]> {
    try {
      const params = search ? { search } : undefined;
      const response = await api.get('/projects', { params, signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) {
        throw error;
      }
      throw error;
    }
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

export type { Project as ProjectType };
