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
import { X, Save } from 'lucide-react';
import type { Area, UpdateAreaDTO } from '@/services/area';

export interface AreaEditModalProps {
  area: Area | null; // null = closed
  onSave: (id: number, data: UpdateAreaDTO) => Promise<void>;
  onClose: () => void;
}

export function AreaEditModal({ area, onSave, onClose }: AreaEditModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [opacity, setOpacity] = useState(10); // 0–100 (%)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (area) {
      setName(area.name || '');
      setColor(area.color || '#3b82f6');
      setOpacity(Math.round(area.opacity * 100));
    } else {
      setName('');
      setColor('#3b82f6');
      setOpacity(10);
    }
    setError('');
  }, [area]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area) return;
    setError('');
    setIsLoading(true);
    try {
      await onSave(area.id, {
        name: name.trim() || undefined,
        color,
        opacity: opacity / 100,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save area';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={area !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Edit Area</DialogTitle>
          <DialogDescription>
            Update the area name, color, and transparency.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Room Name */}
          <div className="space-y-2">
            <Label htmlFor="area-name">Name</Label>
            <Input
              id="area-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Living Room, Kitchen"
              autoFocus
            />
          </div>

          {/* Shape Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316'].map(c => (
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
                id="area-color"
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

          {/* Transparency */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="area-opacity">Transparency</Label>
              <span className="text-sm text-muted-foreground">{opacity}%</span>
            </div>
            <input
              id="area-opacity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full h-2 cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0% (invisible)</span>
              <span>100% (solid)</span>
            </div>
          </div>

          {/* Preview swatch */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="h-10 rounded-md border border-border overflow-hidden bg-muted relative">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%)',
                  backgroundSize: '12px 12px',
                }}
              />
              <div
                className="absolute inset-0 rounded-md"
                style={{ backgroundColor: color, opacity: opacity / 100 }}
              />
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
