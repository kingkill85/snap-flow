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
import { Loader2, Plus, X } from 'lucide-react';
import { extractErrorMessage } from '@/utils';

interface CreateVersionModalProps {
  groupName: string;
  existingVersionNames: string[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { version_name: string }) => Promise<void>;
}

export function CreateVersionModal({
  groupName,
  existingVersionNames,
  isOpen,
  onClose,
  onSubmit,
}: CreateVersionModalProps) {
  const [versionName, setVersionName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVersionName('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = versionName.trim();
    if (!trimmed) {
      setError('Version name is required');
      return;
    }

    const normalizedExisting = existingVersionNames.map(n => n.trim().toLowerCase());
    if (normalizedExisting.includes(trimmed.toLowerCase())) {
      setError(`Version "${trimmed}" already exists in this group`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ version_name: trimmed });
      onClose();
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, 'Failed to create version');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Version</DialogTitle>
          <DialogDescription>
            Create a new version for group <strong>{groupName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 mb-6">
            <Label htmlFor="version_name">Version Name *</Label>
            <Input
              id="version_name"
              type="text"
              placeholder="e.g. v1.1, Updated Design"
              required
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
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
                  Creating...
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
