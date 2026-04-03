import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, FolderPlus, Save, X } from 'lucide-react';
import type { Project, CreateProjectDTO, UpdateProjectDTO } from '@/services/project';
import type { Tenant } from '@/services/tenants';
import { itemTypeService, type ItemType } from '@/services/item-type';
import { extractErrorMessage } from '@/utils';

interface ProjectFormModalProps {
  project: Project | null;
  tenants?: Tenant[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProjectDTO | UpdateProjectDTO) => Promise<void>;
}

export function ProjectFormModal({ project, tenants, isOpen, onClose, onSubmit }: ProjectFormModalProps) {
  const isEdit = !!project;
  const isAdmin = tenants && tenants.length > 0;
  const [formData, setFormData] = useState({
    name: '',
    status: 'active' as 'active' | 'completed' | 'cancelled',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    tenant_id: 0,
  });
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          name: project.name,
          status: project.status,
          customer_name: project.customer_name,
          customer_email: project.customer_email || '',
          customer_phone: project.customer_phone || '',
          customer_address: project.customer_address || '',
          tenant_id: project.tenant_id || 0,
        });
      } else {
        setFormData({
          name: '',
          status: 'active',
          customer_name: '',
          customer_email: '',
          customer_phone: '',
          customer_address: '',
          tenant_id: tenants?.[0]?.id ?? 0,
        });
      }
      setError('');

      // Fetch item types
      const controller = new AbortController();
      itemTypeService.getAll(controller.signal).then(types => {
        setItemTypes(types);
        if (project && project.item_type_ids) {
          setSelectedTypeIds(new Set(project.item_type_ids));
        } else {
          // Creating: select all active types
          setSelectedTypeIds(new Set(types.filter(t => t.is_active).map(t => t.id)));
        }
      }).catch(() => {/* ignore */});
      return () => controller.abort();
    }
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        // Always include all fields so clearing optional fields actually saves
        const updateData: UpdateProjectDTO & { tenant_id?: number } = {
          name: formData.name,
          status: formData.status,
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          customer_phone: formData.customer_phone,
          customer_address: formData.customer_address,
          item_type_ids: Array.from(selectedTypeIds),
        };
        if (isAdmin && formData.tenant_id) updateData.tenant_id = formData.tenant_id;
        await onSubmit(updateData);
      } else {
        const createData: CreateProjectDTO & { tenant_id?: number } = {
          name: formData.name,
          status: formData.status,
          customer_name: formData.customer_name,
          item_type_ids: Array.from(selectedTypeIds),
        };
        if (formData.customer_email) createData.customer_email = formData.customer_email;
        if (formData.customer_phone) createData.customer_phone = formData.customer_phone;
        if (formData.customer_address) createData.customer_address = formData.customer_address;
        if (isAdmin && formData.tenant_id) createData.tenant_id = formData.tenant_id;
        await onSubmit(createData);
      }
      onClose();
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} project`);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Project' : 'Create Project'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update project details below.' : 'Fill in the details to create a new project.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex-1 overflow-y-auto px-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Living Room Renovation"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: 'active' | 'completed' | 'cancelled') =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="tenant">Tenant</Label>
              <Select
                value={formData.tenant_id.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, tenant_id: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants!.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {itemTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Product Types</Label>
              <div className="flex flex-wrap gap-3">
                {itemTypes.map(t => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTypeIds.has(t.id)}
                      onChange={() => {
                        const next = new Set(selectedTypeIds);
                        if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                        if (next.size > 0) setSelectedTypeIds(next);
                      }}
                      className="rounded"
                    />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-3">Customer Information</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name *</Label>
                <Input
                  id="customer_name"
                  type="text"
                  placeholder="John Doe"
                  required
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_email">Email</Label>
                <Input
                  id="customer_email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_phone">Phone</Label>
                <Input
                  id="customer_phone"
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_address">Address</Label>
                <Input
                  id="customer_address"
                  type="text"
                  placeholder="123 Main St, City, Country"
                  value={formData.customer_address}
                  onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                />
              </div>
            </div>
          </div>

          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  {isEdit ? <Save className="mr-2 h-4 w-4" /> : <FolderPlus className="mr-2 h-4 w-4" />}
                  {isEdit ? 'Update' : 'Create'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
