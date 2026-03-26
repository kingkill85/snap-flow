import { useState, useEffect } from 'react';
import { tenantService, type Tenant, type CreateTenantDTO, type UpdateTenantDTO } from '@/services/tenants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TenantFormModal } from '@/components/settings/TenantFormModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { extractErrorMessage } from '@/utils';

const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [tenantToEdit, setTenantToEdit] = useState<Tenant | null>(null);
  const [tenantToDeactivate, setTenantToDeactivate] = useState<Tenant | null>(null);

  const fetchTenants = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await tenantService.getAll(signal);
      setTenants(data);
      setError('');
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, '');
      if (errorMessage !== 'AbortError') {
        setError(extractErrorMessage(err) || 'Failed to fetch tenants');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTenants(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const handleSubmitTenant = async (data: CreateTenantDTO | UpdateTenantDTO) => {
    if (tenantToEdit) {
      await tenantService.update(tenantToEdit.id, data as UpdateTenantDTO);
    } else {
      await tenantService.create(data as CreateTenantDTO);
    }
    fetchTenants();
  };

  const handleDeleteTenant = async () => {
    if (!tenantToDeactivate) return;
    try {
      await tenantService.deactivate(tenantToDeactivate.id);
      fetchTenants();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to delete tenant');
    }
  };

  const openCreateModal = () => {
    setTenantToEdit(null);
    setShowFormModal(true);
  };

  const openEditModal = (tenant: Tenant) => {
    setTenantToEdit(tenant);
    setShowFormModal(true);
  };

  const openDeactivateModal = (tenant: Tenant) => {
    setTenantToDeactivate(tenant);
    setShowDeactivateModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground">Manage distributor and partner companies</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Tenant
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader />
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No tenants found. Create your first tenant to get started.
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      {tenant.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.is_distributor ? 'default' : 'outline'}>
                        {tenant.is_distributor ? 'Distributor' : 'Partner'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                        {tenant.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(tenant)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeactivateModal(tenant)}
                          disabled={!!tenant.is_distributor}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TenantFormModal
        tenant={tenantToEdit}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setTenantToEdit(null);
        }}
        onSubmit={handleSubmitTenant}
      />

      <ConfirmDeleteModal
        title="Delete Tenant"
        itemName={tenantToDeactivate?.name || ''}
        isOpen={showDeactivateModal}
        onClose={() => {
          setShowDeactivateModal(false);
          setTenantToDeactivate(null);
        }}
        onConfirm={handleDeleteTenant}
      />
    </div>
  );
};

export default TenantManagement;
