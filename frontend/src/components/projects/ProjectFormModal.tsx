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

interface ProjectFormModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProjectDTO | UpdateProjectDTO) => Promise<void>;
}

export function ProjectFormModal({ project, isOpen, onClose, onSubmit }: ProjectFormModalProps) {
  const isEdit = !!project;
  const [formData, setFormData] = useState({
    name: '',
    status: 'active' as 'active' | 'completed' | 'cancelled',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
  });
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
        });
      } else {
        setFormData({
          name: '',
          status: 'active',
          customer_name: '',
          customer_email: '',
          customer_phone: '',
          customer_address: '',
        });
      }
      setError('');
    }
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateProjectDTO = {};
        if (formData.name) updateData.name = formData.name;
        if (formData.status) updateData.status = formData.status;
        if (formData.customer_name) updateData.customer_name = formData.customer_name;
        if (formData.customer_email) updateData.customer_email = formData.customer_email;
        if (formData.customer_phone) updateData.customer_phone = formData.customer_phone;
        if (formData.customer_address) updateData.customer_address = formData.customer_address;
        await onSubmit(updateData);
      } else {
        const createData: CreateProjectDTO = {
          name: formData.name,
          status: formData.status,
          customer_name: formData.customer_name,
        };
        if (formData.customer_email) createData.customer_email = formData.customer_email;
        if (formData.customer_phone) createData.customer_phone = formData.customer_phone;
        if (formData.customer_address) createData.customer_address = formData.customer_address;
        await onSubmit(createData);
      }
      onClose();
    } catch (err) {
      const errorData = err.response?.data?.error;
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: { message: string }) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || `Failed to ${isEdit ? 'update' : 'create'} project`;
      }
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
