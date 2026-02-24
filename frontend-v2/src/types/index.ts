// Core types for SnapFlow

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

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

export interface Project {
  id: number;
  customer_id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Floorplan {
  id: number;
  project_id: number;
  name: string;
  image_path: string;
  created_at: string;
}

export interface Placement {
  id: number;
  floorplan_id: number;
  item_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  quantity: number;
  created_at: string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// API Response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

// Pagination
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

// Filter types
export interface ItemFilter {
  category_id?: number;
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}
