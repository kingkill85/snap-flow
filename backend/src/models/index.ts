/**
 * Database models and types
 */

// User
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface CreateUserDTO {
  email: string;
  full_name?: string | undefined;
  password?: string;
  password_hash?: string;
  role?: 'admin' | 'user';
}

export interface UpdateUserDTO {
  email?: string;
  full_name?: string;
  password?: string;
  password_hash?: string;
  role?: 'admin' | 'user';
}

// Category
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

// Item (Base Product)
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
  // Relations
  variants?: ItemVariant[];
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

// Item Variant
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

export interface CreateItemVariantDTO {
  item_id: number;
  style_name: string;
  price: number;
  image_path?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateItemVariantDTO {
  style_name?: string;
  model_number?: string;
  price?: number;
  image_path?: string;
  sort_order?: number;
  is_active?: boolean;
}

// Variant Add-On (per variant, not per item)
export interface VariantAddon {
  id: number;
  variant_id: number;
  addon_variant_id: number;
  is_optional: boolean;
  sort_order: number;
  created_at: string;
  // Joined data
  addon_variant?: ItemVariant;
}

export interface CreateVariantAddonDTO {
  variant_id: number;
  addon_variant_id: number;
  is_optional?: boolean;
  sort_order?: number;
}

export interface UpdatePlacementDTO {
  floorplan_id?: number | undefined;
  item_variant_id?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  selected_addons?: string | undefined; // JSON array of addon IDs
}

// Customer
export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_by: number;
  created_at: string;
}

export interface CreateCustomerDTO {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  created_by: number;
}

export interface UpdateCustomerDTO {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

// Project
export interface Project {
  id: number;
  customer_id: number;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface CreateProjectDTO {
  customer_id: number;
  name: string;
  status?: 'active' | 'completed' | 'cancelled';
}

export interface UpdateProjectDTO {
  customer_id?: number;
  name?: string;
  status?: 'active' | 'completed' | 'cancelled';
}

// Floorplan
export interface Floorplan {
  id: number;
  project_id: number;
  name: string;
  image_path: string;
  sort_order: number;
}

export interface CreateFloorplanDTO {
  project_id: number;
  name: string;
  image_path: string;
  sort_order?: number;
}

export interface UpdateFloorplanDTO {
  project_id?: number;
  name?: string;
  image_path?: string;
  sort_order?: number;
}

// Placement
export interface Placement {
  id: number;
  floorplan_id: number;
  item_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  selected_addons: string | null; // JSON array of addon IDs
  created_at: string;
  // Joined data
  item_variant?: ItemVariant;
}

export interface CreatePlacementDTO {
  floorplan_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  selected_addons?: string | undefined; // JSON array of addon IDs
}
