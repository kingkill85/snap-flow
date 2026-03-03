import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { X, Trash2 } from 'lucide-react';
import type { Floorplan } from '@/services/floorplan';

interface DeleteFloorplanDialogProps {
  floorplan: Floorplan | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteFloorplanDialog({
  floorplan,
  isOpen,
  onClose,
  onConfirm,
}: DeleteFloorplanDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Floorplan</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The floorplan and all associated placements will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p>Are you sure you want to delete &quot;{floorplan?.name}&quot;?</p>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the floorplan and all placements on it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
