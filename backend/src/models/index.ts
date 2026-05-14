/**
 * Database models and types
 */

// === Roles ===
export type UserRole = 'admin' | 'tenant_admin' | 'user';

// === Tenants ===
export interface Tenant {
  id: number;
  name: string;
  is_distributor: number; // SQLite boolean: 0 or 1
  is_active: number;      // SQLite boolean: 0 or 1
  created_at: string;
}

export interface CreateTenantDTO {
  name: string;
  is_distributor?: number;
}

export interface UpdateTenantDTO {
  name?: string;
  is_active?: number;
  is_distributor?: number;
}

// User
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  password_hash: string;
  role: UserRole;
  tenant_id: number;
  is_active: number;
  created_at: string;
}

export interface CreateUserDTO {
  email: string;
  full_name?: string | undefined;
  password?: string;
  password_hash?: string;
  role?: UserRole;
  tenant_id: number;
}

export interface UpdateUserDTO {
  email?: string;
  full_name?: string;
  password?: string;
  password_hash?: string;
  role?: UserRole;
  tenant_id?: number;
  is_active?: number;
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

// === Item Types ===
export interface ItemType {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateItemTypeDTO {
  name: string;
  abbreviation: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateItemTypeDTO {
  name?: string;
  abbreviation?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

// Item (Base Product)
export interface Item {
  id: number;
  category_id: number;
  type_id: number;
  name: string;
  description: string;
  base_model_number: string;
  dimensions: string;
  created_at: string;
  is_active: boolean;
  preview_image?: string | null;
  // Joined type info
  type_name?: string;
  type_abbreviation?: string;
  type_color?: string;
  // Relations
  variants?: ItemVariant[];
}

export interface CreateItemDTO {
  category_id: number;
  type_id: number;
  name: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

export interface UpdateItemDTO {
  category_id?: number;
  type_id?: number;
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
  is_required: boolean;
  sort_order: number;
  created_at: string;
  // Joined data
  addon_variant?: ItemVariant;
}

export interface CreateVariantAddonDTO {
  variant_id: number;
  addon_variant_id: number;
  is_required?: boolean;
  sort_order?: number;
}

export interface UpdatePlacementDTO {
  floorplan_id?: number | undefined;
  item_variant_id?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  rotation?: number | undefined;
  bom_id?: number | undefined;
  area_id?: number | null | undefined;
}

// Project (linked to project_group, has version_name)
export interface Project {
  id: number;
  project_group_id: number;
  version_name: string;
  tenant_id: number;
  created_at: string;
  google_exchange_rate: number;
  // Joined group info
  customer_name?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
}

export interface CreateProjectDTO {
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  version_name?: string;     // NEW: defaults to 'v1'
  tenant_id: number;
  item_type_ids?: number[];
}

export interface UpdateProjectDTO {
  version_name?: string;
  tenant_id?: number;
  item_type_ids?: number[];
}

export interface CreateFloorplanDTO {
  project_id: number;
  name: string;
  image_path: string;
  sort_order?: number;
}
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
  bom_id: number | null;  // NULL for area placements
  floorplan_id: number;
  type: 'item' | 'area';
  area_id: number | null;  // For items: containing area. For areas: NULL
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  created_at: string;
  // Joined data (item placements only)
  item_id?: number;
  item_variant_id?: number;
  item_variant_image_path?: string;
  item_variant?: ItemVariant;
  // Joined data (area placements only)
  area_properties?: AreaProperties;
  area_vertices?: AreaVertex[];
}

export interface CreatePlacementDTO {
  floorplan_id: number;
  item_variant_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;  // Optional, defaults to 0
}

// Project BOM (Bill of Materials)
export interface ProjectBom {
  id: number;
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id: number | null;
  area_id: number | null;
  item_name: string;
  item_type_name: string | null;
  style_name: string | null;  // Snapshot of variant.style_name
  model_number: string | null;
  unit_price: number;
  picture_path: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  children?: ProjectBom[];
  placement_count?: number;
  // Availability status (for frontend display)
  is_available?: boolean;
}

export interface CreateBomEntryDTO {
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id?: number | null;
  item_name: string;
  item_type_name?: string | null;
  style_name?: string | null;
  model_number?: string;
  unit_price: number;
  picture_path?: string | null;
}

export interface UpdateBomEntryDTO {
  variant_id?: number;
  item_name?: string;
  item_type_name?: string | null;
  style_name?: string | null;
  model_number?: string;
  unit_price?: number;
  picture_path?: string | null;
}

// Area Properties
export interface AreaProperties {
  id: number;
  placement_id: number;
  name: string;
  color: string;
  opacity: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAreaDTO {
  floorplan_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string | undefined;
  color?: string | undefined;
  opacity?: number | undefined;
}

export interface UpdateAreaDTO {
  name?: string | undefined;
  color?: string | undefined;
  opacity?: number | undefined;
}

// Area Vertex
export interface AreaVertex {
  id: number;
  placement_id: number;
  vertex_index: number;
  x: number;
  y: number;
}

// Area (combined placement + properties + vertices for API responses)
export interface Area {
  id: number;
  floorplan_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color: string;
  opacity: number;
  vertices: AreaVertex[];
  device_count: number;
  created_at: string;
  updated_at: string;
}
