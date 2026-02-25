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
import { ArrowLeft, Loader2, CheckCircle, XCircle, Plus, Pencil, Trash, ChevronLeft, ChevronRight, FileDown, Receipt } from 'lucide-react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { ConfiguratorCanvas, ItemPalette, BOMPanel } from '@/components/configurator';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
      
      if (floorplansData.length > 0 && !activeFloorplan) {
        setActiveFloorplan(floorplansData[0]);
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

  const handlePlacementCreate = async (placement: { x: number; y: number; width?: number; height?: number; item_id: number; item_variant_id: number; addon_ids?: number[] }) => {
    if (!activeFloorplan) return;
    
    const storedSize = itemSizeMemory.current.get(placement.item_id);
    const width = placement.width ?? storedSize?.width ?? 60;
    const height = placement.height ?? storedSize?.height ?? 60;
    
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
    
    await fetchPlacements(activeFloorplan.id);
    setPlacementsVersion(prev => prev + 1);
  };

  const handlePlacementUpdate = async (id: number, placement: { x?: number; y?: number; width?: number; height?: number; item_variant_id?: number; addon_ids?: number[] }) => {
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
    
    setPlacements(prev => prev.map(p => 
      p.id === id ? { ...p, ...placement } : p
    ));
    
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
    
    await placementService.update(id, placement);
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
      const itemData = event.active.data.current as { item: Item } | undefined;
      if (itemData?.item) {
        setActiveDragItem(itemData.item);
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
          return;
        }
        
        const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
        if (!floorplanImage) {
          console.error('Floorplan image not found');
          setActiveDragItem(null);
          return;
        }
        
        const imageRect = floorplanImage.getBoundingClientRect();
        const activeRect = active.rect.current?.translated;
        
        if (activeRect) {
          const scaleX = floorplanImage.naturalWidth > 0
            ? floorplanImage.clientWidth / floorplanImage.naturalWidth
            : 1;
          const scaleY = floorplanImage.naturalHeight > 0
            ? floorplanImage.clientHeight / floorplanImage.naturalHeight
            : 1;
          
          const screenX = Math.max(0, activeRect.left - imageRect.left);
          const screenY = Math.max(0, activeRect.top - imageRect.top);
          const newX = screenX / scaleX;
          const newY = screenY / scaleY;
          
          handlePlacementUpdate(placementId, { x: newX, y: newY });
        }
      }
      setActiveDragItem(null);
      return;
    }
    
    if (activeId.startsWith('item-') && overId.startsWith('canvas-')) {
      const itemData = active.data.current as { item: Item } | undefined;
      
      if (itemData?.item) {
        try {
          // Hide overlay immediately to prevent fly-back animation
          setIsDropping(true);
          
          const canvasElement = document.querySelector(`[data-canvas-id="${activeFloorplan.id}"]`);
          if (!canvasElement) {
            console.error('Canvas element not found');
            setIsDropping(false);
            setActiveDragItem(null);
            return;
          }
          
          const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
          if (!floorplanImage) {
            console.error('Floorplan image not found');
            setIsDropping(false);
            setActiveDragItem(null);
            return;
          }
          
          const imageRect = floorplanImage.getBoundingClientRect();
          const activeRect = active.rect.current?.translated;
          
          const scaleX = floorplanImage.naturalWidth > 0
            ? floorplanImage.clientWidth / floorplanImage.naturalWidth
            : 1;
          const scaleY = floorplanImage.naturalHeight > 0
            ? floorplanImage.clientHeight / floorplanImage.naturalHeight
            : 1;
          
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
          
          const fullItem = await itemService.getById(itemData.item.id);
          
          const storedConfig = itemVariantMemory.current.get(itemData.item.id);
          const variantToUse = storedConfig?.variant_id
            ? fullItem.variants?.find(v => v.id === storedConfig.variant_id)
            : fullItem.variants?.[0];
          
          if (variantToUse) {
            await handlePlacementCreate({
              x: dropX,
              y: dropY,
              item_id: itemData.item.id,
              item_variant_id: variantToUse.id,
              addon_ids: storedConfig?.addon_ids,
            });
            // Clear drag item - placement will appear with fade-in animation
            setIsDropping(false);
            setActiveDragItem(null);
            return;
          }
          
          setIsDropping(false);
        } catch (err) {
          console.error('Failed to create placement:', err);
          setIsDropping(false);
        }
      }
    }
    
    setActiveDragItem(null);
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
                        floorplan={activeFloorplan}
                        placements={placements}
                        items={items}
                        onPlacementUpdate={handlePlacementUpdate}
                        onPlacementDelete={handlePlacementDelete}
                        isResizingRef={isResizingRef}
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
                <ItemPalette className="h-full border-0" />
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
        
        {/* Drag Overlay - use dropAnimation=null to prevent fly-back, only show when not dropping */}
        <DragOverlay dropAnimation={null}>
          {activeDragItem && !isDropping && (
            <div className="border-2 border-primary rounded bg-background shadow-xl cursor-grabbing overflow-hidden" style={{ width: '100px', height: '100px' }}>
              {activeDragItem.preview_image ? (
                <img
                  src={`/uploads/${activeDragItem.preview_image}`}
                  alt={activeDragItem.name}
                  className="w-full h-full object-contain bg-muted"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  No img
                </div>
              )}
            </div>
          )}
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
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteFloorplan}>
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
