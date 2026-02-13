import api from './api';
import axios from 'axios';

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface CreateCategoryDTO {
  name: string;
  sort_order?: number;
}

export interface UpdateCategoryDTO {
  name?: string;
  sort_order?: number;
}

// Helper to check if error is a cancellation error
const isCancelError = (error: any): boolean => {
  return axios.isCancel(error) || 
         error.name === 'CanceledError' || 
         error.name === 'AbortError' ||
         error.message === 'canceled';
};

export const categoryService = {
  async getAll(signal?: AbortSignal): Promise<Category[]> {
    try {
      const response = await api.get('/categories', { signal });
      return response.data.data;
    } catch (error) {
      if (isCancelError(error)) {
        throw error; // Re-throw cancellation errors
      }
      throw error;
    }
  },

  async getById(id: number, signal?: AbortSignal): Promise<Category> {
    const response = await api.get(`/categories/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateCategoryDTO, signal?: AbortSignal): Promise<Category> {
    const response = await api.post('/categories', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateCategoryDTO, signal?: AbortSignal): Promise<Category> {
    const response = await api.put(`/categories/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/categories/${id}`, { signal });
  },

  async reorder(categoryIds: number[], signal?: AbortSignal): Promise<Category[]> {
    const response = await api.patch('/categories/reorder', { category_ids: categoryIds }, { signal });
    return response.data.data;
  },
};
