import api from './api';
import type { User } from '@/types';

export interface CreateUserDTO {
  email: string;
  full_name?: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface UpdateUserDTO {
  full_name?: string | null;
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
}

export const userService = {
  async getAll(signal?: AbortSignal): Promise<User[]> {
    const response = await api.get('/users', { signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<User> {
    const response = await api.get(`/users/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateUserDTO, signal?: AbortSignal): Promise<User> {
    const response = await api.post('/users', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateUserDTO, signal?: AbortSignal): Promise<User> {
    const response = await api.put(`/users/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/users/${id}`, { signal });
  },
};
