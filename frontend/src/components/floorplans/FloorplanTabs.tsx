import { Pencil, Trash, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Floorplan } from '@/services/floorplan';

interface FloorplanTabsProps {
  floorplans: Floorplan[];
  activeFloorplan: Floorplan | null;
  onSelect: (floorplan: Floorplan) => void;
  onEdit: (floorplan: Floorplan) => void;
  onDelete: (floorplan: Floorplan) => void;
  onReorder: (floorplanId: number, direction: 'up' | 'down') => void;
  onAdd: () => void;
  readOnly?: boolean;
}

export function FloorplanTabs({
  floorplans,
  activeFloorplan,
  onSelect,
  onEdit,
  onDelete,
  onReorder,
  onAdd,
  readOnly = false,
}: FloorplanTabsProps) {
  return (
    <div className="flex items-center justify-start border-b bg-muted/30 px-4 py-2 flex-shrink-0 h-10">
      <div className="flex gap-1 overflow-x-auto">
        {floorplans.map((floorplan, index) => (
          <div
            key={floorplan.id}
            className={`flex items-center px-3 py-2 cursor-pointer transition-colors whitespace-nowrap border-b-2 ${
              activeFloorplan?.id === floorplan.id
                ? 'text-foreground border-primary font-medium'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
            onClick={() => onSelect(floorplan)}
          >
            <span className="text-sm">{floorplan.name}</span>
            {!readOnly && <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(floorplan);
                }}
                className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (index > 0) onReorder(floorplan.id, 'up');
                }}
                disabled={index === 0}
                className={`p-1 text-muted-foreground hover:bg-muted rounded transition-colors ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                title="Move Left"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (index < floorplans.length - 1) onReorder(floorplan.id, 'down');
                }}
                disabled={index === floorplans.length - 1}
                className={`p-1 text-muted-foreground hover:bg-muted rounded transition-colors ${index === floorplans.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                title="Move Right"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(floorplan);
                }}
                className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                title="Delete"
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>}
          </div>
        ))}
        
        {!readOnly && (
          <div
            className="flex items-center px-3 py-2 cursor-pointer transition-colors whitespace-nowrap border-b-2 text-muted-foreground border-transparent hover:text-foreground"
            onClick={onAdd}
            title="Add Floorplan"
          >
            <Plus className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
