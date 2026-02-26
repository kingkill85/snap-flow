import api from './api';

export interface VariantAddon {
  id: number;
  variant_id: number;
  addon_variant_id: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  addon_variant: {
    id: number;
    item_id: number;
    item_name: string;
    style_name: string;
    price: number;
    image_path: string | null;
    is_active: boolean;
  };
}

export interface CreateVariantAddonDTO {
  addon_variant_id: number;
  is_required: boolean;
}

export const variantAddonService = {
  async getByVariant(itemId: number, variantId: number, signal?: AbortSignal): Promise<VariantAddon[]> {
    const response = await api.get(`/items/${itemId}/variants/${variantId}/addons`, { signal });
    return response.data.data;
  },

  async addAddon(
    itemId: number,
    variantId: number,
    data: CreateVariantAddonDTO,
    signal?: AbortSignal
  ): Promise<VariantAddon> {
    const response = await api.post(`/items/${itemId}/variants/${variantId}/addons`, data, { signal });
    return response.data.data;
  },

  async removeAddon(
    itemId: number,
    variantId: number,
    addonId: number,
    signal?: AbortSignal
  ): Promise<void> {
    await api.delete(`/items/${itemId}/variants/${variantId}/addons/${addonId}`, { signal });
  },
};
