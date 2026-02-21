import { useRef, useCallback, useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { HiX } from 'react-icons/hi';
import type { Floorplan } from '../../services/floorplan';
import type { Placement } from '../../services/placement';
import type { Item } from '../../services/item';

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  onPlacementDelete: (id: number) => void;
  onPlacementUpdate: (id: number, data: { x?: number; y?: number; width?: number; height?: number }) => void;
  isResizingRef?: React.MutableRefObject<boolean>;
}

// Draggable placement component with resize handles
interface DraggablePlacementProps {
  placement: Placement;
  item: Item | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (x: number, y: number, width: number, height: number) => void;
  parentIsResizingRef?: React.MutableRefObject<boolean>;
  scaleX: number;
  scaleY: number;
  maxNaturalWidth: number;
  maxNaturalHeight: number;
}

function DraggablePlacement({ 
  placement, 
  item, 
  isSelected, 
  onSelect, 
  onDelete, 
  onResize,
  parentIsResizingRef,
  scaleX,
  scaleY,
  maxNaturalWidth,
  maxNaturalHeight,
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
    disabled: isResizing || isSelected, // Disable drag while resizing OR when selected
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
    
    // Notify parent that we're resizing
    if (parentIsResizingRef) {
      parentIsResizingRef.current = true;
    }
    
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
      // Convert mouse deltas from screen pixels to natural coordinates
      const deltaX = (e.clientX - x) / scaleX;
      const deltaY = (e.clientY - y) / scaleY;
      
      let newX = placementX;
      let newY = placementY;
      let newWidth = width;
      let newHeight = height;

      // Calculate based on which corner is being dragged
      // Min size 30, max size 300 (in natural coordinates)
      switch (corner) {
        case 'se': // Bottom-right
          newWidth = Math.max(30, Math.min(300, width + deltaX));
          newHeight = Math.max(30, Math.min(300, height + deltaY));
          break;
        case 'sw': // Bottom-left
          newWidth = Math.max(30, Math.min(300, width - deltaX));
          newHeight = Math.max(30, Math.min(300, height + deltaY));
          newX = placementX + (width - newWidth);
          break;
        case 'ne': // Top-right
          newWidth = Math.max(30, Math.min(300, width + deltaX));
          newHeight = Math.max(30, Math.min(300, height - deltaY));
          newY = placementY + (height - newHeight);
          break;
        case 'nw': // Top-left
          newWidth = Math.max(30, Math.min(300, width - deltaX));
          newHeight = Math.max(30, Math.min(300, height - deltaY));
          newX = placementX + (width - newWidth);
          newY = placementY + (height - newHeight);
          break;
      }

      // Ensure placement stays within floorplan natural bounds
      if (maxNaturalWidth > 0 && maxNaturalHeight > 0) {
        newX = Math.max(0, Math.min(newX, maxNaturalWidth - newWidth));
        newY = Math.max(0, Math.min(newY, maxNaturalHeight - newHeight));
      }

      onResize(newX, newY, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Clear the resizing flag in parent
      if (parentIsResizingRef) {
        parentIsResizingRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, scaleX, scaleY, maxNaturalWidth, maxNaturalHeight]);

  const imageUrl = item?.preview_image ? `/uploads/${item.preview_image}` : null;
  const displayName = item?.name || 'Unknown';

  return (
    <div
      ref={setNodeRef}
      // Only apply drag listeners when not selected
      {...(isSelected ? {} : listeners)}
      {...attributes}
      style={{
        ...style,
        position: 'absolute',
        left: placement.x * scaleX,
        top: placement.y * scaleY,
        width: placement.width * scaleX,
        height: placement.height * scaleY,
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
          {/* Delete button - positioned outside top-right corner like app close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-4 -right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg z-30 transition-transform hover:scale-110 border-2 border-white"
            title="Delete placement"
          >
            <HiX className="w-4 h-4" />
          </button>

          {/* Resize handles - corners only */}
          {/* Top-left */}
          <div
            className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'nw')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            data-no-drag="true"
            title="Resize from top-left"
          />
          {/* Top-right */}
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'ne')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            data-no-drag="true"
            title="Resize from top-right"
          />
          {/* Bottom-left */}
          <div
            className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'sw')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            data-no-drag="true"
            title="Resize from bottom-left"
          />
          {/* Bottom-right */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-se-resize shadow-md z-20 hover:bg-blue-600 transition-colors"
            onMouseDown={(e) => startResize(e, 'se')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            data-no-drag="true"
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
  isResizingRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<number | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-${floorplan.id}`,
  });

  // Track image natural and displayed size for scaling
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [imageDisplaySize, setImageDisplaySize] = useState({ width: 0, height: 0 });

  // Update image dimensions when loaded or resized
  const updateImageSize = useCallback(() => {
    if (imageRef.current && containerRef.current) {
      const naturalWidth = imageRef.current.naturalWidth;
      const naturalHeight = imageRef.current.naturalHeight;
      if (naturalWidth <= 0 || naturalHeight <= 0) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const fittedScale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);

      setImageNaturalSize({
        width: naturalWidth,
        height: naturalHeight,
      });

      setImageDisplaySize({
        width: naturalWidth * fittedScale,
        height: naturalHeight * fittedScale,
      });
    }
  }, []);

  useEffect(() => {
    // Update on window resize
    window.addEventListener('resize', updateImageSize);
    return () => window.removeEventListener('resize', updateImageSize);
  }, [updateImageSize]);

  useEffect(() => {
    // Use ResizeObserver to track container and image size changes
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to let the image settle into its new size
      setTimeout(updateImageSize, 0);
    });
    
    resizeObserver.observe(containerRef.current);
    
    // Also observe the image element to catch flexbox centering
    if (imageRef.current) {
      resizeObserver.observe(imageRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [floorplan.image_path, updateImageSize]);

  const scaleX = imageNaturalSize.width > 0 ? imageDisplaySize.width / imageNaturalSize.width : 1;
  const scaleY = imageNaturalSize.height > 0 ? imageDisplaySize.height / imageNaturalSize.height : 1;

  const handleCanvasClick = () => {
    setSelectedPlacementId(null);
  };

  const handleResize = (placementId: number, x: number, y: number, width: number, height: number) => {
    onPlacementUpdate(placementId, { x, y, width, height });
  };

  const handleImageClick = useCallback(() => {}, []);

  const imageUrl = `/uploads/${floorplan.image_path}`;
  const imageWrapperStyle = {
    width: `${imageDisplaySize.width}px`,
    height: `${imageDisplaySize.height}px`,
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-50 overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Droppable area wrapper */}
      <div
        ref={setNodeRef}
        data-canvas-id={floorplan.id}
        onClick={handleCanvasClick}
        className={`relative w-full h-full flex items-start justify-center transition-colors ${
          isOver ? 'bg-blue-50 border-blue-300' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        {floorplan.image_path ? (
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div className="relative" style={imageWrapperStyle}>
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={floorplan.name}
                  data-floorplan-image="true"
                  className="block h-full w-full object-contain cursor-crosshair select-none"
                  onClick={handleImageClick}
                  onLoad={updateImageSize}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                />

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
                    parentIsResizingRef={isResizingRef}
                    scaleX={scaleX}
                    scaleY={scaleY}
                    maxNaturalWidth={imageNaturalSize.width}
                    maxNaturalHeight={imageNaturalSize.height}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 p-8">
            <p className="text-lg mb-2">No floorplan image</p>
            <p className="text-sm">Upload a floorplan to start configuring</p>
          </div>
        )}

        {/* Minimal controls hint */}
        <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-white bg-opacity-75 px-2 py-1 rounded">
          Click item to select • Drag corners to resize • Click 🗑 to delete
        </div>
      </div>

    </div>
  );
}
