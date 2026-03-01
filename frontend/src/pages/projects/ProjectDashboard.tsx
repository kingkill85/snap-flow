import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService, type Project } from '@/services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '@/services/floorplan';
import { placementService, type Placement, type CreatePlacementDTO } from '@/services/placement';
import { itemService, type Item } from '@/services/item';
import { bomService } from '@/services/bom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Plus, Pencil, Trash, ChevronLeft, ChevronRight, FileDown, Receipt, X, Trash2 } from 'lucide-react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { ConfiguratorCanvas, ItemPalette, BOMPanel } from '@/components/configurator';
import type { ItemPaletteRef } from '@/components/configurator';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const calculateDragPosition = (
  initialX: number,
  initialY: number,
  deltaX: number,
  deltaY: number,
  scaleX: number,
  scaleY: number
): { x: number; y: number } => {
  return {
    x: initialX + deltaX / scaleX,
    y: initialY + deltaY / scaleY,
  };
};

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
  const [projectTotal, setProjectTotal] = useState<number>(0);
  const [isLoadingTotal, setIsLoadingTotal] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  
  // Floorplan modal state
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [floorplanToEdit, setFloorplanToEdit] = useState<Floorplan | null>(null);
  const [showDeleteFloorplanModal, setShowDeleteFloorplanModal] = useState(false);
  const [floorplanToDelete, setFloorplanToDelete] = useState<Floorplan | null>(null);

  // Session-based memory for item sizes
  const itemSizeMemory = useRef<Map<number, { width: number; height: number }>>(new Map());
  const itemVariantMemory = useRef<Map<number, { variant_id: number; addon_ids: number[] }>>(new Map());
  const isResizingRef = useRef(false);
  const canvasZoomRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const canvasScaleRef = useRef({ scaleX: 1, scaleY: 1 });
  
  // Ref to access ItemPalette's aspect ratio cache
  const itemPaletteRef = useRef<ItemPaletteRef>(null);

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
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to load project data');
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
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load placements:', err);
      }
    }
  };

  const fetchProjectTotal = async (signal?: AbortSignal) => {
    try {
      setIsLoadingTotal(true);
      const data = await bomService.getProjectTotal(projectId, signal);
      setProjectTotal(data.totalPrice);
    } catch (err) {
      console.error('Failed to load project total:', err);
    } finally {
      setIsLoadingTotal(false);
    }
  };

  useEffect(() => {
    if (activeFloorplan) {
      const controller = new AbortController();
      fetchPlacements(activeFloorplan.id, controller.signal);
      return () => controller.abort();
    }
  }, [activeFloorplan?.id]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectData(controller.signal);
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectTotal(controller.signal);
  }, [projectId, placementsVersion]);

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
    
    if (placement.addon_ids && placement.addon_ids.length > 0) {
      await placementService.updateBom(newPlacement.id, placement.item_variant_id, placement.addon_ids);
    }
    
    // Only save size to memory if NOT ignoring defaults (Ctrl+drag)
    // This prevents Ctrl+drag from updating the "default" size
    if (!placement.ignoreDefaults) {
      itemSizeMemory.current.set(placement.item_id, { width, height });
    }
    
    await fetchPlacements(activeFloorplan.id);
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
        await placementService.updateBom(id, placement.item_variant_id, placement.addon_ids || []);
        
        const updatedPlacement = placements.find(p => p.id === id);
        if (updatedPlacement) {
          itemVariantMemory.current.set(updatedPlacement.item_id, {
            variant_id: placement.item_variant_id,
            addon_ids: placement.addon_ids || [],
          });
        }
        
        if (activeFloorplan) {
          await fetchPlacements(activeFloorplan.id);
        }
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
      }
    }
    
    // Only save to database when isFinal is true or undefined (for backward compatibility)
    // During resize/rotate operations, isFinal will be false until mouseup
    if (isFinal !== false) {
      await placementService.update(id, placement);
    }
  };

  const handlePlacementDelete = async (id: number) => {
    await placementService.delete(id);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
    setPlacementsVersion(prev => prev + 1);
  };

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
            
            await handlePlacementCreate({
              x: dropX,
              y: dropY,
              width: placementWidth,
              height: placementHeight,
              item_id: itemData.itemId,
              item_variant_id: variantToUse.id,
              addon_ids: ignoreDefaults ? undefined : storedConfig?.addon_ids,
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
    try {
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
    } catch (err: any) {
      throw err;
    }
  };

  const handleDeleteFloorplan = async () => {
    if (!floorplanToDelete) return;
    
    try {
      await floorplanService.delete(floorplanToDelete.id);
      setActiveFloorplan(null);
      setShowDeleteFloorplanModal(false);
      setFloorplanToDelete(null);
      setPlacementsVersion(prev => prev + 1);
      await fetchProjectData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete floorplan');
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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reorder floorplans');
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
    <div className="fixed inset-0 top-16 flex flex-col">
      {/* Project Header */}
      <div className="bg-card border-b px-4 py-3 flex items-center gap-4 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="h-6 w-px bg-border"></div>
        <div className="text-sm text-muted-foreground">
          {generateProjectNumber(project)}
        </div>
        <div className="h-6 w-px bg-border"></div>
        <div className="font-medium">{project.name}</div>
        <div className="h-6 w-px bg-border"></div>
        <div className="text-sm text-muted-foreground">{project.customer_name}</div>
        <div className="h-6 w-px bg-border"></div>
        {project.status === 'active' ? (
          <span className="inline-flex items-center text-green-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            Active
          </span>
        ) : project.status === 'completed' ? (
          <span className="inline-flex items-center text-blue-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            Completed
          </span>
        ) : (
          <span className="inline-flex items-center text-destructive text-sm">
            <XCircle className="w-4 h-4 mr-1" />
            Cancelled
          </span>
        )}
      </div>

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
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="mb-2">No floorplans yet.</p>
                  <Button size="sm" onClick={openCreateFloorplanModal}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Floorplan
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Floorplan Tabs */}
                <div className="flex items-center justify-start border-b bg-muted/30 px-4 py-2 flex-shrink-0 h-10">
                  <div className="flex gap-1 overflow-x-auto">
                    {floorplans.map((floorplan, index) => (
                      <div
                        key={floorplan.id}
                        className={`flex items-center px-3 py-2 cursor-pointer transition-colors whitespace-nowrap border-b-2 ${
                          activeFloorplan?.id === floorplan.id
                            ? 'text-foreground border-primary font-medium'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                        onClick={() => setActiveFloorplan(floorplan)}
                      >
                        <span className="text-sm">{floorplan.name}</span>
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditFloorplanModal(floorplan);
                            }}
                            className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (index > 0) handleReorderFloorplans(floorplan.id, 'up');
                            }}
                            disabled={index === 0}
                            className={`p-1 text-muted-foreground hover:bg-muted rounded transition-colors ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Move Left"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (index < floorplans.length - 1) handleReorderFloorplans(floorplan.id, 'down');
                            }}
                            disabled={index === floorplans.length - 1}
                            className={`p-1 text-muted-foreground hover:bg-muted rounded transition-colors ${index === floorplans.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Move Right"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteFloorplanModal(floorplan);
                            }}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    <div
                      className="flex items-center px-3 py-2 cursor-pointer transition-colors whitespace-nowrap border-b-2 text-muted-foreground border-transparent hover:text-foreground"
                      onClick={openCreateFloorplanModal}
                      title="Add Floorplan"
                    >
                      <Plus className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {/* Canvas Area */}
                {activeFloorplan && (
                  <div className="flex-1 overflow-hidden">
                    <div className="h-full">
                      <ConfiguratorCanvas
                        key={`canvas-${activeFloorplan.id}-${activeFloorplan.image_path}`}
                        floorplan={activeFloorplan}
                        placements={placements}
                        items={items}
                        onPlacementUpdate={handlePlacementUpdate}
                        onPlacementDelete={handlePlacementDelete}
                        isResizingRef={isResizingRef}
                        zoomRef={canvasZoomRef}
                        scaleRef={canvasScaleRef}
                        isDuplicating={isDuplicating}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Side - Products/BOM Panel */}
          <div className="w-[400px] flex-shrink-0 bg-card border-l flex flex-col h-full">
            <Tabs defaultValue="products" className="flex flex-col flex-1 min-h-0">
              <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-4 py-2 flex-shrink-0">
                <TabsTrigger value="products" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Products
                </TabsTrigger>
                <TabsTrigger value="bom" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Bill of Materials
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="products" className="flex-1 m-0 overflow-hidden">
                <ItemPalette ref={itemPaletteRef} className="h-full border-0" />
              </TabsContent>
              
              <TabsContent value="bom" className="flex-1 m-0 overflow-hidden">
                {activeFloorplan ? (
                  <BOMPanel 
                    floorplanId={activeFloorplan.id} 
                    placementsVersion={placementsVersion}
                    className="h-full border-0"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p>Select a floorplan to view BOM</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Project Total & Actions */}
            <div className="border-t p-4 bg-muted/30">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-medium text-muted-foreground">Project Total:</span>
                <span className="text-xl font-bold">
                  {isLoadingTotal ? (
                    <span className="text-muted-foreground">...</span>
                  ) : (
                    `$${projectTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </span>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Generate Presentation (PDF)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Create Invoice (PDF)
                </Button>
              </div>
            </div>
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
            
            // Calculate scale factors to match what will be shown on the floorplan
            const { scaleX, scaleY } = canvasScaleRef.current;
            const zoom = canvasZoomRef.current.zoom;
            const scaleTransformX = scaleX * zoom;
            const scaleTransformY = scaleY * zoom;
            
            return (
              <div 
                className="border-2 border-primary rounded bg-background shadow-xl cursor-grabbing overflow-hidden" 
                style={{ 
                  width: `${placementWidth}px`, 
                  height: `${placementHeight}px`,
                  transform: `scale(${scaleTransformX}, ${scaleTransformY})`,
                  transformOrigin: 'center center'
                }}
              >
                {activeDragItem.preview_image ? (
                  <img
                    src={`/uploads/${activeDragItem.preview_image}`}
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

      {/* Delete Floorplan Modal */}
      <Dialog open={showDeleteFloorplanModal} onOpenChange={setShowDeleteFloorplanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Floorplan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete "{floorplanToDelete?.name}"?</p>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the floorplan and all placements on it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteFloorplanModal(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteFloorplan}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ProjectDashboard;
