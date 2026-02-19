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
  onPlacementUpdate: (id: number, data: { x?: number; y?: number; width?: number; height?: number }) => void;
}

// Draggable placement component
interface DraggablePlacementProps {
  placement: Placement;
  item: Item | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (width: number, height: number) => void;
}

function DraggablePlacement({ placement, item, isSelected, onSelect, onDelete, onResize }: DraggablePlacementProps) {
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

  const imageUrl = item?.preview_image ? `/uploads/${item.preview_image}` : null;
  const displayName = item?.name || 'Unknown';

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
      className={`border-2 rounded overflow-hidden select-none group ${
        isSelected
          ? 'border-red-500 shadow-lg'
          : 'border-blue-500'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
      title={displayName}
      onClick={handleClick}
    >
      {/* Item Image */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={displayName}
          className="w-full h-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <span className="text-xs text-gray-500">No image</span>
        </div>
      )}

      {/* Selection overlay */}
      {isSelected && (
        <>
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-sm z-10"
            title="Delete placement"
          >
            <HiTrash className="w-3 h-3" />
          </button>

          {/* Resize controls */}
          <div className="absolute bottom-0 right-0 p-1 flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResize(Math.max(50, placement.width - 25), Math.max(50, placement.height - 25));
              }}
              className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm"
              title="Smaller"
            >
              <span className="text-xs">−</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResize(Math.min(300, placement.width + 25), Math.min(300, placement.height + 25));
              }}
              className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm"
              title="Larger"
            >
              <span className="text-xs">+</span>
            </button>
          </div>

          {/* Size indicator */}
          <div className="absolute -bottom-5 left-0 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
            {placement.width}×{placement.height}
          </div>
        </>
      )}
    </div>
  );
}

export function Canvas({
  floorplan,
  placements,
  items,
  onPlacementDelete,
  onPlacementUpdate,
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

  const handleResize = (placementId: number, width: number, height: number) => {
    onPlacementUpdate(placementId, { width, height });
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

          return (
            <DraggablePlacement
              key={placement.id}
              placement={placement}
              item={item}
              isSelected={selectedPlacementId === placement.id}
              onSelect={() => setSelectedPlacementId(placement.id)}
              onDelete={() => {
                onPlacementDelete(placement.id);
                setSelectedPlacementId(null);
              }}
              onResize={(width, height) => handleResize(placement.id, width, height)}
            />
          );
        })}
      </div>

      {/* Instructions overlay */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded shadow text-sm text-gray-600 max-w-sm">
        <p className="font-medium mb-1">Controls:</p>
        <ul className="text-xs space-y-1">
          <li>• Drag items from palette to place</li>
          <li>• Click placement to select</li>
          <li>• Drag placement to move</li>
          <li>• Use +/− buttons to resize when selected</li>
          <li>• Click 🗑 to delete</li>
        </ul>
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
