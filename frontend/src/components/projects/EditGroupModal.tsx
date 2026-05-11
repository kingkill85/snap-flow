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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, X } from 'lucide-react';
import type { ProjectGroup, UpdateProjectGroupDTO } from '@/services/projectGroup';
import { extractErrorMessage } from '@/utils';

interface EditGroupModalProps {
  group: ProjectGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateProjectGroupDTO) => Promise<void>;
}

export function EditGroupModal({ group, isOpen, onClose, onSubmit }: EditGroupModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && group) {
      setFormData({
        name: group.name || '',
        customer_name: group.customer_name || '',
        customer_email: group.customer_email || '',
        customer_phone: group.customer_phone || '',
        customer_address: group.customer_address || '',
      });
      setError('');
    }
  }, [group, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCustomerName = formData.customer_name.trim();
    if (!trimmedCustomerName) {
      setError('Customer name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: UpdateProjectGroupDTO = {
        name: formData.name.trim() || undefined,
        customer_name: trimmedCustomerName,
      };
      if (formData.customer_email.trim()) data.customer_email = formData.customer_email.trim();
      if (formData.customer_phone.trim()) data.customer_phone = formData.customer_phone.trim();
      if (formData.customer_address.trim()) data.customer_address = formData.customer_address.trim();

      await onSubmit(data);
      onClose();
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, 'Failed to update group');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>Update group and customer information below.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Group Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Update
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
