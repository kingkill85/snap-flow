export interface ProjectGroup {
  id: number;
  status: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
  // Invoice settings
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
}

export interface ProjectGroupWithVersions extends ProjectGroup {
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: number;
  version_name: string;
  created_at: string;
}

export interface CreateProjectGroupDTO {
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  tenant_id: number;
}

export interface UpdateProjectGroupDTO {
  status?: 'active' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  discount_percentage?: number;
  discount_usd?: number;
  services_percentage?: number;
  services_usd?: number;
  local_currency_code?: string;
  exchange_rate?: number;
}

export interface CreateVersionDTO {
  version_name: string;
  source_project_id: number;
}
