// Core types for SnapFlow
// Note: domain types (Item, Project, Placement, Category, etc.) are defined
// in their respective service files (e.g. services/item.ts, services/project.ts).

export type UserRole = 'admin' | 'tenant_admin' | 'user';

export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  tenant_admin: 'Tenant Admin',
  user: 'User',
};

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: UserRole;
  tenantId: number;
  tenantName: string;
  tenant_id?: number;
  is_active?: number;
  created_at: string;
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
