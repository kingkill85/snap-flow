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
import { Switch } from '@/components/ui/switch';
import { X, Save, Plus } from 'lucide-react';
import type { Tenant, CreateTenantDTO, UpdateTenantDTO } from '@/services/tenants';
import { extractErrorMessage } from '@/utils';

interface TenantFormModalProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTenantDTO | UpdateTenantDTO) => Promise<void>;
}

export function TenantFormModal({ tenant, isOpen, onClose, onSubmit }: TenantFormModalProps) {
  const isEdit = !!tenant;
  const [formData, setFormData] = useState({
    name: '',
    is_distributor: 0,
    is_active: 1,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        is_distributor: tenant.is_distributor,
        is_active: tenant.is_active,
      });
    } else {
      setFormData({
        name: '',
        is_distributor: 0,
        is_active: 1,
      });
    }
    setError('');
  }, [tenant, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isEdit) {
        const updateData: UpdateTenantDTO = {
          name: formData.name,
          is_active: formData.is_active,
          is_distributor: formData.is_distributor,
        };
        await onSubmit(updateData);
      } else {
        const createData: CreateTenantDTO = {
          name: formData.name,
          is_distributor: formData.is_distributor,
        };
        await onSubmit(createData);
      }
      onClose();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to save tenant');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tenant' : 'Create Tenant'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update tenant details below.'
              : 'Fill in the details to create a new tenant.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Company name"
                required
              />
            </div>

            {isEdit && !tenant?.is_distributor && (
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={!!formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked ? 1 : 0 })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.is_distributor.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, is_distributor: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Partner</SelectItem>
                  <SelectItem value="1">Distributor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                'Saving...'
              ) : isEdit ? (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
