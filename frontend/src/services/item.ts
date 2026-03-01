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

export interface CreateItemDTO {
  category_id: number;
  name: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

export interface UpdateItemDTO {
  category_id?: number;
  name?: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

export interface CreateVariantDTO {
  style_name: string;
  price: number;
  image?: File;
}

export interface UpdateVariantDTO {
  style_name?: string;
  price?: number;
  image?: File;
  remove_image?: boolean;
  is_active?: boolean;
}

export interface ItemFilter {
  category_id?: number | null;
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

// Global sync timestamp for image cache busting
// Updated by SyncContext after Excel sync
let globalSyncTimestamp = 0;

export function setGlobalSyncTimestamp(timestamp: number): void {
  globalSyncTimestamp = timestamp;
}

export function getGlobalSyncTimestamp(): number {
  return globalSyncTimestamp;
}

export const itemService = {
  async getAll(
    filter?: ItemFilter,
    pagination?: PaginationOptions,
    signal?: AbortSignal
  ): Promise<PaginatedItemsResult> {
    const params = new URLSearchParams();
    
    if (filter?.category_id !== undefined) {
      params.append('category_id', filter.category_id === null ? 'null' : filter.category_id.toString());
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

  async create(data: CreateItemDTO, signal?: AbortSignal): Promise<Item> {
    const response = await api.post('/items', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateItemDTO, signal?: AbortSignal): Promise<Item> {
    const response = await api.put(`/items/${id}`, data, { signal });
    return response.data.data;
  },

  async createVariant(
    itemId: number,
    data: CreateVariantDTO,
    signal?: AbortSignal
  ): Promise<ItemVariant> {
    const formData = new FormData();
    formData.append('style_name', data.style_name);
    formData.append('price', data.price.toString());
    
    if (data.image) formData.append('image', data.image);

    const response = await api.post(`/items/${itemId}/variants`, formData, { signal });
    return response.data.data;
  },

  async updateVariant(
    itemId: number,
    variantId: number,
    data: UpdateVariantDTO,
    signal?: AbortSignal
  ): Promise<ItemVariant> {
    const formData = new FormData();
    
    if (data.style_name !== undefined) formData.append('style_name', data.style_name);
    if (data.price !== undefined) formData.append('price', data.price.toString());
    if (data.image) formData.append('image', data.image);
    if (data.remove_image) formData.append('remove_image', 'true');
    if (data.is_active !== undefined) formData.append('is_active', data.is_active.toString());

    const response = await api.put(`/items/${itemId}/variants/${variantId}`, formData, { signal });
    return response.data.data;
  },

  async deleteVariant(itemId: number, variantId: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/items/${itemId}/variants/${variantId}`, { signal });
  },

  async getAddons(itemId: number, variantId: number, signal?: AbortSignal): Promise<any[]> {
    const response = await api.get(`/items/${itemId}/variants/${variantId}/addons`, { signal });
    return response.data.data;
  },

  async syncCatalog(file: File, signal?: AbortSignal): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/items/sync-catalog', formData, { signal });
    return response.data.data;
  },

  getImageUrl(imagePath: string | null): string | null {
    if (!imagePath) return null;
    // Use the sync timestamp for cache busting
    // This ensures all users see the same images after Excel sync
    const cacheBuster = globalSyncTimestamp || Date.now();
    return `/uploads/${imagePath}?t=${cacheBuster}`;
  },
};
