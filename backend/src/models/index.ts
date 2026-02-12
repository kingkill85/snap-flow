/**
 * Database models and types
 */

// User
export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface UpdateUserDTO {
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
}

// Category
export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface CreateCategoryDTO {
  name: string;
  sort_order?: number;
}

export interface UpdateCategoryDTO {
  name?: string;
  sort_order?: number;
}

// Item
export interface Item {
  id: number;
  category_id: number;
  name: string;
  description: string;
  model_number: string;
  dimensions: string;
  price: number;
  image_path: string;
  created_at: string;
}

export interface CreateItemDTO {
  category_id: number;
  name: string;
  description?: string;
  model_number?: string;
  dimensions?: string;
  price: number;
  image_path?: string;
}

export interface UpdateItemDTO {
  category_id?: number;
  name?: string;
  description?: string;
  model_number?: string;
  dimensions?: string;
  price?: number;
  image_path?: string;
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
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface CreatePlacementDTO {
  floorplan_id: number;
  item_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UpdatePlacementDTO {
  floorplan_id?: number;
  item_id?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
