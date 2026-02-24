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
  };
}

export const variantAddonService = {
  async getByVariant(itemId: number, variantId: number, signal?: AbortSignal): Promise<VariantAddon[]> {
    const response = await api.get(`/items/${itemId}/variants/${variantId}/addons`, { signal });
    return response.data.data;
  },
};
