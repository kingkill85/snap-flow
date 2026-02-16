import api from './api';
import axios from 'axios';
import type { Project } from './project';

export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_by: number;
  created_at: string;
}

export interface CreateCustomerDTO {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface UpdateCustomerDTO {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

// Helper to check if error is a cancellation error
const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const customerService = {
  async getAll(search?: string, signal?: AbortSignal): Promise<Customer[]> {
    try {
      const params = search ? { search } : undefined;
      const response = await api.get('/customers', { params, signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) {
        throw error;
      }
      throw error;
    }
  },

  async getById(id: number, signal?: AbortSignal): Promise<Customer> {
    const response = await api.get(`/customers/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateCustomerDTO, signal?: AbortSignal): Promise<Customer> {
    const response = await api.post('/customers', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateCustomerDTO, signal?: AbortSignal): Promise<Customer> {
    const response = await api.put(`/customers/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/customers/${id}`, { signal });
  },

  async getProjects(customerId: number, signal?: AbortSignal): Promise<Project[]> {
    const response = await api.get(`/customers/${customerId}/projects`, { signal });
    return response.data.data;
  },
};

export type { Customer as CustomerType };
export type { Project };
