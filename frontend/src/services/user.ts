import api from './api';
import axios from 'axios';

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at: string;
}

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

// Helper to check if error is a cancellation error
const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const userService = {
  async getAll(signal?: AbortSignal): Promise<User[]> {
    try {
      const response = await api.get('/users', { signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) {
        throw error;
      }
      throw error;
    }
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

export type { User as UserType };
