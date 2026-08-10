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
  onReload?: (id: number) => Promise<void>;
}

export function AreaEditModal({ area, onSave, onClose, onReload }: AreaEditModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [opacity, setOpacity] = useState(10); // 0–100 (%)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<number, number>>({});
  const [reloadRequired, setReloadRequired] = useState(false);

  useEffect(() => {
    if (area) {
      setName(area.name || '');
      setColor(area.color || '#3b82f6');
      setOpacity(Math.round(area.opacity * 100));
      setValues(Object.fromEntries(area.zoning_groups.flatMap((group) => group.parameters.map((parameter) => [parameter.id, parameter.value]))));
    } else {
      setName('');
      setColor('#3b82f6');
      setOpacity(10);
    }
    setError('');
    setReloadRequired(false);
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
        ...(area.zoning_groups.length ? {
          revision: area.revision,
          applicable_parameter_ids: area.zoning_groups.flatMap((group) => group.parameters.map((parameter) => parameter.id)),
          zoning_values: area.zoning_groups.flatMap((group) => group.parameters.map((parameter) => ({ parameter_id: parameter.id, value: values[parameter.id] ?? 0 }))),
        } : {}),
      });
      onClose();
    } catch (err) {
      const response = typeof err === 'object' && err !== null && 'response' in err ? (err as { response?: { status?: number; data?: { error?: string } } }).response : undefined;
      const conflict = response?.status === 409;
      setReloadRequired(conflict);
      const message = response?.data?.error ?? (err instanceof Error ? err.message : 'Failed to save area');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={area !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={area?.zoning_groups.length ? 'sm:max-w-[850px] max-h-[90vh]' : 'sm:max-w-[400px]'}>
        <DialogHeader>
          <DialogTitle>Edit Area</DialogTitle>
          <DialogDescription>
            Update the area name, color, and transparency.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div role="alert" className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              <p>{error}</p>
              {reloadRequired && onReload && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={async () => { await onReload(area!.id); setReloadRequired(false); setError(''); }}>Reload Area</Button>}
            </div>
          )}
          <div className={`flex-1 overflow-y-auto px-1 gap-8 ${area?.zoning_groups.length ? 'grid grid-cols-1 md:grid-cols-2' : ''}`}>
            <div className="space-y-5">
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
            </div>

            {area?.zoning_groups.length ? (
              <section aria-labelledby="zoning-heading" className="min-w-0 space-y-4">
                <div>
                  <h3 id="zoning-heading" className="text-base font-semibold">Zoning Parameters</h3>
                  <p className="text-xs text-muted-foreground">Enter the required quantity for each configured parameter.</p>
                </div>
                {area.zoning_groups.map((group) => (
                  <div key={group.item_type.id} role="group" aria-labelledby={`zoning-group-${group.item_type.id}`} className="space-y-1.5">
                    <h4 id={`zoning-group-${group.item_type.id}`} className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.item_type.color }} aria-hidden="true" />
                      {group.item_type.name}
                    </h4>
                    <div className="divide-y divide-border/60">
                      {group.parameters.map((parameter) => {
                        const value = values[parameter.id] ?? 0;
                        return <div key={parameter.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 py-1.5">
                          <Label htmlFor={`zoning-${parameter.id}`} className="truncate text-sm font-normal" title={parameter.name}>{parameter.name}</Label>
                          <Input
                            id={`zoning-${parameter.id}`}
                            type="number"
                            min={0}
                            max={9999}
                            step={1}
                            inputMode="numeric"
                            value={value}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              setValues((current) => ({
                                ...current,
                                [parameter.id]: Number.isFinite(next)
                                  ? Math.max(0, Math.min(9999, Math.trunc(next)))
                                  : 0,
                              }));
                            }}
                            aria-describedby={`zoning-help-${parameter.id}`}
                            className="h-8 w-[5.5rem] px-2 text-right"
                          />
                          <span id={`zoning-help-${parameter.id}`} className="sr-only">Integer from 0 to 9999. Use arrow keys or the native stepper to change the value.</span>
                        </div>;
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 pt-4">
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
