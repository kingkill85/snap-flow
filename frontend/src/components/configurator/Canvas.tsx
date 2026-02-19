import { useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Floorplan } from '../../services/floorplan';
import type { Placement } from '../../services/placement';
import type { Item } from '../../services/item';

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  onPlacementCreate: (placement: { x: number; y: number; width: number; height: number; item_variant_id: number }) => void;
  onPlacementUpdate: (id: number, placement: { x?: number; y?: number; width?: number; height?: number }) => void;
  onPlacementDelete: (id: number) => void;
}

export function Canvas({
  floorplan,
  placements,
  items,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-${floorplan.id}`,
  });

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      // Get click coordinates relative to the image
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      console.log('Clicked at:', { x, y, floorplanId: floorplan.id });
      // For now, just log the click - actual item dropping will be handled by drag/drop
    },
    [floorplan.id]
  );

  const imageUrl = `/uploads/${floorplan.image_path}`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-50 rounded-lg border-2 border-gray-200 overflow-hidden"
      style={{ minHeight: '500px' }}
    >
      {/* Droppable area wrapper */}
      <div
        ref={setNodeRef}
        className={`relative w-full h-full flex items-center justify-center transition-colors ${
          isOver ? 'bg-blue-50' : ''
        }`}
      >
        {floorplan.image_path ? (
          <img
            src={imageUrl}
            alt={floorplan.name}
            className="max-w-full max-h-full object-contain cursor-crosshair"
            onClick={handleImageClick}
            draggable={false}
          />
        ) : (
          <div className="text-center text-gray-400 p-8">
            <p className="text-lg mb-2">No floorplan image</p>
            <p className="text-sm">Upload a floorplan to start configuring</p>
          </div>
        )}

        {/* Placements overlay */}
        {placements.map((placement) => {
          // Find item by item_id (included in placement)
          const item = items.find((i) => i.id === placement.item_id);
          const displayName = item?.name || 'Unknown';

          return (
            <div
              key={placement.id}
              className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-30 rounded cursor-move flex items-center justify-center"
              style={{
                left: placement.x,
                top: placement.y,
                width: placement.width,
                height: placement.height,
              }}
              title={displayName}
            >
              <span className="text-xs font-medium text-blue-800 truncate px-1">
                {displayName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Instructions overlay */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded shadow text-sm text-gray-600">
        <p>Drag items from the palette to place them</p>
      </div>
    </div>
  );
}
