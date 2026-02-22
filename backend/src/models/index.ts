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
}

// Project (includes customer information directly)
export interface Project {
  id: number;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  created_at: string;
}

export interface CreateProjectDTO {
  name: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export interface UpdateProjectDTO {
  name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
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
  bom_id: number;
  floorplan_id: number;  // Joined from project_bom
  item_id: number;       // Joined from project_bom
  item_variant_id: number; // Joined from project_bom
  x: number;
  y: number;
  width: number;
  height: number;
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
}

// Project BOM (Bill of Materials)
export interface ProjectBom {
  id: number;
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id: number | null;
  name_snapshot: string;
  style_name: string | null;  // Snapshot of variant.style_name
  model_number_snapshot: string | null;
  price_snapshot: number;
  picture_path: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  children?: ProjectBom[];
  placement_count?: number;
}

export interface CreateBomEntryDTO {
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id?: number | null;
  name_snapshot: string;
  style_name?: string | null;
  model_number_snapshot?: string;
  price_snapshot: number;
  picture_path?: string | null;
}

export interface UpdateBomEntryDTO {
  variant_id?: number;
  name_snapshot?: string;
  style_name?: string | null;
  model_number_snapshot?: string;
  price_snapshot?: number;
  picture_path?: string | null;
}
