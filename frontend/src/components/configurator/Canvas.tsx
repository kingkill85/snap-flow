import { useRef, useCallback, useState, useEffect } from 'react';
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

// Draggable placement component with resize handles
interface DraggablePlacementProps {
  placement: Placement;
  item: Item | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (x: number, y: number, width: number, height: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

function DraggablePlacement({ 
  placement, 
  item, 
  isSelected, 
  onSelect, 
  onDelete, 
  onResize,
  containerRef 
}: DraggablePlacementProps) {
  // State must be declared before hooks that use it
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, placementX: 0, placementY: 0, corner: '' });
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `placement-${placement.id}`,
    data: {
      placement,
      type: 'placement',
    },
    disabled: isResizing, // Disable drag while resizing
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isResizing ? 200 : 100,
      }
    : { zIndex: isResizing ? 200 : isDragging ? 100 : 1 };

  const handleClick = (e: React.MouseEvent) => {
    if (isResizing) return;
    e.stopPropagation();
    onSelect();
  };

  const startResize = (e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: placement.width,
      height: placement.height,
      placementX: placement.x,
      placementY: placement.y,
      corner,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { x, y, width, height, placementX, placementY, corner } = resizeStartRef.current;
      const deltaX = e.clientX - x;
      const deltaY = e.clientY - y;
      
      let newX = placementX;
      let newY = placementY;
      let newWidth = width;
      let newHeight = height;

      // Calculate based on which corner is being dragged
      switch (corner) {
        case 'se': // Bottom-right
          newWidth = Math.max(50, Math.min(400, width + deltaX));
          newHeight = Math.max(50, Math.min(400, height + deltaY));
          break;
        case 'sw': // Bottom-left
          newWidth = Math.max(50, Math.min(400, width - deltaX));
          newHeight = Math.max(50, Math.min(400, height + deltaY));
          newX = placementX + (width - newWidth);
          break;
        case 'ne': // Top-right
          newWidth = Math.max(50, Math.min(400, width + deltaX));
          newHeight = Math.max(50, Math.min(400, height - deltaY));
          newY = placementY + (height - newHeight);
          break;
        case 'nw': // Top-left
          newWidth = Math.max(50, Math.min(400, width - deltaX));
          newHeight = Math.max(50, Math.min(400, height - deltaY));
          newX = placementX + (width - newWidth);
          newY = placementY + (height - newHeight);
          break;
      }

      // Ensure placement stays within canvas bounds
      if (containerRef.current) {
        const canvasRect = containerRef.current.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, canvasRect.width - newWidth));
        newY = Math.max(0, Math.min(newY, canvasRect.height - newHeight));
      }

      onResize(newX, newY, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, containerRef]);

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
      className={`rounded overflow-hidden select-none group ${
        isSelected
          ? 'ring-2 ring-red-500 shadow-lg'
          : 'border-2 border-blue-500'
      } ${isDragging ? 'cursor-grabbing' : isResizing ? 'cursor-nwse-resize' : 'cursor-move'}`}
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

      {/* Selection overlay with resize handles */}
      {isSelected && (
        <>
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-3 -right-3 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md z-20 transition-transform hover:scale-110"
            title="Delete placement"
          >
            <HiTrash className="w-3 h-3" />
          </button>

          {/* Resize handles - corners only */}
          {/* Top-left */}
          <div
            className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'nw')}
            title="Resize from top-left"
          />
          {/* Top-right */}
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'ne')}
            title="Resize from top-right"
          />
          {/* Bottom-left */}
          <div
            className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'sw')}
            title="Resize from bottom-left"
          />
          {/* Bottom-right */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-se-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'se')}
            title="Resize from bottom-right"
          />

          {/* Size indicator */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
            {Math.round(placement.width)}×{Math.round(placement.height)}
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

  const handleCanvasClick = () => {
    setSelectedPlacementId(null);
  };

  const handleResize = (placementId: number, x: number, y: number, width: number, height: number) => {
    onPlacementUpdate(placementId, { x, y, width, height });
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
              onResize={(x, y, width, height) => handleResize(placement.id, x, y, width, height)}
              containerRef={containerRef}
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
          <li>• Drag corner handles to resize seamlessly</li>
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
