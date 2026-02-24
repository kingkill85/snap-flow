import api from './api';

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface CreateCategoryDTO {
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateCategoryDTO {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

export const categoryService = {
  async getAll(signal?: AbortSignal, includeInactive = false): Promise<Category[]> {
    const params = includeInactive ? '?include_inactive=true' : '';
    const response = await api.get(`/categories${params}`, { signal });
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
