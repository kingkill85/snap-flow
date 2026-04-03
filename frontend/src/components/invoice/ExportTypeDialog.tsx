import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ItemType } from '@/services/item-type';

interface ExportTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (typeIds: number[]) => void;
  availableTypes: ItemType[];
  isGenerating: boolean;
}

const ExportTypeDialog = ({ open, onClose, onExport, availableTypes, isGenerating }: ExportTypeDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(availableTypes.map(t => t.id)));

  const toggle = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Proposals</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Select which product types to include. Each type generates a separate document.</p>
        <div className="space-y-2 py-2">
          {availableTypes.map(t => (
            <label key={t.id} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} className="rounded" />
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="text-sm">{t.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onExport(Array.from(selectedIds))} disabled={selectedIds.size === 0 || isGenerating}>
            {isGenerating ? 'Generating...' : `Export ${selectedIds.size} Proposal${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportTypeDialog;
