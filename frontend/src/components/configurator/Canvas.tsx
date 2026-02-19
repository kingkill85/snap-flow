import { useRef, useCallback, useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { HiTrash } from 'react-icons/hi';
import type { Floorplan } from '../../services/floorplan';
import type { Placement } from '../../services/placement';
import type { Item } from '../../services/item';

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  onPlacementDelete: (id: number) => void;
}

// Draggable placement component
interface DraggablePlacementProps {
  placement: Placement;
  displayName: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function DraggablePlacement({ placement, displayName, isSelected, onSelect, onDelete }: DraggablePlacementProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `placement-${placement.id}`,
    data: {
      placement,
      type: 'placement',
    },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 100,
      }
    : { zIndex: isDragging ? 100 : 1 };

  // Handle click - select the placement
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...style,
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
      }}
      className={`border-2 rounded flex flex-col items-center justify-center select-none ${
        isSelected
          ? 'border-red-500 bg-red-100 bg-opacity-50'
          : 'border-blue-500 bg-blue-100 bg-opacity-30'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
      title={displayName}
      onClick={handleClick}
    >
      <span className={`text-xs font-medium truncate px-1 ${isSelected ? 'text-red-800' : 'text-blue-800'}`}>
        {displayName}
      </span>
      {isSelected && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Delete clicked for placement');
            onDelete();
          }}
          className="mt-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-sm cursor-pointer inline-flex items-center justify-center"
          title="Delete placement"
          role="button"
        >
          <HiTrash className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

export function Canvas({
  floorplan,
  placements,
  items,
  onPlacementDelete,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<number | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-${floorplan.id}`,
  });


  // Deselect when clicking on canvas
  const handleCanvasClick = () => {
    setSelectedPlacementId(null);
  };

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      console.log('Clicked at:', { x, y, floorplanId: floorplan.id });
    },
    [floorplan.id]
  );

  const imageUrl = `/uploads/${floorplan.image_path}`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-50 rounded-lg border-2 border-gray-200 overflow-hidden"
      style={{ minHeight: '500px', touchAction: 'none' }}
    >
      {/* Droppable area wrapper */}
      <div
        ref={setNodeRef}
        data-canvas-id={floorplan.id}
        onClick={handleCanvasClick}
        className={`relative w-full h-full flex items-center justify-center transition-colors ${
          isOver ? 'bg-blue-50 border-blue-300' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        {floorplan.image_path ? (
          <img
            src={imageUrl}
            alt={floorplan.name}
            className="max-w-full max-h-full object-contain cursor-crosshair select-none"
            onClick={handleImageClick}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : (
          <div className="text-center text-gray-400 p-8">
            <p className="text-lg mb-2">No floorplan image</p>
            <p className="text-sm">Upload a floorplan to start configuring</p>
          </div>
        )}

        {/* Placements overlay */}
        {placements.map((placement) => {
          const item = items.find((i) => i.id === placement.item_id);
          const displayName = item?.name || 'Unknown';

          return (
            <DraggablePlacement
              key={placement.id}
              placement={placement}
              displayName={displayName}
              isSelected={selectedPlacementId === placement.id}
              onSelect={() => setSelectedPlacementId(placement.id)}
              onDelete={() => {
                onPlacementDelete(placement.id);
                setSelectedPlacementId(null);
              }}
            />
          );
        })}
      </div>

      {/* Instructions overlay */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded shadow text-sm text-gray-600">
        <p>Drag items to place • Click to select • Drag to move • Click 🗑 to delete</p>
      </div>

      {/* Deselect button (when something is selected) */}
      {selectedPlacementId && (
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setSelectedPlacementId(null)}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
