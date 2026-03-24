import { useDraggable } from '@dnd-kit/core';
import { Trash2, Pencil, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Area } from '@/services/area';

function DraggableAreaBlock() {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: 'new-area',
    data: { type: 'area' },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab hover:shadow-md transition-shadow bg-background border border-border rounded-lg p-3 flex items-start gap-3 select-none"
    >
      <div className="flex-shrink-0 mt-0.5">
        <svg
          width="20"
          height="14"
          viewBox="0 0 20 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-muted-foreground"
        >
          <rect
            x="1"
            y="1"
            width="18"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="currentColor"
            fillOpacity="0.15"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">Area</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Drag onto canvas to define a room area
        </p>
      </div>
    </div>
  );
}

interface AreaListItemProps {
  area: Area;
  isSelected: boolean;
  isHidden: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
}

function AreaListItem({ area, isSelected, isHidden, onSelect, onEdit, onDelete, onToggleVisibility }: AreaListItemProps) {
  const deviceCount = area.device_count ?? 0;
  const displayColor = area.color || '#6366f1';

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/10 ring-1 ring-primary/40'
          : 'hover:bg-muted'
      } ${isHidden ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      {/* Visibility toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        title={isHidden ? 'Show area' : 'Hide area'}
      >
        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>

      {/* Color swatch */}
      <div
        className="flex-shrink-0 w-4 h-4 rounded-sm border border-border"
        style={{ backgroundColor: displayColor }}
      />

      {/* Name */}
      <span className="flex-1 min-w-0 text-sm text-foreground truncate">
        {area.name || 'Untitled Area'}
      </span>

      {/* Device count badge */}
      <span className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        {deviceCount}
      </span>

      {/* Edit button */}
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        title="Edit area"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete area"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export interface AreasPanelProps {
  areas: Area[];
  selectedAreaId: number | null;
  hiddenAreaIds: Set<number>;
  onSelectArea: (id: number | null) => void;
  onEditArea: (id: number) => void;
  onDeleteArea: (id: number) => void;
  onToggleAreaVisibility: (id: number) => void;
  onToggleAllAreasVisibility: () => void;
  className?: string;
}

export function AreasPanel({
  areas,
  selectedAreaId,
  hiddenAreaIds,
  onSelectArea,
  onEditArea,
  onDeleteArea,
  onToggleAreaVisibility,
  onToggleAllAreasVisibility,
  className = '',
}: AreasPanelProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Top: draggable area block */}
      <div className="px-4 pt-4 pb-3 border-b">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Add Area
        </p>
        <DraggableAreaBlock />
      </div>

      {/* Bottom: list of placed areas */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Placed Areas
          </p>
          <div className="flex items-center gap-2">
            {areas.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onToggleAllAreasVisibility}
                title={hiddenAreaIds.size === areas.length ? 'Show all areas' : 'Hide all areas'}
              >
                {hiddenAreaIds.size === areas.length ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            )}
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {areas.length}
            </span>
          </div>
        </div>

        {areas.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No areas placed yet. Drag an area block onto the canvas to get started.
          </p>
        ) : (
          <div className="space-y-1">
            {areas.map((area) => (
              <AreaListItem
                key={area.id}
                area={area}
                isSelected={selectedAreaId === area.id}
                isHidden={hiddenAreaIds.has(area.id)}
                onSelect={() => onSelectArea(selectedAreaId === area.id ? null : area.id)}
                onEdit={() => onEditArea(area.id)}
                onDelete={() => onDeleteArea(area.id)}
                onToggleVisibility={() => onToggleAreaVisibility(area.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
