import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService, type Project } from '@/services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '@/services/floorplan';
import { placementService, type Placement, type CreatePlacementDTO } from '@/services/placement';
import { itemService, type Item } from '@/services/item';
import { variantAddonService } from '@/services/variant-addon';
import { bomService } from '@/services/bom';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { FloorplanBom } from '@/services/bom';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { ConfiguratorCanvas, ItemPalette, BOMPanel } from '@/components/configurator';
import type { ItemPaletteRef } from '@/components/configurator';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import { DeleteFloorplanDialog } from '@/components/floorplans/DeleteFloorplanDialog';
import { FloorplanTabs } from '@/components/floorplans/FloorplanTabs';
import { InvoiceSettingsModal, SummaryTab } from '@/components/invoice';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { EmptyFloorplanState } from '@/components/projects/EmptyFloorplanState';

import { extractErrorMessage, formatCurrency } from '@/utils';
import { useItemMemory } from '@/hooks/useItemMemory';
import { useBomCalculations } from '@/hooks/useBomCalculations';

const generateProjectNumber = (project: Project): string => {
  const date = new Date(project.created_at);
  const formattedDate = date.toISOString().split('T')[0];
  const customerName = project.customer_name || 'Unknown';
  const address = project.customer_address || 'No Address';
  return `${formattedDate}_${customerName}_${address}`;
};

const ProjectDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [activeFloorplan, setActiveFloorplan] = useState<Floorplan | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotFound, setShowNotFound] = useState(false);
  const [error, setError] = useState('');
  const [activeDragItem, setActiveDragItem] = useState<Item | null>(null);
  const [, setActiveDragPlacement] = useState<Placement | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isCtrlDraggingItem, setIsCtrlDraggingItem] = useState(false);
  const [placementsVersion, setPlacementsVersion] = useState(0);
  const [isDropping, setIsDropping] = useState(false);
  
  // BOM state - Map of floorplanId to BOM data
  const [floorplanBoms, setFloorplanBoms] = useState<Map<number, FloorplanBom>>(new Map());
  
  // Update BOM for a specific floorplan
  const setFloorplanBom = useCallback((floorplanId: number, bom: FloorplanBom) => {
    setFloorplanBoms((prev) => new Map(prev).set(floorplanId, bom));
  }, []);

  // BOM calculations
  const { floorplanTotals, projectTotal } = useBomCalculations(floorplans, floorplanBoms);

  // Floorplan modal state
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [floorplanToEdit, setFloorplanToEdit] = useState<Floorplan | null>(null);
  const [showDeleteFloorplanModal, setShowDeleteFloorplanModal] = useState(false);
  const [floorplanToDelete, setFloorplanToDelete] = useState<Floorplan | null>(null);

  // Invoice settings state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);

  // Active tab state for right panel
  const [activeTab, setActiveTab] = useState('products');

  // Layer visibility state - all categories visible by default
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(new Set());

  // Persistent memory for item sizes (localStorage-backed, per-project)
  const {
    itemSizeMemory,
    itemVariantMemory,
    persistSizeMemory,
    persistVariantMemory,
    clearItemMemory,
  } = useItemMemory(projectId);
  
  const isResizingRef = useRef(false);
  const canvasZoomRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const canvasScaleRef = useRef({ scaleX: 1, scaleY: 1 });
  
  // Ref to access ItemPalette's aspect ratio cache
  const itemPaletteRef = useRef<ItemPaletteRef>(null);

  // Track addon configuration per-placement (not persisted, just for modal consistency)
  const placementAddons = useRef<Map<number, number[]>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const fetchProjectData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setShowNotFound(false);
      const [projectData, floorplansData, itemsResult] = await Promise.all([
        projectService.getById(projectId, signal),
        floorplanService.getAll(projectId, signal),
        itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }),
      ]);

      setProject(projectData);
      setFloorplans(floorplansData);
      setItems(itemsResult.items);

      // Initialize visible categories with all category IDs from items
      const categoryIds = new Set(itemsResult.items.map(item => item.category_id));
      setVisibleCategories(categoryIds);
      
      // Extract invoice settings from project data
      setInvoiceSettings({
        discount_percentage: projectData.discount_percentage,
        discount_usd: projectData.discount_usd,
        services_percentage: projectData.services_percentage,
        services_usd: projectData.services_usd,
        local_currency_code: projectData.local_currency_code,
        exchange_rate: projectData.exchange_rate,
      });
      
      if (floorplansData.length > 0) {
        if (!activeFloorplan) {
          setActiveFloorplan(floorplansData[0]);
        } else {
          // Update active floorplan with fresh data from API
          const updatedFloorplan = floorplansData.find(fp => fp.id === activeFloorplan.id);
          if (updatedFloorplan) {
            setActiveFloorplan(updatedFloorplan);
          }
        }
      }

      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(extractErrorMessage(err, 'Failed to load project data'));
        // Only show "not found" if we get a 404
        if (err.response?.status === 404) {
          setShowNotFound(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlacements = async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const placementsData = await placementService.getAll(floorplanId, signal);
      setPlacements(placementsData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load placements:', err);
      }
    }
  };

  const fetchFloorplanBom = async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const bomData = await bomService.getBomForFloorplan(floorplanId, signal);
      setFloorplanBom(floorplanId, bomData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load BOM:', err);
      }
    }
  };

  // Fetch BOM for all floorplans when placements change (debounced)
  const bomFetchTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    // Skip initial render - only run when placementsVersion changes from user actions
    if (placementsVersion === 0) return;
    
    // Clear any pending fetch
    if (bomFetchTimeoutRef.current) {
      clearTimeout(bomFetchTimeoutRef.current);
    }

    // Debounce BOM fetch to avoid flicker during rapid placements
    bomFetchTimeoutRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      floorplans.forEach(fp => {
        fetchFloorplanBom(fp.id, controller.signal);
      });
    }, 300);

    return () => {
      if (bomFetchTimeoutRef.current) {
        clearTimeout(bomFetchTimeoutRef.current);
      }
    };
  }, [placementsVersion, floorplans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial BOM fetch when floorplans load (runs once)
  const initialBomFetchRef = useRef(false);
  useEffect(() => {
    if (floorplans.length > 0 && !initialBomFetchRef.current) {
      initialBomFetchRef.current = true;
      const controller = new AbortController();
      floorplans.forEach(fp => {
        fetchFloorplanBom(fp.id, controller.signal);
      });
      return () => controller.abort();
    }
  }, [floorplans]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeFloorplan) {
      const controller = new AbortController();
      fetchPlacements(activeFloorplan.id, controller.signal);
      return () => controller.abort();
    }
  }, [activeFloorplan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectData(controller.signal);
    return () => controller.abort();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlacementCreate = async (placement: { x: number; y: number; width?: number; height?: number; item_id: number; item_variant_id: number; addon_ids?: number[]; ignoreDefaults?: boolean }) => {
    if (!activeFloorplan) return;

    // Use explicit dimensions if provided (calculated in handleDragEnd)
    // Otherwise fall back to defaults
    const width = placement.width ?? 60;
    const height = placement.height ?? 60;

    const createData: CreatePlacementDTO = {
      floorplan_id: activeFloorplan.id,
      item_variant_id: placement.item_variant_id,
      x: placement.x,
      y: placement.y,
      width,
      height,
    };

    const newPlacement = await placementService.create(createData);

    // Update BOM if addon_ids is provided (even if empty array - which means clear all addons)
    if (placement.addon_ids !== undefined) {
      await placementService.updateBom(newPlacement.id, placement.item_variant_id, placement.addon_ids);
    }

    // Only save size to memory if NOT ignoring defaults (Ctrl+drag)
    // This prevents Ctrl+drag from updating the "default" size
    if (!placement.ignoreDefaults) {
      itemSizeMemory.current.set(placement.item_id, { width, height });
      persistSizeMemory();

      // Also save variant/addon configuration to memory
      itemVariantMemory.current.set(placement.item_id, {
        variant_id: placement.item_variant_id,
        addon_ids: placement.addon_ids || [],
      });
      persistVariantMemory();
    }

    // Track addon configuration per-placement for modal consistency
    placementAddons.current.set(newPlacement.id, placement.addon_ids || []);

    // Optimistically add the new placement to local state to prevent flickering
    setPlacements(prev => [...prev, newPlacement]);
    setPlacementsVersion(prev => prev + 1);
  };

  const handlePlacementUpdate = async (id: number, placement: { x?: number; y?: number; width?: number; height?: number; item_variant_id?: number; addon_ids?: number[]; rotation?: number }, isFinal?: boolean) => {
    // Always update local state for optimistic UI feedback (immediate visual update)
    setPlacements(prev => prev.map(p => 
      p.id === id ? { ...p, ...placement } : p
    ));
    
    // Handle variant/BOM updates - these always save immediately
    if (placement.item_variant_id !== undefined) {
      try {
        const result = await placementService.updateBom(id, placement.item_variant_id, placement.addon_ids || []);

        // Update local state immediately with the new placement (including new bom_id)
        setPlacements(prev => prev.map(p =>
          p.id === id ? result.placement : p
        ));

        // Update memory
        itemVariantMemory.current.set(result.placement.item_id, {
          variant_id: placement.item_variant_id,
          addon_ids: placement.addon_ids || [],
        });
        persistVariantMemory();

        // Track addon configuration per-placement for modal consistency
        placementAddons.current.set(id, placement.addon_ids || []);

        // Trigger BOM refresh
        setPlacementsVersion(prev => prev + 1);
        return;
      } catch (err) {
        console.error('Failed to update BOM:', err);
        throw err;
      }
    }
    
    // Store size in memory if width/height changed (for new placements)
    if (placement.width !== undefined || placement.height !== undefined) {
      const updatedPlacement = placements.find(p => p.id === id);
      if (updatedPlacement) {
        const newWidth = placement.width ?? updatedPlacement.width;
        const newHeight = placement.height ?? updatedPlacement.height;
        itemSizeMemory.current.set(updatedPlacement.item_id, {
          width: newWidth,
          height: newHeight,
        });
        persistSizeMemory();
      }
    }
    
    // Only save to database when isFinal is true or undefined (for backward compatibility)
    // During resize/rotate operations, isFinal will be false until mouseup
    if (isFinal !== false) {
      await placementService.update(id, placement);
    }
  };

  const handlePlacementDelete = async (id: number) => {
    // Clean up placement-specific addon tracking
    placementAddons.current.delete(id);

    await placementService.delete(id);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
    setPlacementsVersion(prev => prev + 1);
  };

  // Toggle category visibility
  const handleToggleCategory = (categoryId: number) => {
    setVisibleCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Calculate item counts per category for current floorplan
  const getCategoryCounts = useCallback(() => {
    const counts = new Map<number, number>();
    placements.forEach(placement => {
      const item = items.find(i => i.id === placement.item_id);
      if (item) {
        counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
      }
    });
    return counts;
  }, [placements, items]);

  const categoryCounts = getCategoryCounts();

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id.toString();
    
    if (activeId.startsWith('item-')) {
      const itemData = event.active.data.current as { itemId: number } | undefined;
      // Check if Ctrl is currently being held (using event or window)
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
          // Show the original immediately so there's no visual void
          setActiveDragPlacement(placement);
          setIsDuplicating(true);
          
          // Then create the copy and switch to it
          placementService.duplicate(placementId, placement.x, placement.y)
            .then((newPlacement) => {
              // Switch to dragging the new copy
              setActiveDragPlacement(newPlacement);
              fetchPlacements(activeFloorplan.id);
              setPlacementsVersion(prev => prev + 1);
            })
            .catch((err) => {
              console.error('Failed to duplicate placement:', err);
              // Keep dragging the original on error
              setIsDuplicating(false);
            });
        } else {
          // Normal drag
          setActiveDragPlacement(placement);
          setIsDuplicating(false);
        }
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
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
        
        // Use delta to calculate new position relative to original position
        // This avoids issues with rotated elements having different bounding boxes
        const scaleX = floorplanImage.naturalWidth > 0
          ? floorplanImage.clientWidth / floorplanImage.naturalWidth
          : 1;
        const scaleY = floorplanImage.naturalHeight > 0
          ? floorplanImage.clientHeight / floorplanImage.naturalHeight
          : 1;

        // Calculate position change in natural coordinates
        const deltaX = event.delta.x / scaleX;
        const deltaY = event.delta.y / scaleY;

        // New position = original position + delta
        const newX = placement.x + deltaX;
        const newY = placement.y + deltaY;

        // Use isDuplicating state captured at drag start instead of reading from drag data
        // This allows releasing Ctrl after starting the drag
        if (isDuplicating) {
          // The copy was already created in dragStart, just update its position
          handlePlacementUpdate(placementId, { x: newX, y: newY });
        } else {
          // Normal move - update placement position
          handlePlacementUpdate(placementId, { x: newX, y: newY });
        }
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
          // Hide overlay immediately to prevent fly-back animation
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
          
          // clientWidth already includes zoom transform, don't multiply by zoom again
          const scaleX = floorplanImage.naturalWidth > 0
            ? floorplanImage.clientWidth / floorplanImage.naturalWidth
            : 1;
          const scaleY = floorplanImage.naturalHeight > 0
            ? floorplanImage.clientHeight / floorplanImage.naturalHeight
            : 1;
          
          let screenX: number;
          let screenY: number;
          
          if (activeRect) {
            // getBoundingClientRect already includes transforms
            screenX = activeRect.left - imageRect.left;
            screenY = activeRect.top - imageRect.top;
          } else {
            // For delta-based positioning, we need to account for the fact that
            // the drag overlay size doesn't change with zoom
            screenX = event.delta.x;
            screenY = event.delta.y;
          }
          
          // Clamp to image bounds
          screenX = Math.max(0, Math.min(screenX, imageRect.width - 100));
          screenY = Math.max(0, Math.min(screenY, imageRect.height - 100));
          
          const dropX = screenX / scaleX;
          const dropY = screenY / scaleY;
          
          // Look up item from existing items array (no API call needed)
          const fullItem = items.find(i => i.id === itemData.itemId);
          
          if (!fullItem) {
            console.error('Item not found in local state:', itemData.itemId);
            setIsDropping(false);
            return;
          }
          
          // Check if Ctrl was pressed during drag start (ignore all defaults)
          // Use the state we set in handleDragStart
          const ignoreDefaults = isCtrlDraggingItem;
          
          // If Ctrl was pressed, clear the stored memory for this item
          // This allows users to "reset" an item to defaults
          if (ignoreDefaults) {
            clearItemMemory(itemData.itemId);
          }
          
          // Select variant to use
          const storedConfig = ignoreDefaults ? undefined : itemVariantMemory.current.get(itemData.itemId);
          const variantToUse = storedConfig?.variant_id
            ? fullItem.variants?.find(v => v.id === storedConfig.variant_id)
            : fullItem.variants?.[0];

          if (variantToUse) {
            // Calculate dimensions based on whether Ctrl was pressed
            let placementWidth = 60;
            let placementHeight = 60;

            if (!ignoreDefaults) {
              // Use stored size if available
              const storedSize = itemSizeMemory.current.get(itemData.itemId);
              if (storedSize) {
                placementWidth = storedSize.width;
                placementHeight = storedSize.height;
              } else {
                // Calculate from aspect ratio
                if (fullItem.preview_image && itemPaletteRef.current) {
                  const aspectRatio = itemPaletteRef.current.getImageAspectRatio(fullItem.preview_image);
                  if (aspectRatio) {
                    placementWidth = 60 * aspectRatio;
                  }
                }
              }
            } else {
              // Ctrl pressed - use default or aspect ratio only
              if (fullItem.preview_image && itemPaletteRef.current) {
                const aspectRatio = itemPaletteRef.current.getImageAspectRatio(fullItem.preview_image);
                if (aspectRatio) {
                  placementWidth = 60 * aspectRatio;
                }
              }
            }

            // Clamp dimensions
            placementWidth = Math.max(5, Math.min(500, placementWidth));
            placementHeight = Math.max(5, Math.min(500, placementHeight));

            // Get addon IDs - use stored config if available, otherwise fetch required addons
            // Ctrl+drag should still include required addons, just not use memory for variant/size
            let addonIds: number[] | undefined;
            if (!ignoreDefaults && storedConfig?.addon_ids !== undefined) {
              // Normal drag with memory: use stored addon configuration
              addonIds = storedConfig.addon_ids;
            } else {
              // Ctrl+drag or no memory: fetch required addons for the selected variant
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
            // Clear drag item - placement will appear with fade-in animation
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
  };

  const handleSubmitFloorplan = async (data: CreateFloorplanDTO | { name?: string; sort_order?: number }, image?: File) => {
    if (floorplanToEdit) {
      await floorplanService.update(floorplanToEdit.id, data as { name?: string; sort_order?: number }, image);
    } else {
      if (!image) {
        throw new Error('Image is required');
      }
      await floorplanService.create(data as CreateFloorplanDTO, image);
    }
    
    setShowFloorplanModal(false);
    setFloorplanToEdit(null);
    await fetchProjectData();
  };

  const handleDeleteFloorplan = async () => {
    if (!floorplanToDelete) return;
    
    try {
      await floorplanService.delete(floorplanToDelete.id);
      setActiveFloorplan(null);
      setShowDeleteFloorplanModal(false);
      setFloorplanToDelete(null);
      // Clear BOM data for deleted floorplan to prevent stale data
      setFloorplanBoms(prev => {
        const next = new Map(prev);
        next.delete(floorplanToDelete.id);
        return next;
      });
      await fetchProjectData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to delete floorplan'));
    }
  };

  const handleReorderFloorplans = async (floorplanId: number, direction: 'up' | 'down') => {
    const currentIndex = floorplans.findIndex(fp => fp.id === floorplanId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= floorplans.length) return;

    const newOrder = [...floorplans];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    
    try {
      await floorplanService.reorder(projectId, newOrder.map(fp => fp.id));
      await fetchProjectData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to reorder floorplans'));
    }
  };

  const openCreateFloorplanModal = () => {
    setFloorplanToEdit(null);
    setShowFloorplanModal(true);
  };

  const openEditFloorplanModal = (floorplan: Floorplan) => {
    setFloorplanToEdit(floorplan);
    setShowFloorplanModal(true);
  };

  const openDeleteFloorplanModal = (floorplan: Floorplan) => {
    setFloorplanToDelete(floorplan);
    setShowDeleteFloorplanModal(true);
  };

  const handleSaveInvoiceSettings = (settings: InvoiceSettings) => {
    setInvoiceSettings(settings);
    // Switch to Summary tab after saving
    setActiveTab('summary');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showNotFound) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Project not found</AlertDescription>
      </Alert>
    );
  }

  if (!project) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-12 flex flex-col">
      <ProjectHeader project={project} onBack={() => navigate('/projects')} />

      {/* Configurator Area */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Canvas Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-card">
            {floorplans.length === 0 ? (
              <EmptyFloorplanState onAdd={openCreateFloorplanModal} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <FloorplanTabs
                  floorplans={floorplans}
                  activeFloorplan={activeFloorplan}
                  onSelect={setActiveFloorplan}
                  onEdit={openEditFloorplanModal}
                  onDelete={openDeleteFloorplanModal}
                  onReorder={handleReorderFloorplans}
                  onAdd={openCreateFloorplanModal}
                />

                {/* Canvas Area */}
                {activeFloorplan && (
                  <div className="flex-1 overflow-hidden">
                    <div className="h-full">
                      <ConfiguratorCanvas
                        key={`canvas-${activeFloorplan.id}-${activeFloorplan.image_path}`}
                        floorplan={activeFloorplan}
                        placements={placements}
                        items={items}
                        bom={floorplanBoms.get(activeFloorplan.id) || null}
                        placementAddons={placementAddons}
                        onPlacementUpdate={handlePlacementUpdate}
                        onPlacementDelete={handlePlacementDelete}
                        isResizingRef={isResizingRef}
                        zoomRef={canvasZoomRef}
                        scaleRef={canvasScaleRef}
                        isDuplicating={isDuplicating}
                        visibleCategoryIds={visibleCategories}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Side - Products/BOM/Summary Panel */}
          <div className="w-[400px] flex-shrink-0 bg-card border-l flex flex-col h-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-4 py-2 flex-shrink-0">
                <TabsTrigger value="products" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Products
                </TabsTrigger>
                <TabsTrigger value="bom" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Bill of Materials
                </TabsTrigger>
                <TabsTrigger value="summary" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Summary
                </TabsTrigger>
              </TabsList>
              
              <TabsContent
                value="products"
                forceMount
                className={`flex-1 m-0 overflow-hidden ${activeTab !== 'products' ? 'hidden' : ''}`}
              >
                <ItemPalette
                  ref={itemPaletteRef}
                  className="h-full border-0"
                  visibleCategories={visibleCategories}
                  onToggleCategory={handleToggleCategory}
                  categoryCounts={categoryCounts}
                />
              </TabsContent>

              <TabsContent
                value="bom"
                forceMount
                className={`flex-1 m-0 overflow-hidden ${activeTab !== 'bom' ? 'hidden' : ''}`}
              >
                {activeFloorplan ? (
                  <BOMPanel
                    floorplanId={activeFloorplan.id}
                    bom={floorplanBoms.get(activeFloorplan.id) || null}
                    className="h-full border-0"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p>Select a floorplan to view BOM</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="summary"
                forceMount
                className={`flex-1 m-0 overflow-hidden ${activeTab !== 'summary' ? 'hidden' : ''}`}
              >
                <SummaryTab
                  projectName={project?.name || ''}
                  projectNumber={generateProjectNumber(project)}
                  customerName={project?.customer_name || ''}
                  floorplans={floorplans}
                  floorplanTotals={floorplanTotals}
                  projectTotal={projectTotal}
                  invoiceSettings={invoiceSettings}
                  onConfigureInvoice={() => setShowInvoiceModal(true)}
                />
              </TabsContent>
            </Tabs>

            {/* Project Total - shown in Products and BOM tabs */}
            {(activeTab === 'products' || activeTab === 'bom') && (
              <div className="border-t p-4 bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Project Total:</span>
                  <span className="text-xl font-bold">
                    ${formatCurrency(projectTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Drag Overlay - only for items from palette, not for duplication */}
        <DragOverlay dropAnimation={null}>
          {activeDragItem && !isDropping && (() => {
            // Calculate dimensions to match what the placement will be
            let placementWidth = 60;
            let placementHeight = 60;
            
            // Check if Ctrl is being held (ignore defaults)
            if (!isCtrlDraggingItem) {
              // Check if there's a stored size for this item (from previous resize)
              const storedSize = itemSizeMemory.current.get(activeDragItem.id);
              if (storedSize) {
                // Use the stored size directly
                placementWidth = storedSize.width;
                placementHeight = storedSize.height;
              } else {
                // No stored size - calculate from aspect ratio
                // Default placement height is 60, width is calculated from aspect ratio
                if (activeDragItem.preview_image && itemPaletteRef.current) {
                  const aspectRatio = itemPaletteRef.current.getImageAspectRatio(activeDragItem.preview_image);
                  if (aspectRatio) {
                    placementWidth = 60 * aspectRatio;
                  }
                }
              }
            } else {
              // Ctrl is held - use default 60x60 or calculate from aspect ratio only
              if (activeDragItem.preview_image && itemPaletteRef.current) {
                const aspectRatio = itemPaletteRef.current.getImageAspectRatio(activeDragItem.preview_image);
                if (aspectRatio) {
                  placementWidth = 60 * aspectRatio;
                }
              }
            }
            
            // Clamp dimensions to placement limits (5-500px)
            placementWidth = Math.max(5, Math.min(500, placementWidth));
            placementHeight = Math.max(5, Math.min(500, placementHeight));
            
            // Scale the overlay to match the visual size on canvas
            // canvasScaleRef already includes zoom factor from ConfiguratorCanvas
            const { scaleX, scaleY } = canvasScaleRef.current;
            
            return (
              <div 
                className="border-2 border-primary rounded bg-background shadow-xl cursor-grabbing overflow-hidden" 
                style={{ 
                  width: `${placementWidth}px`, 
                  height: `${placementHeight}px`,
                  transform: `scale(${scaleX}, ${scaleY})`,
                  transformOrigin: 'top left'
                }}
              >
                {activeDragItem.preview_image ? (
                  <img
                    src={itemService.getImageUrl(activeDragItem.preview_image)}
                    alt={activeDragItem.name}
                    className="w-full h-full object-fill bg-muted"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No img
                  </div>
                )}
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>

      {/* Floorplan Modal */}
      <FloorplanFormModal
        floorplan={floorplanToEdit}
        projectId={projectId}
        isOpen={showFloorplanModal}
        onClose={() => {
          setShowFloorplanModal(false);
          setFloorplanToEdit(null);
        }}
        onSubmit={handleSubmitFloorplan}
      />

      {/* Invoice Settings Modal */}
      <InvoiceSettingsModal
        projectId={projectId}
        bomTotal={projectTotal}
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSave={handleSaveInvoiceSettings}
        initialSettings={invoiceSettings || undefined}
      />

      <DeleteFloorplanDialog
        floorplan={floorplanToDelete}
        isOpen={showDeleteFloorplanModal}
        onClose={() => setShowDeleteFloorplanModal(false)}
        onConfirm={handleDeleteFloorplan}
      />

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ProjectDashboard;
