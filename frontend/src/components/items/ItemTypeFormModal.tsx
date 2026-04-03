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
import { X, Save, Plus } from 'lucide-react';
import { extractErrorMessage } from '@/utils';
import type { ItemType, CreateItemTypeDTO, UpdateItemTypeDTO } from '@/services/item-type';
import ItemTypeBadge from './ItemTypeBadge';

interface ItemTypeFormModalProps {
  itemType: ItemType | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateItemTypeDTO | UpdateItemTypeDTO) => Promise<void>;
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316',
];

export function ItemTypeFormModal({ itemType, open, onClose, onSubmit }: ItemTypeFormModalProps) {
  const isEdit = !!itemType;
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (itemType) {
      setName(itemType.name);
      setAbbreviation(itemType.abbreviation);
      setColor(itemType.color);
    } else {
      setName('');
      setAbbreviation('');
      setColor('#3b82f6');
    }
    setError('');
  }, [itemType, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await onSubmit({ name, abbreviation, color });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save product type'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product Type' : 'Create Product Type'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update product type details below.'
              : 'Fill in the details to create a new product type.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="item-type-name">Name</Label>
              <Input
                id="item-type-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sensor, Switch, Controller"
                required
                autoFocus
              />
            </div>

            {/* Abbreviation */}
            <div className="space-y-2">
              <Label htmlFor="item-type-abbreviation">Abbreviation</Label>
              <Input
                id="item-type-abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g., SEN, SW, CTR"
                maxLength={10}
                required
                className="font-mono uppercase"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
                <Input
                  value={color}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                      setColor(val);
                    }
                  }}
                  className="font-mono text-sm w-32"
                  maxLength={7}
                  placeholder="#3b82f6"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted">
                <ItemTypeBadge
                  abbreviation={abbreviation || '...'}
                  color={color}
                />
                <span className="text-sm text-muted-foreground">
                  {name || 'Type Name'}
                </span>
              </div>
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
