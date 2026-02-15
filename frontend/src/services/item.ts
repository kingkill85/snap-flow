import api from './api';

// ==========================================
// TYPES - Updated for Variant/Add-On Structure
// ==========================================

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
  // Relations (populated when fetching single item)
  variants?: ItemVariant[];
  addons?: ItemAddon[];
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

export interface ItemAddon {
  id: number;
  parent_item_id: number;
  addon_item_id: number;
  slot_number: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  // Joined data
  addon_item?: Item;
}

// DTOs for creating/updating base items
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

// DTOs for variants
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

// DTOs for add-ons
export interface CreateAddonDTO {
  addon_item_id: number;
  slot_number: number;
  is_required?: boolean;
}

// Variant Add-On (per variant)
export interface VariantAddon {
  id: number;
  variant_id: number;
  addon_variant_id: number;
  is_optional: boolean;
  sort_order: number;
  created_at: string;
  addon_variant?: ItemVariant;
}

export interface CreateVariantAddonDTO {
  addon_variant_id: number;
  is_optional?: boolean;
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

// ==========================================
// SERVICE
// ==========================================

export const itemService = {
  // ==========================================
  // BASE ITEM OPERATIONS
  // ==========================================

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

  async create(data: CreateItemDTO, signal?: AbortSignal): Promise<Item> {
    const response = await api.post('/items', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateItemDTO, signal?: AbortSignal): Promise<Item> {
    const response = await api.put(`/items/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/items/${id}`, { signal });
  },

  // ==========================================
  // VARIANT OPERATIONS
  // ==========================================

  async getVariants(itemId: number, includeInactive = false, signal?: AbortSignal): Promise<ItemVariant[]> {
    const params = includeInactive ? '?include_inactive=true' : '';
    const response = await api.get(`/items/${itemId}/variants${params}`, { signal });
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

  async reorderVariants(
    itemId: number,
    variantIds: number[],
    signal?: AbortSignal
  ): Promise<void> {
    await api.patch(`/items/${itemId}/variants/reorder`, { variant_ids: variantIds }, { signal });
  },

  // ==========================================
  // ADD-ON OPERATIONS
  // ==========================================

  async getAddons(itemId: number, signal?: AbortSignal): Promise<ItemAddon[]> {
    const response = await api.get(`/items/${itemId}/addons`, { signal });
    return response.data.data;
  },

  async addAddon(
    itemId: number,
    data: CreateAddonDTO,
    signal?: AbortSignal
  ): Promise<ItemAddon> {
    const response = await api.post(`/items/${itemId}/addons`, data, { signal });
    return response.data.data;
  },

  async removeAddon(itemId: number, addonId: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/items/${itemId}/addons/${addonId}`, { signal });
  },

  // ==========================================
  // VARIANT ADD-ON OPERATIONS (per variant)
  // ==========================================

  async getVariantAddons(
    itemId: number,
    variantId: number,
    signal?: AbortSignal
  ): Promise<VariantAddon[]> {
    const response = await api.get(`/items/${itemId}/variants/${variantId}/addons`, { signal });
    return response.data.data;
  },

  async addVariantAddon(
    itemId: number,
    variantId: number,
    data: CreateVariantAddonDTO,
    signal?: AbortSignal
  ): Promise<VariantAddon> {
    const response = await api.post(`/items/${itemId}/variants/${variantId}/addons`, data, { signal });
    return response.data.data;
  },

  async removeVariantAddon(
    itemId: number,
    variantId: number,
    addonId: number,
    signal?: AbortSignal
  ): Promise<void> {
    await api.delete(`/items/${itemId}/variants/${variantId}/addons/${addonId}`, { signal });
  },

  // ==========================================
  // IMPORT OPERATIONS
  // ==========================================

  async previewImport(file: File, signal?: AbortSignal): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/items/import-preview', formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  async executeImport(preview: any, signal?: AbortSignal): Promise<any> {
    const response = await api.post('/items/import', { preview }, { signal });
    return response.data.data;
  },

  async syncCatalog(file: File, signal?: AbortSignal): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/items/sync-catalog', formData, {
      signal,
      // Don't set Content-Type header - let Axios set it with the boundary
    });
    return response.data.data;
  },

  // ==========================================
  // ACTIVATION/DEACTIVATION
  // ==========================================

  async deactivate(id: number, signal?: AbortSignal): Promise<Item> {
    const response = await api.patch(`/items/${id}/deactivate`, {}, { signal });
    return response.data.data;
  },

  async activate(id: number, signal?: AbortSignal): Promise<Item> {
    const response = await api.patch(`/items/${id}/activate`, {}, { signal });
    return response.data.data;
  },

  async deactivateVariant(itemId: number, variantId: number, signal?: AbortSignal): Promise<ItemVariant> {
    const response = await api.patch(`/items/${itemId}/variants/${variantId}/deactivate`, {}, { signal });
    return response.data.data;
  },

  async activateVariant(itemId: number, variantId: number, signal?: AbortSignal): Promise<ItemVariant> {
    const response = await api.patch(`/items/${itemId}/variants/${variantId}/activate`, {}, { signal });
    return response.data.data;
  },

  // ==========================================
  // UTILITY
  // ==========================================

  getImageUrl(imagePath: string | null, bustCache?: boolean): string | null {
    if (!imagePath) return null;
    if (bustCache) {
      return `/uploads/${imagePath}?t=${Date.now()}`;
    }
    return `/uploads/${imagePath}`;
  },
};
