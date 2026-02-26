import { useRef, useCallback, useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
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

// CSS keyframes for fade-in animation (50ms for snappy feel)
const fadeInKeyframes = `
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
`;

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  onPlacementDelete: (id: number) => void;
  onPlacementUpdate: (id: number, data: { x?: number; y?: number; width?: number; height?: number; item_variant_id?: number; addon_ids?: number[] }) => void;
  isResizingRef?: React.MutableRefObject<boolean>;
  zoomRef?: React.MutableRefObject<{ zoom: number; pan: { x: number; y: number } }>;
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
  isNew?: boolean;
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
    image_path: string | null;
    is_active: boolean;
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
  isNew,
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
    : { 
        zIndex: isResizing ? 200 : isDragging ? 100 : 1,
        animation: isNew ? 'fadeIn 50ms ease-out' : undefined,
      };

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
      data-placement="true"
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
  onDelete?: () => void;
}

function PlacementEditModal({ placement, floorplanId, isOpen, onClose, onUpdate, onDelete }: PlacementEditModalProps) {
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
  const [isItemUnavailable, setIsItemUnavailable] = useState(false);
  const [bomData, setBomData] = useState<any>(null);

  useEffect(() => {
    const loadItemData = async () => {
      if (!placement) {
        setItem(null);
        setVariants([]);
        setAddons([]);
        setIsItemUnavailable(false);
        setBomData(null);
        return;
      }

      try {
        setIsLoading(true);
        setError('');
        setIsItemUnavailable(false);

        // Fetch current BOM first (we need this regardless of item availability)
        let currentAddonIds: number[] = [];
        try {
          const bomData = await bomService.getBomForFloorplan(floorplanId);
          setBomData(bomData);
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

        setSelectedVariantId(placement.item_variant_id);
        setOriginalVariantId(placement.item_variant_id);

        // Set currently selected addons (from BOM)
        const currentAddons = new Set<number>(currentAddonIds);
        setSelectedAddons(currentAddons);
        
        // Store original addons for restoration when switching back
        setOriginalAddons(new Set(currentAddonIds));

        // Fetch item with variants (for available options)
        try {
          const itemData = await itemService.getById(placement.item_id);
          
          // Check if item is inactive
          if (!itemData.is_active) {
            setIsItemUnavailable(true);
            setItem(itemData);
            setVariants([]);
            setAddons([]);
          } else {
            // Check if current variant is in the available variants list
            // If not, it means the variant is inactive or deleted
            const currentVariant = itemData.variants?.find(v => v.id === placement.item_variant_id);
            if (!currentVariant) {
              // Variant is not in active list - it's unavailable
              setIsItemUnavailable(true);
              setItem(itemData);
              setVariants(itemData.variants || []);
              setAddons([]);
            } else {
              setItem(itemData);
              setVariants(itemData.variants || []);
              
              // Fetch addons for current variant
              const addonData = await variantAddonService.getByVariant(placement.item_id, placement.item_variant_id);
              setAddons(addonData);
            }
          }
        } catch (err: any) {
          // Item not found (404) or other error - item has been deleted
          console.error('Failed to load item data:', err);
          setIsItemUnavailable(true);
          setItem(null);
          setVariants([]);
          setAddons([]);
        }
      } catch (err) {
        console.error('Failed to load placement data:', err);
        setError('Failed to load placement details');
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
        ) : isItemUnavailable ? (
          // Read-only view for unavailable items (inactive/deleted)
          <div className="space-y-4">
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                This item is no longer available in the catalog. You can delete this placement, but you cannot edit it.
              </AlertDescription>
            </Alert>

            {bomData && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  {(() => {
                    // Find the BOM group for this placement
                    const group = bomData.groups.find((g: any) => 
                      g.bomEntryIds?.includes(placement?.bom_id) || g.mainEntry.id === placement?.bom_id
                    );
                    const mainEntry = group?.mainEntry;
                    return mainEntry?.picture_path ? (
                      <img
                        src={`/uploads/${mainEntry.picture_path}`}
                        alt={mainEntry.item_name}
                        className="w-20 h-20 object-contain rounded bg-white"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                        No Image
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const group = bomData.groups.find((g: any) => 
                        g.bomEntryIds?.includes(placement?.bom_id) || g.mainEntry.id === placement?.bom_id
                      );
                      const mainEntry = group?.mainEntry;
                      return (
                        <>
                          <p className="font-medium">{mainEntry?.item_name || 'Unknown Item'}</p>
                          <p className="text-sm text-muted-foreground">
                            {mainEntry?.model_number}
                            {mainEntry?.style_name && ` - ${mainEntry.style_name}`}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const group = bomData?.groups.find((g: any) => 
                g.bomEntryIds?.includes(placement?.bom_id) || g.mainEntry.id === placement?.bom_id
              );
              return group && group.children.length > 0 ? (
                <div>
                  <Label className="block text-sm font-medium mb-2">Add-ons</Label>
                  <div className="space-y-2">
                    {group.children.map((child: any) => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between p-2 rounded-lg border bg-background border-border opacity-75"
                      >
                        <div className="flex items-center gap-3">
                          {child.picture_path ? (
                            <img
                              src={`/uploads/${child.picture_path}`}
                              alt={child.item_name}
                              className="w-10 h-10 object-contain rounded bg-white flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                              No img
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm">
                              {child.item_name}
                              {child.style_name && (
                                <span className="text-muted-foreground"> - {child.style_name}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ${child.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

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
                      } ${!addon.addon_variant.is_active ? 'opacity-60 bg-muted/30' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        {addon.addon_variant.image_path ? (
                          <img
                            src={`/uploads/${addon.addon_variant.image_path}`}
                            alt={addon.addon_variant.item_name}
                            className="w-10 h-10 object-contain rounded bg-white flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                            No img
                          </div>
                        )}
                        <Checkbox
                          checked={selectedAddons.has(addon.addon_variant.id)}
                          onCheckedChange={() => handleAddonToggle(addon.addon_variant.id)}
                          disabled={!addon.addon_variant.is_active}
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {addon.addon_variant.item_name}
                            {!addon.addon_variant.is_active && (
                              <span title="Add-on no longer available" className="ml-1">
                                <AlertCircle className="h-3 w-3 text-destructive inline-block" />
                              </span>
                            )}
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
          {isItemUnavailable ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete?.();
                  onClose();
                }}
              >
                Delete Placement
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
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
  zoomRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<number | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null);
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  const [isImageLoading, setIsImageLoading] = useState(true);
  const { setNodeRef, isOver } = useDroppable({
    id: `canvas-${floorplan.id}`,
  });

  // Zoom and pan state
  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.25;

  // Wrap setters to also update zoomRef
  const setZoom = useCallback((value: number | ((prev: number) => number)) => {
    setZoomState(value);
    if (zoomRef) {
      const newZoom = typeof value === 'function' ? value(zoomRef.current.zoom) : value;
      zoomRef.current.zoom = newZoom;
    }
  }, [zoomRef]);

  const setPan = useCallback((value: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
    setPanState(value);
    if (zoomRef) {
      const newPan = typeof value === 'function' ? value(zoomRef.current.pan) : value;
      zoomRef.current.pan = newPan;
    }
  }, [zoomRef]);

  // Initialize zoomRef
  useEffect(() => {
    if (zoomRef) {
      zoomRef.current = { zoom, pan };
    }
  }, [zoomRef]);

  // Update cache buster when floorplan changes to force image reload
  useEffect(() => {
    setImageCacheBuster(Date.now());
    setIsImageLoading(true);
  }, [floorplan.id, floorplan.image_path]);
  
  // Track new placements for fade-in animation
  const newPlacementIdsRef = useRef<Set<number>>(new Set());
  const prevPlacementsRef = useRef<Placement[]>([]);
  
  // Detect new placements when placements array changes
  useEffect(() => {
    const currentIds = new Set(placements.map(p => p.id));
    const prevIds = new Set(prevPlacementsRef.current.map(p => p.id));
    
    // Find placements that exist now but didn't exist before
    const newIds = [...currentIds].filter(id => !prevIds.has(id));
    
    if (newIds.length > 0) {
      // Add new IDs to the ref
      newIds.forEach(id => newPlacementIdsRef.current.add(id));
      
      // Remove them after animation completes (50ms + buffer)
      setTimeout(() => {
        newIds.forEach(id => newPlacementIdsRef.current.delete(id));
      }, 100);
    }
    
    prevPlacementsRef.current = placements;
  }, [placements]);

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
      
      setIsImageLoading(false);
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

  // Apply zoom to scales
  const scaledScaleX = scaleX * zoom;
  const scaledScaleY = scaleY * zoom;

  // Zoom functions
  const handleZoomIn = () => {
    setZoom(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan functions - allow left-click or middle-click panning
  const startPan = (e: React.MouseEvent) => {
    // Allow left click (0) or middle click (1), but not right click (2)
    if (e.button !== 0 && e.button !== 1) return;
    
    // Don't pan if clicking on a placement (let the placement handle it)
    const target = e.target as HTMLElement;
    if (target.closest('[data-placement]')) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    e.preventDefault();
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const stopPan = () => {
    setIsPanning(false);
  };

  // Wheel zoom handler (Cmd/Ctrl + wheel)
  const handleWheel = (e: React.WheelEvent) => {
    // Check for Cmd (Mac) or Ctrl (Windows/Linux)
    if (!e.metaKey && !e.ctrlKey) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
    
    if (newZoom !== zoom) {
      setZoom(newZoom);
      
      // Zoom towards mouse position
      const container = containerRef.current;
      if (container && zoom !== 1) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        
        // Adjust pan to zoom towards mouse
        const zoomRatio = newZoom / zoom;
        setPan(prev => ({
          x: prev.x * zoomRatio + mouseX * (1 - zoomRatio),
          y: prev.y * zoomRatio + mouseY * (1 - zoomRatio),
        }));
      }
    }
  };

  // Arrow key panning - always allow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const panStep = 50;
      switch (e.key) {
        case 'ArrowLeft':
          setPan(prev => ({ ...prev, x: prev.x + panStep }));
          break;
        case 'ArrowRight':
          setPan(prev => ({ ...prev, x: prev.x - panStep }));
          break;
        case 'ArrowUp':
          setPan(prev => ({ ...prev, y: prev.y + panStep }));
          break;
        case 'ArrowDown':
          setPan(prev => ({ ...prev, y: prev.y - panStep }));
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleResetZoom();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom]);

  const handleCanvasClick = () => {
    setSelectedPlacementId(null);
  };

  const handleResize = (placementId: number, x: number, y: number, width: number, height: number) => {
    onPlacementUpdate(placementId, { x, y, width, height });
  };

  const imageUrl = `/uploads/${floorplan.image_path}?v=${imageCacheBuster}`;
  const imageWrapperStyle = imageDisplaySize.width > 0 && imageDisplaySize.height > 0
    ? {
        width: `${imageDisplaySize.width * zoom}px`,
        height: `${imageDisplaySize.height * zoom}px`,
        transform: `translate(${pan.x}px, ${pan.y}px)`,
      }
    : {
        width: 'auto',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
      };

  return (
    <>
      <style>{fadeInKeyframes}</style>
      <div
        ref={containerRef}
        className="relative w-full h-full bg-background overflow-hidden"
        style={{ touchAction: 'none' }}
      >
      <div
        ref={setNodeRef}
        data-canvas-id={floorplan.id}
        onClick={handleCanvasClick}
        onMouseDown={startPan}
        onMouseMove={handlePanMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        onWheel={handleWheel}
        className={`relative w-full h-full flex items-start justify-center transition-colors ${
          isOver ? 'bg-primary/5' : 'bg-background'
        } ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
      >
        {floorplan.image_path ? (
          <div className="flex h-full w-full items-start justify-center overflow-visible">
            <div className="relative flex-shrink-0" style={imageWrapperStyle}>
              {isImageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              <img
                key={`floorplan-${floorplan.id}-${imageCacheBuster}`}
                ref={imageRef}
                src={imageUrl}
                alt={floorplan.name}
                data-floorplan-image="true"
                className="block h-full w-full object-contain select-none"
                onLoad={updateImageSize}
                onError={() => {
                  console.error('Failed to load floorplan image:', imageUrl);
                  setIsImageLoading(false);
                }}
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

                  const isNewPlacement = newPlacementIdsRef.current.has(placement.id);

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
                      scaleX={scaledScaleX}
                      scaleY={scaledScaleY}
                      maxNaturalWidth={imageNaturalSize.width}
                      maxNaturalHeight={imageNaturalSize.height}
                      isNew={isNewPlacement}
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

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
          <div className="bg-background/90 border rounded-lg shadow-lg p-2 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_MAX}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_MIN}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="h-px bg-border my-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleResetZoom}
              title="Reset zoom (Ctrl+0)"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-background/90 border rounded-lg shadow-lg px-2 py-1 text-center">
            <span className="text-xs font-medium">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Help text */}
        <div className="absolute bottom-2 left-2 text-xs text-muted-foreground bg-background/75 px-2 py-1 rounded">
          Click item to select • Drag corners to resize • Click 🗑 to delete • Click ✎ to edit • Ctrl+wheel to zoom • Click & drag to pan
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
          onDelete={() => {
            if (editingPlacement) {
              onPlacementDelete(editingPlacement.id);
              setEditingPlacement(null);
            }
          }}
        />
      </div>
    </div>
    </>
  );
}
