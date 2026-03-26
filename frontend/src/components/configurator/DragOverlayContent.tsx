import { itemService } from '@/services/item';
import type { Item } from '@/services/item';
import type { ItemPaletteRef } from './ItemPalette';

interface DragOverlayContentProps {
  item: Item;
  isCtrlDragging: boolean;
  isDropping: boolean;
  itemSizeMemory: React.MutableRefObject<Map<number, { width: number; height: number }>>;
  itemPaletteRef: React.RefObject<ItemPaletteRef>;
  canvasScale: { scaleX: number; scaleY: number };
}

export function DragOverlayContent({
  item,
  isCtrlDragging,
  isDropping,
  itemSizeMemory,
  itemPaletteRef,
  canvasScale,
}: DragOverlayContentProps) {
  if (isDropping) return null;

  // Calculate dimensions to match what the placement will be
  let placementWidth = 60;
  let placementHeight = 60;
  
  // Check if Ctrl is being held (ignore defaults)
  if (!isCtrlDragging) {
    // Check if there's a stored size for this item (from previous resize)
    const storedSize = itemSizeMemory.current.get(item.id);
    if (storedSize) {
      // Use the stored size directly
      placementWidth = storedSize.width;
      placementHeight = storedSize.height;
    } else {
      // No stored size - calculate from aspect ratio
      // Default placement height is 60, width is calculated from aspect ratio
      if (item.preview_image && itemPaletteRef.current) {
        const aspectRatio = itemPaletteRef.current.getImageAspectRatio(item.preview_image);
        if (aspectRatio) {
          placementWidth = 60 * aspectRatio;
        }
      }
    }
  } else {
    // Ctrl is held - use default 60x60 or calculate from aspect ratio only
    if (item.preview_image && itemPaletteRef.current) {
      const aspectRatio = itemPaletteRef.current.getImageAspectRatio(item.preview_image);
      if (aspectRatio) {
        placementWidth = 60 * aspectRatio;
      }
    }
  }
  
  // Clamp dimensions to placement limits (5-500px)
  placementWidth = Math.max(5, Math.min(500, placementWidth));
  placementHeight = Math.max(5, Math.min(500, placementHeight));
  
  // Scale the overlay to match the visual size on canvas
  const { scaleX, scaleY } = canvasScale;
  
  return (
    <div 
      className="border-2 border-primary rounded bg-background shadow-xl cursor-grabbing overflow-hidden" 
      style={{ 
        width: `${placementWidth}px`, 
        height: `${placementHeight}px`,
        transform: `scale(${scaleX}, ${scaleY})`,
        transformOrigin: 'center center'
      }}
    >
      {item.preview_image ? (
        <img
          src={itemService.getImageUrl(item.preview_image)}
          alt={item.name}
          className="w-full h-full object-fill bg-muted"
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
          No img
        </div>
      )}
    </div>
  );
}
