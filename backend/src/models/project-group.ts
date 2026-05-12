export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
}

export interface ProjectGroupWithVersions extends ProjectGroup {
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface CreateProjectGroupDTO {
  name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  tenant_id: number;
}

export interface UpdateProjectGroupDTO {
  name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export interface CreateVersionDTO {
  version_name: string;
  source_project_id: number;
}
