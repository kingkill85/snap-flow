import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { extractErrorMessage } from '@/utils';

interface CleanSlateDialogProps {
  isOpen: boolean;
  floorplanName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function CleanSlateDialog({
  isOpen,
  floorplanName,
  onClose,
  onConfirm,
}: CleanSlateDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      const fallback = err instanceof Error
        ? err.message
        : 'Unable to clear this floorplan. Please try again.';
      setError(extractErrorMessage(err, fallback));
    } finally {
      setIsPending(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isPending) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clean Slate</DialogTitle>
          <DialogDescription>
            This action cannot be undone. All product placements on this floorplan will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p>Start over on &quot;{floorplanName}&quot;?</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleOpenChange.bind(null, false)} disabled={isPending}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              {isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
