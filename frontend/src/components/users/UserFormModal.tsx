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
import { Switch } from '@/components/ui/switch';
import { X, Save, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { User, UserRole } from '@/types';
import type { CreateUserDTO, UpdateUserDTO } from '@/services/user';
import type { Tenant } from '@/services/tenants';
import { extractErrorMessage } from '@/utils';

interface UserFormModalProps {
  user: User | null;
  currentUserRole: UserRole;
  tenants?: Tenant[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserDTO | UpdateUserDTO) => Promise<void>;
}

export function UserFormModal({ user, currentUserRole, tenants, isOpen, onClose, onSubmit }: UserFormModalProps) {
  const isEdit = !!user;
  const isAdmin = currentUserRole === 'admin';
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'user' as UserRole,
    is_active: 1,
    tenant_id: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        email: user.email,
        password: '',
        role: user.role,
        is_active: user.is_active ?? 1,
        tenant_id: user.tenant_id ?? 0,
      });
    } else {
      setFormData({
        full_name: '',
        email: '',
        password: '',
        role: 'user',
        is_active: 1,
        tenant_id: tenants?.[0]?.id ?? 0,
      });
    }
    setError('');
  }, [user, isOpen, tenants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isEdit) {
        const updateData: UpdateUserDTO = {
          full_name: formData.full_name || null,
          email: formData.email,
          ...(formData.password ? { password: formData.password } : {}),
          role: formData.role,
          is_active: formData.is_active,
          ...(isAdmin && formData.tenant_id ? { tenant_id: formData.tenant_id } : {}),
        };
        await onSubmit(updateData);
      } else {
        const createData: CreateUserDTO = {
          full_name: formData.full_name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          ...(isAdmin && formData.tenant_id ? { tenant_id: formData.tenant_id } : {}),
        };
        await onSubmit(createData);
      }
      onClose();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to save user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'Create User'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update user details below.'
              : 'Fill in the details to create a new user.'}
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
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="john@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder={isEdit ? '••••••••' : 'Enter password'}
                required={!isEdit}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: UserRole) =>
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                  {currentUserRole === 'admin' && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && tenants && tenants.length > 0 && (
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
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isEdit && user?.role !== 'admin' && (
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
