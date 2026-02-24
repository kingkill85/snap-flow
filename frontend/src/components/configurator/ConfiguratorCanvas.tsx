import { useRef, useCallback, useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X } from 'lucide-react';
import type { Floorplan } from '@/services/floorplan';
import type { Placement } from '@/services/placement';
import type { Item } from '@/services/item';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { itemService, type ItemVariant } from '@/services/item';
import { variantAddonService } from '@/services/variant-addon';
import { bomService } from '@/services/bom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  onPlacementDelete: (id: number) => void;
  onPlacementUpdate: (id: number, data: { x?: number; y?: number; width?: number; height?: number; item_variant_id?: number; addon_ids?: number[] }) => void;
  isResizingRef?: React.MutableRefObject<boolean>;
}

interface DraggablePlacementProps {
  placement: Placement;
  item: Item | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (x: number, y: number, width: number, height: number) => void;
  onEdit: () => void;
  parentIsResizingRef?: React.MutableRefObject<boolean>;
  scaleX: number;
  scaleY: number;
  maxNaturalWidth: number;
  maxNaturalHeight: number;
}

interface AddonWithVariant {
  id: number;
  addon_variant_id: number;
  is_required: boolean;
  addon_variant: {
    id: number;
    item_name: string;
    style_name: string | null;
    price: number;
  };
}

function DraggablePlacement({ 
  placement, 
  item, 
  isSelected, 
  onSelect, 
  onDelete, 
  onResize,
  onEdit,
  parentIsResizingRef,
  scaleX,
  scaleY,
  maxNaturalWidth,
  maxNaturalHeight,
}: DraggablePlacementProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, placementX: 0, placementY: 0, corner: '' });
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `placement-${placement.id}`,
    data: {
      placement,
      type: 'placement',
    },
    disabled: isResizing || isSelected,
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
      const deltaX = (e.clientX - x) / scaleX;
      const deltaY = (e.clientY - y) / scaleY;
      
      let newX = placementX;
      let newY = placementY;
      let newWidth = width;
      let newHeight = height;

      switch (corner) {
        case 'se':
          newWidth = Math.max(30, Math.min(300, width + deltaX));
          newHeight = Math.max(30, Math.min(300, height + deltaY));
          break;
        case 'sw':
          newWidth = Math.max(30, Math.min(300, width - deltaX));
          newHeight = Math.max(30, Math.min(300, height + deltaY));
          newX = placementX + (width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(30, Math.min(300, width + deltaX));
          newHeight = Math.max(30, Math.min(300, height - deltaY));
          newY = placementY + (height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(30, Math.min(300, width - deltaX));
          newHeight = Math.max(30, Math.min(300, height - deltaY));
          newX = placementX + (width - newWidth);
          newY = placementY + (height - newHeight);
          break;
      }

      if (maxNaturalWidth > 0 && maxNaturalHeight > 0) {
        newX = Math.max(0, Math.min(newX, maxNaturalWidth - newWidth));
        newY = Math.max(0, Math.min(newY, maxNaturalHeight - newHeight));
      }

      onResize(newX, newY, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
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

  const variant = item?.variants?.find(v => v.id === placement.item_variant_id);
  const imageUrl = placement.item_variant_image_path 
    ? `/uploads/${placement.item_variant_image_path}` 
    : variant?.image_path 
    ? `/uploads/${variant.image_path}` 
    : item?.preview_image 
    ? `/uploads/${item.preview_image}` 
    : null;
  const displayName = item?.name || 'Unknown';

  return (
    <div
      ref={setNodeRef}
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
      className={`rounded select-none group ${
        isSelected
          ? 'ring-2 ring-destructive shadow-lg z-50'
          : 'border-2 border-primary overflow-hidden'
      } ${isDragging ? 'cursor-grabbing z-50' : isResizing ? 'cursor-nwse-resize z-50' : 'cursor-move'}`}
      title={displayName}
      onClick={handleClick}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={displayName}
          className="w-full h-full object-contain relative z-10"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center relative z-10">
          <span className="text-xs text-muted-foreground">No image</span>
        </div>
      )}

      {isSelected && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="absolute -top-10 -left-10 p-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-lg z-30 transition-transform hover:scale-110 border-2 border-background"
            title="Edit placement"
          >
            <Pencil className="w-3 h-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-10 -right-10 p-3 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 shadow-lg z-30 transition-transform hover:scale-110 border-2 border-background"
            title="Delete placement"
          >
            <X className="w-3 h-3" />
          </button>

          <div
            className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-primary border-2 border-background rounded-full cursor-nw-resize shadow-md z-50"
            onMouseDown={(e) => startResize(e, 'nw')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            title="Resize from top-left"
          />
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary border-2 border-background rounded-full cursor-ne-resize shadow-md z-50"
            onMouseDown={(e) => startResize(e, 'ne')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            title="Resize from top-right"
          />
          <div
            className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-primary border-2 border-background rounded-full cursor-sw-resize shadow-md z-50"
            onMouseDown={(e) => startResize(e, 'sw')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            title="Resize from bottom-left"
          />
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-primary border-2 border-background rounded-full cursor-se-resize shadow-md z-50"
            onMouseDown={(e) => startResize(e, 'se')}
            onPointerDown={(e) => { e.stopPropagation(); }}
            title="Resize from bottom-right"
          />

          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
            {Math.round(placement.width)}×{Math.round(placement.height)}
          </div>
        </>
      )}
    </div>
  );
}

interface PlacementEditModalProps {
  placement: Placement | null;
  floorplanId: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (variantId: number, selectedAddons: number[]) => Promise<void>;
}

function PlacementEditModal({ placement, floorplanId, isOpen, onClose, onUpdate }: PlacementEditModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [variants, setVariants] = useState<ItemVariant[]>([]);
  const [addons, setAddons] = useState<AddonWithVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [originalVariantId, setOriginalVariantId] = useState<number | null>(null);
  const [originalAddons, setOriginalAddons] = useState<Set<number>>(new Set());
  const [selectedAddons, setSelectedAddons] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadItemData = async () => {
      if (!placement) {
        setItem(null);
        setVariants([]);
        setAddons([]);
        return;
      }

      try {
        setIsLoading(true);
        setError('');

        // Fetch item with variants (for available options)
        const itemData = await itemService.getById(placement.item_id);
        setItem(itemData);
        setVariants(itemData.variants || []);

        setSelectedVariantId(placement.item_variant_id);
        setOriginalVariantId(placement.item_variant_id);

        // Fetch current BOM to get selected addons
        let currentAddonIds: number[] = [];
        try {
          const bomData = await bomService.getBomForFloorplan(floorplanId);
          // Find the group that matches this placement's bom_id
          const group = bomData.groups.find(g => 
            g.bomEntryIds?.includes(placement.bom_id) || g.mainEntry.id === placement.bom_id
          );
          if (group) {
            // Get addon IDs from children (these are the currently selected addons)
            currentAddonIds = group.children.map(child => child.variant_id);
          }
        } catch (err) {
          console.error('Failed to load BOM:', err);
        }

        // Fetch addons for current variant
        const addonData = await variantAddonService.getByVariant(placement.item_id, placement.item_variant_id);
        setAddons(addonData);

        // Set currently selected addons (from BOM)
        const currentAddons = new Set<number>(currentAddonIds);
        setSelectedAddons(currentAddons);
        
        // Store original addons for restoration when switching back
        setOriginalAddons(new Set(currentAddonIds));
      } catch (err) {
        console.error('Failed to load item data:', err);
        setError('Failed to load item details');
      } finally {
        setIsLoading(false);
      }
    };

    loadItemData();
  }, [placement, floorplanId]);

  useEffect(() => {
    const loadAddons = async () => {
      if (!selectedVariantId || !placement) return;

      try {
        const addonData = await variantAddonService.getByVariant(placement.item_id, selectedVariantId);
        setAddons(addonData);

        if (originalVariantId !== null && selectedVariantId !== originalVariantId) {
          const requiredAddons = addonData.filter((a: AddonWithVariant) => a.is_required).map((a: AddonWithVariant) => a.addon_variant.id);
          setSelectedAddons(new Set(requiredAddons));
        } else if (originalVariantId !== null && selectedVariantId === originalVariantId) {
          setSelectedAddons(new Set(originalAddons));
        }
      } catch (err) {
        console.error('Failed to load addons:', err);
      }
    };

    loadAddons();
  }, [selectedVariantId, placement, originalVariantId, originalAddons]);

  const handleAddonToggle = (addonId: number) => {
    setSelectedAddons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(addonId)) {
        newSet.delete(addonId);
      } else {
        newSet.add(addonId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!selectedVariantId) return;

    try {
      setIsSaving(true);
      await onUpdate(selectedVariantId, Array.from(selectedAddons));
      onClose();
    } catch (err) {
      console.error('Failed to update placement:', err);
      setError('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedVariant = variants.find(v => v.id === selectedVariantId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Style & Add-Ons</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {item && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  {selectedVariant?.image_path ? (
                    <img
                      src={`/uploads/${selectedVariant.image_path}`}
                      alt={item.name}
                      className="w-20 h-20 object-contain rounded bg-white"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                      No Image
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.base_model_number}
                      {selectedVariant?.style_name && ` - ${selectedVariant.style_name}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="block text-sm font-medium mb-2">Style</Label>
              <Select
                value={selectedVariantId?.toString() || ''}
                onValueChange={(value) => setSelectedVariantId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a style" />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id.toString()}>
                      {variant.style_name} - ${variant.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addons.length > 0 && (
              <div>
                <Label className="block text-sm font-medium mb-2">Add-ons</Label>
                <div className="space-y-2">
                  {addons.map((addon) => (
                    <div
                      key={addon.id}
                      className={`flex items-center justify-between p-2 rounded-lg border ${
                        addon.is_required ? 'bg-primary/5 border-primary/20' : 'bg-background border-border'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedAddons.has(addon.addon_variant.id)}
                          onCheckedChange={() => handleAddonToggle(addon.addon_variant.id)}
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {addon.addon_variant.item_name}
                            {addon.addon_variant.style_name && (
                              <span className="text-muted-foreground"> - {addon.addon_variant.style_name}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${addon.addon_variant.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      {addon.is_required && (
                        <span className="text-xs text-primary font-medium">
                          Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {placement && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Position: ({Math.round(placement.x)}, {Math.round(placement.y)})
                </p>
                <p className="text-muted-foreground">
                  Size: {Math.round(placement.width)} × {Math.round(placement.height)}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !selectedVariantId}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfiguratorCanvas({
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
  const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-${floorplan.id}`,
  });

  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [imageDisplaySize, setImageDisplaySize] = useState({ width: 0, height: 0 });

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
    window.addEventListener('resize', updateImageSize);
    return () => window.removeEventListener('resize', updateImageSize);
  }, [updateImageSize]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateImageSize, 0);
    });
    
    resizeObserver.observe(containerRef.current);
    
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

  const imageUrl = `/uploads/${floorplan.image_path}`;
  const imageWrapperStyle = {
    width: `${imageDisplaySize.width}px`,
    height: `${imageDisplaySize.height}px`,
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={setNodeRef}
        data-canvas-id={floorplan.id}
        onClick={handleCanvasClick}
        className={`relative w-full h-full flex items-start justify-center transition-colors ${
          isOver ? 'bg-primary/5' : 'bg-background'
        }`}
        style={{ touchAction: 'none' }}
      >
        {floorplan.image_path ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="relative" style={imageWrapperStyle}>
              <img
                ref={imageRef}
                src={imageUrl}
                alt={floorplan.name}
                data-floorplan-image="true"
                className="block h-full w-full object-contain cursor-crosshair select-none"
                onLoad={updateImageSize}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
              />

              {[...placements]
                .sort((a, b) => {
                  // Selected placement should be rendered last (on top)
                  if (a.id === selectedPlacementId) return 1;
                  if (b.id === selectedPlacementId) return -1;
                  return 0;
                })
                .map((placement) => {
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
                      onEdit={() => setEditingPlacement(placement)}
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
          <div className="text-center text-muted-foreground p-8">
            <p className="text-lg mb-2">No floorplan image</p>
            <p className="text-sm">Upload a floorplan to start configuring</p>
          </div>
        )}

        <div className="absolute bottom-2 left-2 text-xs text-muted-foreground bg-background/75 px-2 py-1 rounded">
          Click item to select • Drag corners to resize • Click 🗑 to delete • Click ✎ to edit
        </div>

        <PlacementEditModal
          placement={editingPlacement}
          floorplanId={floorplan.id}
          isOpen={editingPlacement !== null}
          onClose={() => setEditingPlacement(null)}
          onUpdate={async (variantId, selectedAddons) => {
            if (editingPlacement) {
              await onPlacementUpdate(editingPlacement.id, { item_variant_id: variantId, addon_ids: selectedAddons });
              setEditingPlacement(null);
            }
          }}
        />
      </div>
    </div>
  );
}
