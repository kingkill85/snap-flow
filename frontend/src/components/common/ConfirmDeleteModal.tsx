import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X, Trash2, Info } from 'lucide-react';

interface ConfirmDeleteModalProps {
  title: string;
  itemName: string;
  warningText?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  disabledMessage?: string;
}

export function ConfirmDeleteModal({
  title,
  itemName,
  warningText,
  isOpen,
  onClose,
  onConfirm,
  disabled = false,
  disabledMessage,
}: ConfirmDeleteModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${disabled ? 'text-amber-600' : 'text-destructive'}`}>
            {disabled ? <Info className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            {disabled
              ? disabledMessage
              : `Are you sure you want to delete ${itemName ? <strong>{itemName}</strong> : 'this item'}? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {!disabled && warningText && (
          <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
            {warningText}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={disabled}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
