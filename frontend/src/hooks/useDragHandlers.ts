import { useState, useCallback, useRef } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Item } from '@/services/item';
import type { Placement } from '@/services/placement';
import type { Floorplan } from '@/services/floorplan';
import { placementService } from '@/services/placement';
import { variantAddonService } from '@/services/variant-addon';
import type { ItemPaletteRef } from '@/components/configurator';

interface UseDragHandlersProps {
  items: Item[];
  placements: Placement[];
  activeFloorplan: Floorplan | null;
  itemSizeMemory: React.MutableRefObject<Map<number, { width: number; height: number }>>;
  itemVariantMemory: React.MutableRefObject<Map<number, { variant_id: number; addon_ids: number[] }>>;
  itemPaletteRef: React.RefObject<ItemPaletteRef>;
  isResizingRef: React.MutableRefObject<boolean>;
  handlePlacementCreate: (placement: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    item_id: number;
    item_variant_id: number;
    addon_ids?: number[];
    ignoreDefaults?: boolean;
  }) => Promise<void>;
  handlePlacementUpdate: (id: number, placement: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    item_variant_id?: number;
    addon_ids?: number[];
    rotation?: number;
  }, isFinal?: boolean) => Promise<void>;
  fetchPlacements: (floorplanId: number) => Promise<void>;
  setPlacementsVersion: React.Dispatch<React.SetStateAction<number>>;
  clearItemMemory: (itemId: number) => void;
}

interface UseDragHandlersReturn {
  activeDragItem: Item | null;
  activeDragPlacement: Placement | null;
  isDuplicating: boolean;
  isDropping: boolean;
  isCtrlDraggingItem: boolean;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  setActiveDragItem: React.Dispatch<React.SetStateAction<Item | null>>;
  setActiveDragPlacement: React.Dispatch<React.SetStateAction<Placement | null>>;
  setIsDuplicating: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDropping: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCtrlDraggingItem: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useDragHandlers({
  items,
  placements,
  activeFloorplan,
  itemSizeMemory,
  itemVariantMemory,
  itemPaletteRef,
  isResizingRef,
  handlePlacementCreate,
  handlePlacementUpdate,
  fetchPlacements,
  setPlacementsVersion,
  clearItemMemory,
}: UseDragHandlersProps): UseDragHandlersReturn {
  const [activeDragItem, setActiveDragItem] = useState<Item | null>(null);
  const [activeDragPlacement, setActiveDragPlacement] = useState<Placement | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [isCtrlDraggingItem, setIsCtrlDraggingItem] = useState(false);
  const duplicatePromiseRef = useRef<Promise<unknown> | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = event.active.id.toString();
    
    if (activeId.startsWith('item-')) {
      const itemData = event.active.data.current as { itemId: number } | undefined;
      const isCtrlPressed = event.activatorEvent ? 
        (event.activatorEvent as MouseEvent).ctrlKey || (event.activatorEvent as MouseEvent).metaKey : 
        false;
      
      if (itemData?.itemId) {
        const item = items.find(i => i.id === itemData.itemId);
        if (item) {
          setActiveDragItem(item);
          setIsCtrlDraggingItem(isCtrlPressed);
        }
      }
    } else if (activeId.startsWith('placement-')) {
      const placementId = parseInt(activeId.replace('placement-', ''));
      const placement = placements.find(p => p.id === placementId);
      if (placement) {
        const activeData = event.active.data.current as { isCtrlPressed?: boolean } | undefined;
        const isCtrlPressed = activeData?.isCtrlPressed ?? false;
        
        if (isCtrlPressed && activeFloorplan) {
          setActiveDragPlacement(placement);
          setIsDuplicating(true);
          
          duplicatePromiseRef.current = placementService.duplicate(placementId, placement.x, placement.y)
            .then((newPlacement) => {
              setActiveDragPlacement(newPlacement);
              fetchPlacements(activeFloorplan.id);
              setPlacementsVersion(prev => prev + 1);
              return newPlacement;
            })
            .catch((err) => {
              console.error('Failed to duplicate placement:', err);
              setIsDuplicating(false);
              duplicatePromiseRef.current = null;
            });
        } else {
          setActiveDragPlacement(placement);
          setIsDuplicating(false);
        }
      }
    }
  }, [items, placements, activeFloorplan, fetchPlacements, setPlacementsVersion]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (isResizingRef.current) {
      isResizingRef.current = false;
      return;
    }
    
    if (!over || !activeFloorplan) {
      setActiveDragItem(null);
      setActiveDragPlacement(null);
      setIsDuplicating(false);
      return;
    }
    
    const activeId = active.id.toString();
    const overId = over.id.toString();
    
    if (activeId.startsWith('placement-')) {
      const placementId = parseInt(activeId.replace('placement-', ''));
      const placement = placements.find(p => p.id === placementId);
      
      if (placement && overId.startsWith('canvas-')) {
        const canvasElement = document.querySelector(`[data-canvas-id="${activeFloorplan.id}"]`);
        if (!canvasElement) {
          console.error('Canvas element not found');
          setActiveDragItem(null);
          setActiveDragPlacement(null);
          setIsDuplicating(false);
          return;
        }
        
        const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
        if (!floorplanImage) {
          console.error('Floorplan image not found');
          setActiveDragItem(null);
          setActiveDragPlacement(null);
          setIsDuplicating(false);
          return;
        }
        
        const scaleX = floorplanImage.naturalWidth > 0
          ? floorplanImage.clientWidth / floorplanImage.naturalWidth
          : 1;
        const scaleY = floorplanImage.naturalHeight > 0
          ? floorplanImage.clientHeight / floorplanImage.naturalHeight
          : 1;

        const deltaX = event.delta.x / scaleX;
        const deltaY = event.delta.y / scaleY;

        const newX = placement.x + deltaX;
        const newY = placement.y + deltaY;

        // If duplicating, wait for duplicate to resolve and use its ID
        let targetPlacementId = placementId;
        if (duplicatePromiseRef.current) {
          try {
            const duplicated = await duplicatePromiseRef.current as { id: number };
            targetPlacementId = duplicated.id;
          } catch {
            // Duplicate failed — position update goes to original
          }
          duplicatePromiseRef.current = null;
        }

        handlePlacementUpdate(targetPlacementId, { x: newX, y: newY });
      }
      setActiveDragItem(null);
      setActiveDragPlacement(null);
      setIsDuplicating(false);
      return;
    }
    
    if (activeId.startsWith('item-') && overId.startsWith('canvas-')) {
      const itemData = active.data.current as { itemId: number } | undefined;
      
      if (itemData?.itemId) {
        try {
          setIsDropping(true);
          
          const canvasElement = document.querySelector(`[data-canvas-id="${activeFloorplan.id}"]`);
          if (!canvasElement) {
            console.error('Canvas element not found');
            setIsDropping(false);
            setActiveDragItem(null);
            setActiveDragPlacement(null);
            setIsDuplicating(false);
            return;
          }
          
          const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
          if (!floorplanImage) {
            console.error('Floorplan image not found');
            setIsDropping(false);
            setActiveDragItem(null);
            setActiveDragPlacement(null);
            setIsDuplicating(false);
            return;
          }
          
          const imageRect = floorplanImage.getBoundingClientRect();
          const activeRect = active.rect.current?.translated;
          
          const scaleX = floorplanImage.naturalWidth > 0
            ? floorplanImage.clientWidth / floorplanImage.naturalWidth
            : 1;
          const scaleY = floorplanImage.naturalHeight > 0
            ? floorplanImage.clientHeight / floorplanImage.naturalHeight
            : 2;
          
          let screenX: number;
          let screenY: number;
          
          if (activeRect) {
            screenX = activeRect.left - imageRect.left;
            screenY = activeRect.top - imageRect.top;
          } else {
            screenX = event.delta.x;
            screenY = event.delta.y;
          }
          
          screenX = Math.max(0, Math.min(screenX, imageRect.width - 100));
          screenY = Math.max(0, Math.min(screenY, imageRect.height - 100));
          
          const dropX = screenX / scaleX;
          const dropY = screenY / scaleY;
          
          const fullItem = items.find(i => i.id === itemData.itemId);
          
          if (!fullItem) {
            console.error('Item not found in local state:', itemData.itemId);
            setIsDropping(false);
            return;
          }
          
          const ignoreDefaults = isCtrlDraggingItem;
          
          if (ignoreDefaults) {
            clearItemMemory(itemData.itemId);
          }
          
          const storedConfig = ignoreDefaults ? undefined : itemVariantMemory.current.get(itemData.itemId);
          const variantToUse = storedConfig?.variant_id
            ? fullItem.variants?.find(v => v.id === storedConfig.variant_id)
            : fullItem.variants?.[0];

          if (variantToUse) {
            let placementWidth = 60;
            let placementHeight = 60;

            if (!ignoreDefaults) {
              const storedSize = itemSizeMemory.current.get(itemData.itemId);
              if (storedSize) {
                placementWidth = storedSize.width;
                placementHeight = storedSize.height;
              } else {
                if (fullItem.preview_image && itemPaletteRef.current) {
                  const aspectRatio = itemPaletteRef.current.getImageAspectRatio(fullItem.preview_image);
                  if (aspectRatio) {
                    placementWidth = 60 * aspectRatio;
                  }
                }
              }
            } else {
              if (fullItem.preview_image && itemPaletteRef.current) {
                const aspectRatio = itemPaletteRef.current.getImageAspectRatio(fullItem.preview_image);
                if (aspectRatio) {
                  placementWidth = 60 * aspectRatio;
                }
              }
            }

            placementWidth = Math.max(5, Math.min(500, placementWidth));
            placementHeight = Math.max(5, Math.min(500, placementHeight));

            let addonIds: number[] | undefined;
            if (!ignoreDefaults && storedConfig?.addon_ids !== undefined) {
              addonIds = storedConfig.addon_ids;
            } else {
              try {
                const variantAddons = await variantAddonService.getByVariant(itemData.itemId, variantToUse.id);
                addonIds = variantAddons
                  .filter(va => va.is_required && va.addon_variant.is_active)
                  .map(va => va.addon_variant.id);
              } catch (err) {
                console.error('Failed to fetch required addons:', err);
                addonIds = [];
              }
            }

            await handlePlacementCreate({
              x: dropX,
              y: dropY,
              width: placementWidth,
              height: placementHeight,
              item_id: itemData.itemId,
              item_variant_id: variantToUse.id,
              addon_ids: addonIds,
              ignoreDefaults,
            });
            setIsDropping(false);
            setActiveDragItem(null);
            setActiveDragPlacement(null);
            setIsDuplicating(false);
            return;
          }
        } catch (err) {
          console.error('Failed to create placement:', err);
          setIsDropping(false);
        }
      }
    }
    
    setActiveDragItem(null);
    setActiveDragPlacement(null);
    setIsDuplicating(false);
    setIsCtrlDraggingItem(false);
  }, [
    activeFloorplan,
    placements,
    items,
    isCtrlDraggingItem,
    itemSizeMemory,
    itemVariantMemory,
    itemPaletteRef,
    isResizingRef,
    handlePlacementCreate,
    handlePlacementUpdate,
    clearItemMemory,
  ]);

  return {
    activeDragItem,
    activeDragPlacement,
    isDuplicating,
    isDropping,
    isCtrlDraggingItem,
    handleDragStart,
    handleDragEnd,
    setActiveDragItem,
    setActiveDragPlacement,
    setIsDuplicating,
    setIsDropping,
    setIsCtrlDraggingItem,
  };
}
