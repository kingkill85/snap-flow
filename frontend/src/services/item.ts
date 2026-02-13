import api from './api';

export interface Item {
  id: number;
  category_id: number;
  name: string;
  description: string;
  model_number: string;
  dimensions: string;
  price: number;
  image_path: string | null;
  created_at: string;
}

export interface CreateItemDTO {
  category_id: number;
  name: string;
  description?: string;
  model_number?: string;
  dimensions?: string;
  price: number;
  image?: File;
}

export interface UpdateItemDTO {
  category_id?: number;
  name?: string;
  description?: string;
  model_number?: string;
  dimensions?: string;
  price?: number;
  image?: File;
}

export interface ItemFilter {
  category_id?: number;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedItemsResult {
  items: Item[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export const itemService = {
  async getAll(
    filter?: ItemFilter,
    pagination?: PaginationOptions,
    signal?: AbortSignal
  ): Promise<PaginatedItemsResult> {
    const params = new URLSearchParams();
    
    if (filter?.category_id) {
      params.append('category_id', filter.category_id.toString());
    }
    if (filter?.search) {
      params.append('search', filter.search);
    }
    if (pagination?.page) {
      params.append('page', pagination.page.toString());
    }
    if (pagination?.limit) {
      params.append('limit', pagination.limit.toString());
    }

    const queryString = params.toString();
    const url = queryString ? `/items?${queryString}` : '/items';
    
    const response = await api.get(url, { signal });
    return {
      items: response.data.data,
      ...response.data.pagination,
    };
  },

  async getById(id: number, signal?: AbortSignal): Promise<Item> {
    const response = await api.get(`/items/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateItemDTO, signal?: AbortSignal): Promise<Item> {
    const formData = new FormData();
    formData.append('category_id', data.category_id.toString());
    formData.append('name', data.name);
    formData.append('price', data.price.toString());
    
    if (data.description) formData.append('description', data.description);
    if (data.model_number) formData.append('model_number', data.model_number);
    if (data.dimensions) formData.append('dimensions', data.dimensions);
    if (data.image) formData.append('image', data.image);

    const response = await api.post('/items', formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  async update(id: number, data: UpdateItemDTO, signal?: AbortSignal): Promise<Item> {
    const formData = new FormData();
    
    if (data.category_id !== undefined) formData.append('category_id', data.category_id.toString());
    if (data.name !== undefined) formData.append('name', data.name);
    if (data.price !== undefined) formData.append('price', data.price.toString());
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.model_number !== undefined) formData.append('model_number', data.model_number);
    if (data.dimensions !== undefined) formData.append('dimensions', data.dimensions);
    if (data.image) formData.append('image', data.image);

    const response = await api.put(`/items/${id}`, formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/items/${id}`, { signal });
  },

  getImageUrl(imagePath: string | null): string | null {
    if (!imagePath) return null;
    return `/uploads/${imagePath}`;
  },
};

export type { Item, CreateItemDTO, UpdateItemDTO, ItemFilter, PaginationOptions };
