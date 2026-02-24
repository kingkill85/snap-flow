import api from './api';

export interface Item {
  id: number;
  category_id: number;
  name: string;
  description: string;
  base_model_number: string;
  dimensions: string;
  created_at: string;
  is_active: boolean;
  preview_image?: string | null;
  variants?: ItemVariant[];
}

export interface ItemVariant {
  id: number;
  item_id: number;
  style_name: string;
  price: number;
  image_path: string | null;
  sort_order: number;
  created_at: string;
  is_active: boolean;
}

export interface ItemFilter {
  category_id?: number;
  search?: string;
  include_inactive?: boolean;
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
    if (filter?.include_inactive) {
      params.append('include_inactive', 'true');
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

  async getVariants(itemId: number, includeInactive = false, signal?: AbortSignal): Promise<ItemVariant[]> {
    const params = includeInactive ? '?include_inactive=true' : '';
    const response = await api.get(`/items/${itemId}/variants${params}`, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/items/${id}`, { signal });
  },

  getImageUrl(imagePath: string | null, bustCache?: boolean): string | null {
    if (!imagePath) return null;
    if (bustCache) {
      return `/uploads/${imagePath}?t=${Date.now()}`;
    }
    return `/uploads/${imagePath}`;
  },
};
