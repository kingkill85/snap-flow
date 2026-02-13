import api from './api';

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

interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const categoryService = {
  async getAll(signal?: AbortSignal): Promise<Category[]> {
    const response = await api.get('/categories', { signal });
    return response.data.data;
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

export type { Category, CreateCategoryDTO, UpdateCategoryDTO };
