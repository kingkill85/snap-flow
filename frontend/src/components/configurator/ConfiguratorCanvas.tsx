import { useRef, useCallback, useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, RotateCw, Save, Trash2, Download } from 'lucide-react';
import type { Floorplan } from '@/services/floorplan';
import type { Placement } from '@/services/placement';
import type { Item } from '@/services/item';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { itemService, type ItemVariant } from '@/services/item';
import { variantAddonService } from '@/services/variant-addon';
import type { FloorplanBom } from '@/services/bom';
import { exportFloorplanImage } from '@/services/floorplan-export';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AreaPolygon } from './AreaPolygon';
import type { Area } from '@/services/area';

// CSS keyframes for fade-in animation (50ms for snappy feel)
// Note: Don't use transform in animation as it conflicts with placement rotation
const fadeInKeyframes = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;

interface CanvasProps {
  floorplan: Floorplan;
  placements: Placement[];
  items: Item[];
  bom: FloorplanBom | null;
  placementAddons: React.MutableRefObject<Map<number, number[]>>;
  onPlacementDelete: (id: number) => void;
  onPlacementUpdate: (id: number, data: { x?: number; y?: number; width?: number; height?: number; rotation?: number; item_variant_id?: number; addon_ids?: number[] }, isFinal?: boolean) => void;
  isResizingRef?: React.MutableRefObject<boolean>;
  zoomRef?: React.MutableRefObject<{ zoom: number; pan: { x: number; y: number } }>;
  scaleRef?: React.MutableRefObject<{ scaleX: number; scaleY: number }>;
  isDuplicating?: boolean;
  isItemDragging?: boolean;
  visibleCategoryIds?: Set<number>;
  areas?: Area[];
  hiddenAreaIds?: Set<number>;
  selectedAreaId?: number | null;
  onSelectArea?: (id: number | null) => void;
  onAreaMove?: (id: number, dx: number, dy: number) => void;
  onAreaVertexMove?: (id: number, vertexIndex: number, x: number, y: number) => void;
  onAreaVerticesReplace?: (id: number, updates: { index: number; x: number; y: number }[]) => void;
  onAreaVertexAdd?: (id: number, afterIndex: number, x: number, y: number) => void;
  onAreaVertexDelete?: (id: number, vertexIndex: number) => void;
  onAreaVerticesCommit?: (id: number) => void;
  onAreaEdit?: (id: number) => void;
  onAreaDelete?: (id: number) => void;
  onCanvasBoundsChange?: (bounds: { width: number; height: number }) => void;
}

interface DraggablePlacementProps {
  placement: Placement;
  item: Item | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (x: number, y: number, width: number, height: number, isFinal?: boolean) => void;
  onRotate: (rotation: number, isFinal?: boolean) => void;
  onEdit: () => void;
  parentIsResizingRef?: React.MutableRefObject<boolean>;
  scaleX: number;
  scaleY: number;
  maxNaturalWidth: number;
  maxNaturalHeight: number;
  isNew?: boolean;
  isCtrlPressed?: boolean;
  isDuplicating?: boolean;
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
  onRotate,
  onEdit,
  parentIsResizingRef,
  scaleX,
  scaleY,
  maxNaturalWidth,
  maxNaturalHeight,
  isNew,
  isCtrlPressed,
  isDuplicating,
}: DraggablePlacementProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const resizeStartRef = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    anchorX: 0,
    anchorY: 0,
    draggedCornerX: 0,
    draggedCornerY: 0,
    signX: 1,
    signY: 1,
    axisUX: 1,
    axisUY: 0,
    axisVX: 0,
    axisVY: 1,
  });
  const aspectRatioRef = useRef(1);
  const rotationStartRef = useRef({ startAngle: 0, angleOffset: 0, centerX: 0, centerY: 0 });
  
  // Track pending values during resize/rotate for final update
  const pendingResizeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const pendingRotationRef = useRef<number | null>(null);
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `placement-${placement.id}`,
    data: {
      placementId: placement.id,
      type: 'placement',
      // Include dimensions so drop calculation can account for grab offset
      width: placement.width * scaleX,
      height: placement.height * scaleY,
      isCtrlPressed,
    },
    disabled: isResizing || isSelected,
  });

  const dragTransform = transform ? CSS.Translate.toString(transform) : '';
  const rotationTransform = `rotate(${placement.rotation || 0}deg)`;
  const combinedTransform = dragTransform
    ? `${dragTransform} ${rotationTransform}`
    : rotationTransform;

  const handleClick = (e: React.MouseEvent) => {
    if (isResizing) return;
    e.stopPropagation();
    onSelect();
  };

  const startResize = (e: React.MouseEvent, visualCorner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);

    if (parentIsResizingRef) {
      parentIsResizingRef.current = true;
    }

    // Store current aspect ratio for locked mode
    aspectRatioRef.current = placement.width / placement.height;

    const cornerSigns: Record<'nw' | 'ne' | 'sw' | 'se', { x: 1 | -1; y: 1 | -1 }> = {
      nw: { x: -1, y: -1 },
      ne: { x: 1, y: -1 },
      sw: { x: -1, y: 1 },
      se: { x: 1, y: 1 },
    };

    const signs = cornerSigns[visualCorner];
    const radians = ((placement.rotation || 0) * Math.PI) / 180;
    const axisUX = Math.cos(radians);
    const axisUY = Math.sin(radians);
    const axisVX = -Math.sin(radians);
    const axisVY = Math.cos(radians);

    const centerX = placement.x + placement.width / 2;
    const centerY = placement.y + placement.height / 2;

    const draggedLocalX = signs.x * (placement.width / 2);
    const draggedLocalY = signs.y * (placement.height / 2);
    const anchorLocalX = -draggedLocalX;
    const anchorLocalY = -draggedLocalY;

    const draggedCornerX = centerX + (draggedLocalX * axisUX) + (draggedLocalY * axisVX);
    const draggedCornerY = centerY + (draggedLocalX * axisUY) + (draggedLocalY * axisVY);
    const anchorX = centerX + (anchorLocalX * axisUX) + (anchorLocalY * axisVX);
    const anchorY = centerY + (anchorLocalX * axisUY) + (anchorLocalY * axisVY);

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: placement.width,
      height: placement.height,
      anchorX,
      anchorY,
      draggedCornerX,
      draggedCornerY,
      signX: signs.x,
      signY: signs.y,
      axisUX,
      axisUY,
      axisVX,
      axisVY,
    };
  };

  const startRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsRotating(true);

    if (parentIsResizingRef) {
      parentIsResizingRef.current = true;
    }

    // Get the placement element (parent of rotation handle)
    const rotationHandle = e.currentTarget;
    const placementElement = rotationHandle.parentElement;

    if (placementElement) {
      // Get the actual visual center of the rotated element
      const rect = placementElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate the angle from center to the rotation handle itself
      // This gives us the current "handle angle"
      const handleRect = rotationHandle.getBoundingClientRect();
      const handleCenterX = handleRect.left + handleRect.width / 2;
      const handleCenterY = handleRect.top + handleRect.height / 2;
      const handleAngle = Math.atan2(handleCenterY - centerY, handleCenterX - centerX) * (180 / Math.PI);

      // Calculate the angle from center to mouse
      const mouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

      // The offset is the difference between mouse angle and handle angle
      // This accounts for where on the handle the user clicked
      const angleOffset = mouseAngle - handleAngle;

      rotationStartRef.current = {
        startAngle: mouseAngle,
        angleOffset,
        centerX,
        centerY,
      };
    }
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const {
        x,
        y,
        width,
        height,
        anchorX,
        anchorY,
        draggedCornerX,
        draggedCornerY,
        signX,
        signY,
        axisUX,
        axisUY,
        axisVX,
        axisVY,
      } = resizeStartRef.current;
      const deltaX = (e.clientX - x) / scaleX;
      const deltaY = (e.clientY - y) / scaleY;

      let newWidth = width;
      let newHeight = height;

      // Track Shift key for aspect ratio lock
      const shiftHeld = e.shiftKey;

      // Snap to 5px increments when Ctrl is held during resize
      const snapToGrid = (value: number) => {
        if (e.ctrlKey || e.metaKey) {
          return Math.round(value / 5) * 5;
        }
        return value;
      };

      // Mouse target for dragged corner in floorplan natural coordinates
      const targetDraggedX = draggedCornerX + deltaX;
      const targetDraggedY = draggedCornerY + deltaY;

      // Vector from fixed anchor corner to dragged corner in world space
      const vectorX = targetDraggedX - anchorX;
      const vectorY = targetDraggedY - anchorY;

      // Convert to local (unrotated) placement space
      const localX = (vectorX * axisUX) + (vectorY * axisUY);
      const localY = (vectorX * axisVX) + (vectorY * axisVY);

      // Signed deltas to avoid corner flipping
      const widthRaw = signX * localX;
      const heightRaw = signY * localY;

      const clampSize = (value: number) => Math.max(5, Math.min(500, value));

      // Calculate new dimensions based on resize mode
      if (shiftHeld) {
        // Free resize - allow independent width/height changes
        newWidth = snapToGrid(clampSize(widthRaw));
        newHeight = snapToGrid(clampSize(heightRaw));
      } else {
        // Maintain aspect ratio by scaling along the diagonal from anchor to dragged corner
        const currentRatio = aspectRatioRef.current;
        const diagonalX = signX * width;
        const diagonalY = signY * height;
        const diagonalLengthSquared = (diagonalX * diagonalX) + (diagonalY * diagonalY);

        let scale = 1;
        if (diagonalLengthSquared > 0) {
          scale = ((localX * diagonalX) + (localY * diagonalY)) / diagonalLengthSquared;
        }

        let scaledWidth = clampSize(width * scale);
        let scaledHeight = scaledWidth / currentRatio;

        if (scaledHeight > 500) {
          scaledHeight = 500;
          scaledWidth = scaledHeight * currentRatio;
        } else if (scaledHeight < 5) {
          scaledHeight = 5;
          scaledWidth = scaledHeight * currentRatio;
        }

        newWidth = e.ctrlKey || e.metaKey ? snapToGrid(scaledWidth) : scaledWidth;
        newHeight = newWidth / currentRatio;

        if (newHeight > 500) {
          newHeight = 500;
          newWidth = newHeight * currentRatio;
        } else if (newHeight < 5) {
          newHeight = 5;
          newWidth = newHeight * currentRatio;
        }
      }

      // Rebuild center from fixed opposite corner (anchor) + new half extents
      const anchorLocalX = -signX * (newWidth / 2);
      const anchorLocalY = -signY * (newHeight / 2);
      const centerX = anchorX - ((anchorLocalX * axisUX) + (anchorLocalY * axisVX));
      const centerY = anchorY - ((anchorLocalX * axisUY) + (anchorLocalY * axisVY));

      let newX = centerX - (newWidth / 2);
      let newY = centerY - (newHeight / 2);

      if (maxNaturalWidth > 0 && maxNaturalHeight > 0) {
        newX = Math.max(0, Math.min(newX, maxNaturalWidth - newWidth));
        newY = Math.max(0, Math.min(newY, maxNaturalHeight - newHeight));
      }

      // Store pending values and update UI optimistically (isFinal=false)
      pendingResizeRef.current = { x: newX, y: newY, width: newWidth, height: newHeight };
      onResize(newX, newY, newWidth, newHeight, false);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (parentIsResizingRef) {
        parentIsResizingRef.current = false;
      }
      
      // Send final update to database with isFinal=true
      if (pendingResizeRef.current) {
        const { x, y, width, height } = pendingResizeRef.current;
        onResize(x, y, width, height, true);
        pendingResizeRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, scaleX, scaleY, maxNaturalWidth, maxNaturalHeight]);

  useEffect(() => {
    if (!isRotating) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { angleOffset, centerX, centerY } = rotationStartRef.current;

      // Calculate current angle from center to mouse
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

      // The rotation is the current angle minus the offset
      // This makes the item rotate so the handle points toward the mouse
      let newRotation = (currentAngle - angleOffset + 90) % 360;
      // +90 because the rotation handle is positioned at the top (-top-14)
      // which is at -90 degrees from the right (0 degrees)

      // Ensure rotation is in 0-359 range (360 = 0)
      if (newRotation < 0) {
        newRotation += 360;
      }
      if (newRotation >= 360) {
        newRotation = 0;
      }

      // Snap to 15-degree increments when Cmd/Ctrl is held
      if (e.metaKey || e.ctrlKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }

      // Store pending value and update UI optimistically (isFinal=false)
      pendingRotationRef.current = newRotation;
      onRotate(newRotation, false);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      if (parentIsResizingRef) {
        parentIsResizingRef.current = false;
      }
      
      // Send final update to database with isFinal=true
      if (pendingRotationRef.current !== null) {
        onRotate(pendingRotationRef.current, true);
        pendingRotationRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRotating, onRotate]);

  const variant = item?.variants?.find(v => v.id === placement.item_variant_id);
  const imageUrl = placement.item_variant_image_path 
    ? itemService.getImageUrl(placement.item_variant_image_path)
    : variant?.image_path 
    ? itemService.getImageUrl(variant.image_path)
    : item?.preview_image 
    ? itemService.getImageUrl(item.preview_image)
    : null;
  const displayName = item?.name || 'Unknown';

  return (
    <div
      ref={setNodeRef}
      {...(isSelected ? {} : listeners)}
      {...attributes}
      data-placement="true"
      style={{
        position: 'absolute',
        left: placement.x * scaleX,
        top: placement.y * scaleY,
        width: placement.width * scaleX,
        height: placement.height * scaleY,
        transform: combinedTransform,
        transformOrigin: 'center center',
        zIndex: isResizing ? 200 : isDragging ? 100 : isNew ? 1 : 1,
        animation: undefined,
      }}
      className={`rounded select-none group ${
        isSelected
          ? 'ring-2 ring-destructive shadow-lg z-50'
          : isDuplicating && isDragging
            ? 'border-2 border-dashed border-primary overflow-hidden opacity-60'
            : 'border-2 border-primary overflow-hidden'
      } ${isDragging ? (isCtrlPressed ? 'cursor-copy z-50' : 'cursor-grabbing z-50') : isResizing ? 'cursor-nwse-resize z-50' : isSelected ? 'cursor-default' : isCtrlPressed ? 'cursor-copy' : 'cursor-move'}`}
      title={displayName}
      onClick={handleClick}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={displayName}
          className="w-full h-full object-fill relative z-10"
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
            className="absolute -top-12 -left-12 w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-lg z-30 transition-transform hover:scale-110 border-[2.5px] border-background"
            title="Edit placement"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-12 -right-12 w-9 h-9 flex items-center justify-center bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 shadow-lg z-30 transition-transform hover:scale-110 border-[2.5px] border-background"
            title="Delete placement"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div
            className="absolute -top-14 left-1/2 -translate-x-1/2 p-2 bg-primary border-2 border-background rounded-full cursor-grab shadow-md z-50 transition-transform hover:scale-110"
            onMouseDown={(e) => startRotate(e)}
            onPointerDown={(e) => { e.stopPropagation(); }}
            title="Drag to rotate"
          >
            <RotateCw className="w-3 h-3 text-primary-foreground" />
          </div>

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
            {Math.round(placement.width)}×{Math.round(placement.height)} • {Math.round((placement.rotation || 0) % 360)}°
          </div>
        </>
      )}
    </div>
  );
}

interface PlacementEditModalProps {
  placement: Placement | null;
  floorplanId: number;
  items: Item[];
  bom: FloorplanBom | null;
  placementAddons: React.MutableRefObject<Map<number, number[]>>;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (variantId: number, selectedAddons: number[]) => Promise<void>;
  onDelete?: () => void;
}

function PlacementEditModal({ placement, floorplanId, items, bom, placementAddons, isOpen, onClose, onUpdate, onDelete }: PlacementEditModalProps) {
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
  const lastAddonFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const loadItemData = async () => {
      if (!placement) {
        lastAddonFetchKeyRef.current = null;
        setItem(null);
        setVariants([]);
        setAddons([]);
        setIsItemUnavailable(false);
        return;
      }

      try {
        lastAddonFetchKeyRef.current = null;
        setIsLoading(true);
        setError('');
        setIsItemUnavailable(false);

        // Get current addon IDs - prioritize placement-specific memory, then BOM
        // This ensures recently updated placements show correct addons even before BOM refreshes
        let currentAddonIds: number[] = [];
        let foundInPlacementAddons = false;
        
        // First check placement-specific addon tracking (most reliable)
        if (placementAddons.current) {
          const placementAddonIds = placementAddons.current.get(placement.id);
          if (placementAddonIds !== undefined) {
            currentAddonIds = placementAddonIds;
            foundInPlacementAddons = true;
          }
        }
        
        // Fallback to BOM data
        if (!foundInPlacementAddons && bom) {
          const bomId = placement.bom_id;
          const group = bomId ? bom.groups.find(g =>
            g.bomEntryIds?.includes(bomId) || g.mainEntry.id === bomId
          ) : undefined;
          if (group) {
            currentAddonIds = group.children.map(child => child.variant_id);
          }
        }

        setSelectedVariantId(placement.item_variant_id);
        setOriginalVariantId(placement.item_variant_id);

        // Set currently selected addons (from BOM)
        const currentAddons = new Set<number>(currentAddonIds);
        setSelectedAddons(currentAddons);

        // Store original addons for restoration when switching back
        setOriginalAddons(new Set(currentAddonIds));

        // Use item from props instead of fetching
        const itemData = items.find(i => i.id === placement.item_id);

        if (!itemData) {
          // Item not found in props - may have been deleted
          setIsItemUnavailable(true);
          setItem(null);
          setVariants([]);
          setAddons([]);
        } else {
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
              // Add-ons are loaded by the selectedVariantId effect below.
              // Keeping it in one place avoids duplicate requests on modal open.
              setAddons([]);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load placement data:', err);
        setError('Failed to load placement details');
      } finally {
        setIsLoading(false);
      }
    };

    loadItemData();
  }, [placement, floorplanId, items, bom]);

  useEffect(() => {
    const loadAddons = async () => {
      if (!selectedVariantId || !placement) return;

      // Unavailable/inactive/deleted items are read-only and should not fetch add-ons
      if (isItemUnavailable) {
        setAddons([]);
        return;
      }

      // Variant may not exist in active list (inactive/deleted), avoid 404 request
      const variantExists = variants.some(v => v.id === selectedVariantId);
      if (!variantExists) {
        setAddons([]);
        return;
      }

      const fetchKey = `${placement.id}:${selectedVariantId}`;

      // Avoid duplicate requests for the same placement+variant combination
      if (lastAddonFetchKeyRef.current === fetchKey) {
        if (originalVariantId !== null && selectedVariantId === originalVariantId) {
          setSelectedAddons(new Set(originalAddons));
        }
        return;
      }

      try {
        lastAddonFetchKeyRef.current = fetchKey;
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
        // Allow retry if request failed
        lastAddonFetchKeyRef.current = null;
      }
    };

    loadAddons();
  }, [selectedVariantId, placement, originalVariantId, originalAddons, isItemUnavailable, variants]);

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
          <DialogDescription>
            Customize the product style and select optional add-ons for this placement.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-1">
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
                This product is no longer available in the catalog. You can delete this placement, but you cannot edit it.
              </AlertDescription>
            </Alert>

            {bom && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  {(() => {
                    // Find the BOM group for this placement
                    const pBomId = placement?.bom_id;
                    const group = pBomId ? bom.groups.find((g: import("@/services/bom").BomGroup) =>
                      g.bomEntryIds?.includes(pBomId) || g.mainEntry.id === pBomId
                    ) : undefined;
                    const mainEntry = group?.mainEntry;
                    const mainEntryImageUrl = mainEntry?.picture_path 
                      ? itemService.getImageUrl(mainEntry.picture_path)
                      : null;
                    return mainEntryImageUrl && mainEntry ? (
                      <img
                        src={mainEntryImageUrl}
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
                    const pBomId2 = placement?.bom_id;
                    const group = pBomId2 ? bom.groups.find((g: import('@/services/bom').BomGroup) =>
                        g.bomEntryIds?.includes(pBomId2) || g.mainEntry.id === pBomId2
                      ) : undefined;
                      const mainEntry = group?.mainEntry;
                      return (
                        <>
                          <p className="font-medium">{mainEntry?.item_name || 'Unknown Product'}</p>
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
              const pBomId3 = placement?.bom_id;
              const group = pBomId3 ? bom?.groups.find((g: import("@/services/bom").BomGroup) =>
                g.bomEntryIds?.includes(pBomId3) || g.mainEntry.id === pBomId3
              ) : undefined;
              return group && group.children.length > 0 ? (
                <div>
                  <Label className="block text-sm font-medium mb-2">Add-ons</Label>
                  <div className="space-y-2">
                    {group.children.map((child: import("@/services/bom").BomEntry) => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between p-2 rounded-lg border bg-background border-border opacity-75"
                      >
                        <div className="flex items-center gap-3">
                          {child.picture_path ? (
                            <img
                              src={itemService.getImageUrl(child.picture_path)}
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
                <p className="text-muted-foreground">
                  Rotation: {Math.round((placement.rotation || 0) % 360)}°
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
                      src={itemService.getImageUrl(selectedVariant.image_path)}
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
                          <Checkbox
                            checked={selectedAddons.has(addon.addon_variant.id)}
                            onCheckedChange={() => handleAddonToggle(addon.addon_variant.id)}
                            disabled={!addon.addon_variant.is_active}
                          />
                          {addon.addon_variant.image_path ? (
                            <img
                              src={itemService.getImageUrl(addon.addon_variant.image_path)}
                              alt={addon.addon_variant.item_name}
                              className="w-10 h-10 object-contain rounded bg-white flex-shrink-0"
                          />
                        ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                              No img
                            </div>
                          )}
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
                <p className="text-muted-foreground">
                  Rotation: {Math.round((placement.rotation || 0) % 360)}°
                </p>
              </div>
            )}
          </div>
        )}
        </div>

        <div className="flex justify-end gap-2">
          {isItemUnavailable ? (
            <>
              <Button variant="outline" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete?.();
                  onClose();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Placement
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading || isSaving || !selectedVariantId}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Update
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
  bom,
  placementAddons,
  onPlacementDelete,
  onPlacementUpdate,
  isResizingRef,
  zoomRef,
  scaleRef,
  isDuplicating,
  isItemDragging,
  visibleCategoryIds,
  areas,
  hiddenAreaIds,
  selectedAreaId,
  onSelectArea,
  onAreaMove,
  onAreaVertexMove,
  onAreaVerticesReplace,
  onAreaVertexAdd,
  onAreaVertexDelete,
  onAreaVerticesCommit,
  onAreaEdit,
  onAreaDelete,
  onCanvasBoundsChange,
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

  // Track Ctrl key state for duplicate functionality
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(true);
      }
      if (e.key === 'Escape') {
        setSelectedPlacementId(null);
        onSelectArea?.(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onSelectArea]);

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

  // Native wheel event listener for zoom (uses passive: false to prevent browser default)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      if (!e.metaKey && !e.ctrlKey) return;

      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));

      if (newZoom !== zoom) {
        if (imageRef.current && imageDisplaySize.width > 0) {
          // Zoom towards mouse position
          // Get the image's actual position on screen
          const imageRect = imageRef.current.getBoundingClientRect();

          // Mouse position relative to image top-left corner
          const mouseX = e.clientX - imageRect.left;
          const mouseY = e.clientY - imageRect.top;

          // Content point under mouse (in image content coordinates 0-1)
          // mouseX = contentX * imageWidth = contentX * (imageDisplaySize.width * zoom)
          const contentX = mouseX / (imageDisplaySize.width * zoom);
          const contentY = mouseY / (imageDisplaySize.height * zoom);

          // After zoom, the image will have new dimensions due to flexbox centering
          // The natural top-left would shift, but we add pan to compensate
          // We want: newScreenX = newImageLeft + contentX * newWidth + newPanX = mouseX
          // The flexbox centering means: newImageLeft = containerCenter - newWidth/2
          // So: newPanX = mouseX - (containerCenter - newWidth/2) - contentX * newWidth
          // But pan is relative to centered position, so:
          // newPanX = mouseX - contentX * newWidth - (containerCenter - newWidth/2) + (containerCenter - newWidth/2)
          // Actually simpler: pan is the offset from the centered position
          // Visual position = centeredPosition + pan
          // We want visual position of content point = mouse position
          // centeredPosition + pan + content * zoom = mouse
          // pan = mouse - centeredPosition - content * zoom
          // After zoom: newPan = mouse - newCenteredPosition - content * newZoom

          // Get container center
          const containerRect = container.getBoundingClientRect();
          const containerCenterX = containerRect.left + containerRect.width / 2;
          const containerTopY = containerRect.top;

          // New centered position (where image would be without pan)
          const newWidth = imageDisplaySize.width * newZoom;
          const newHeight = imageDisplaySize.height * newZoom;
          const newCenteredX = containerCenterX - newWidth / 2;
          const newCenteredY = containerTopY;

          // New pan to keep content point under mouse
          const newPanX = e.clientX - (newCenteredX + contentX * newWidth);
          const newPanY = e.clientY - (newCenteredY + contentY * newHeight);

          setZoom(newZoom);
          setPan({ x: newPanX, y: newPanY });
        } else {
          // Image not loaded yet, just change zoom without mouse positioning
          setZoom(newZoom);
        }
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [zoom, setZoom, setPan, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP]);

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

  useEffect(() => {
    if (imageNaturalSize.width > 0 && imageNaturalSize.height > 0) {
      onCanvasBoundsChange?.(imageNaturalSize);
    }
  }, [imageNaturalSize.width, imageNaturalSize.height, onCanvasBoundsChange]);

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

  // Update scaleRef for DragOverlay sizing
  useEffect(() => {
    if (scaleRef) {
      scaleRef.current = { scaleX: scaledScaleX, scaleY: scaledScaleY };
    }
  }, [scaleRef, scaledScaleX, scaledScaleY]);

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

  const handleExportImage = async () => {
    try {
      await exportFloorplanImage(floorplan, placements, items, {}, visibleCategoryIds, areas, hiddenAreaIds);
    } catch (err) {
      console.error('Failed to export floorplan:', err);
    }
  };

  // Pan functions - only pan with Ctrl/Cmd + mouse movement
  const startPan = (e: React.MouseEvent) => {
    // Only pan when holding Ctrl or Cmd key
    if (!e.ctrlKey && !e.metaKey) return;
    
    // Don't pan if clicking on a placement (to allow Ctrl+drag duplicate)
    const target = e.target as HTMLElement;
    if (target.closest('[data-placement="true"]')) {
      return;
    }
    
    // Allow left click (0) or middle click (1), but not right click (2)
    if (e.button !== 0 && e.button !== 1) return;
    
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

  // Arrow key panning - only with Ctrl/Cmd
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only pan when holding Ctrl or Cmd
      if (!e.ctrlKey && !e.metaKey) return;
      
      const panStep = 50;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setPan(prev => ({ ...prev, x: prev.x + panStep }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPan(prev => ({ ...prev, x: prev.x - panStep }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setPan(prev => ({ ...prev, y: prev.y + panStep }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPan(prev => ({ ...prev, y: prev.y - panStep }));
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom]);

  const handleCanvasClick = () => {
    setSelectedPlacementId(null);
    onSelectArea?.(null);
  };

  const handleResize = (placementId: number, x: number, y: number, width: number, height: number, isFinal?: boolean) => {
    // Always send to parent for optimistic UI updates
    // The parent (ProjectDashboard) will handle whether to save to DB based on isFinal
    onPlacementUpdate(placementId, { x, y, width, height }, isFinal);
  };

  const handleRotate = (placementId: number, rotation: number, isFinal?: boolean) => {
    // Always send to parent for optimistic UI updates
    // The parent (ProjectDashboard) will handle whether to save to DB based on isFinal
    onPlacementUpdate(placementId, { rotation }, isFinal);
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
        className={`relative w-full h-full flex items-start justify-center transition-colors ${
          isOver ? 'bg-primary/5' : 'bg-background'
        } ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
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

              {/* Areas — sorted by id (newest on top), selected area rendered last */}
              {areas && areas.length > 0 && (
                <svg
                  className="absolute inset-0"
                  style={{ width: '100%', height: '100%', pointerEvents: isItemDragging ? 'none' : undefined }}
                  viewBox={`0 0 ${imageNaturalSize.width} ${imageNaturalSize.height}`}
                  preserveAspectRatio="xMinYMin meet"
                >
                  <rect width="100%" height="100%" fill="none" style={{ pointerEvents: 'none' }} />
                  <g>
                    {[...areas].filter(a => !hiddenAreaIds?.has(a.id)).sort((a, b) => {
                      const aSelected = a.id === selectedAreaId ? 1 : 0;
                      const bSelected = b.id === selectedAreaId ? 1 : 0;
                      if (aSelected !== bSelected) return aSelected - bSelected;
                      return a.id - b.id;
                    }).map(area => (
                      <AreaPolygon
                        key={area.id}
                        area={area}
                        isSelected={selectedAreaId === area.id}
                        scale={(Math.min(scaleX, scaleY) * zoom) || 1}
                        onSelect={(id) => { setSelectedPlacementId(null); onSelectArea?.(id); }}
                        onMove={onAreaMove || (() => {})}
                        onVertexMove={onAreaVertexMove || (() => {})}
                        onVerticesReplace={onAreaVerticesReplace || (() => {})}
                        onVertexAdd={onAreaVertexAdd || (() => {})}
                        onVertexDelete={onAreaVertexDelete || (() => {})}
                        onVerticesCommit={onAreaVerticesCommit || (() => {})}
                      />
                    ))}
                  </g>
                </svg>
              )}

              {/* Area action buttons — HTML overlay, same as item placement buttons */}
              {(() => {
                if (!selectedAreaId || !areas || hiddenAreaIds?.has(selectedAreaId)) return null;
                const area = areas.find(a => a.id === selectedAreaId);
                if (!area) return null;

                // Convert area bounding box from natural image coords to screen coords
                const scaleX = imageNaturalSize.width > 0
                  ? (imageRef.current?.clientWidth || 0) / imageNaturalSize.width
                  : 1;
                const scaleY = imageNaturalSize.height > 0
                  ? (imageRef.current?.clientHeight || 0) / imageNaturalSize.height
                  : 1;

                const verts = area.vertices;
                if (verts.length === 0) return null;
                const aMinX = Math.min(...verts.map(v => v.x));
                const aMinY = Math.min(...verts.map(v => v.y));
                const aMaxX = Math.max(...verts.map(v => v.x));

                const screenLeft = aMinX * scaleX;
                const screenTop = aMinY * scaleY;
                const screenRight = aMaxX * scaleX;

                return (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAreaEdit?.(area.id); }}
                      className="absolute w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-lg z-30 transition-transform hover:scale-110 border-[2.5px] border-background"
                      style={{ left: screenLeft - 48, top: screenTop - 48 }}
                      title="Edit area"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAreaDelete?.(area.id); }}
                      className="absolute w-9 h-9 flex items-center justify-center bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 shadow-lg z-30 transition-transform hover:scale-110 border-[2.5px] border-background"
                      style={{ left: screenRight + 12, top: screenTop - 48 }}
                      title="Delete area"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                );
              })()}

              {[...placements]
                .filter((placement) => {
                  // Filter by visible categories
                  // Item visibility controlled only by category (Products tab)
                  if (!visibleCategoryIds) return true;
                  const item = items.find((i) => i.id === placement.item_id);
                  if (!item) return true;
                  return visibleCategoryIds.has(item.category_id);
                })
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
                      onSelect={() => { setSelectedPlacementId(placement.id); onSelectArea?.(null); }}
                      onDelete={() => {
                        onPlacementDelete(placement.id);
                        setSelectedPlacementId(null);
                      }}
                      onResize={(x, y, width, height, isFinal) => handleResize(placement.id, x, y, width, height, isFinal)}
                      onRotate={(rotation, isFinal) => handleRotate(placement.id, rotation, isFinal)}
                      onEdit={() => setEditingPlacement(placement)}
                      parentIsResizingRef={isResizingRef}
                      scaleX={scaledScaleX}
                      scaleY={scaledScaleY}
                      maxNaturalWidth={imageNaturalSize.width}
                      maxNaturalHeight={imageNaturalSize.height}
                      isNew={isNewPlacement}
                      isCtrlPressed={isCtrlPressed}
                      isDuplicating={isDuplicating}
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
            <div className="h-px bg-border my-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleExportImage}
              title="Export floorplan image"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="bg-background/90 border rounded-lg shadow-lg px-2 py-1 text-center">
            <span className="text-xs font-medium">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Help tooltip — small ? icon, expands on hover */}
        <div className="absolute bottom-2 left-2 z-20 group">
          <div className="px-2.5 py-1 rounded-md bg-muted/80 border border-border flex items-center gap-1.5 text-xs text-muted-foreground cursor-help">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
            Shortcuts
          </div>
          <div className="hidden group-hover:block absolute bottom-8 left-0 w-64 bg-popover border border-border rounded-lg shadow-lg p-3 text-xs text-popover-foreground space-y-1.5">
            <p className="font-semibold text-sm mb-2">Shortcuts</p>
            <p><span className="text-muted-foreground">Items:</span> Click to select, drag corners to resize</p>
            <p><span className="text-muted-foreground">Shift+drag:</span> Stretch (free resize)</p>
            <p><span className="text-muted-foreground">Ctrl+drag corner:</span> 5px snap</p>
            <p><span className="text-muted-foreground">Ctrl+drag item:</span> Duplicate</p>
            <p className="border-t border-border pt-1.5 mt-1.5"><span className="text-muted-foreground">Areas:</span> Click to select, drag to move</p>
            <p><span className="text-muted-foreground">Shift+drag corner:</span> Stretch area</p>
            <p><span className="text-muted-foreground">Ctrl+drag corner:</span> Free vertex move</p>
            <p><span className="text-muted-foreground">Ctrl+Shift+drag:</span> Angle snap (5°)</p>
            <p><span className="text-muted-foreground">Ctrl+click edge:</span> Add vertex</p>
            <p><span className="text-muted-foreground">Ctrl+right-click vertex:</span> Remove vertex</p>
            <p><span className="text-muted-foreground">Esc:</span> Deselect</p>
            <p className="border-t border-border pt-1.5 mt-1.5"><span className="text-muted-foreground">Canvas:</span> Ctrl+wheel to zoom, Ctrl+drag to pan</p>
          </div>
        </div>

        <PlacementEditModal
          key={editingPlacement?.id || 'closed'}
          placement={editingPlacement}
          floorplanId={floorplan.id}
          items={items}
          bom={bom}
          placementAddons={placementAddons}
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
