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
import { DragOverlayContent } from '@/components/configurator/DragOverlayContent';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import { DeleteFloorplanDialog } from '@/components/floorplans/DeleteFloorplanDialog';
import { FloorplanTabs } from '@/components/floorplans/FloorplanTabs';
import { InvoiceSettingsModal, SummaryTab } from '@/components/invoice';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { EmptyFloorplanState } from '@/components/projects/EmptyFloorplanState';

import { extractErrorMessage, formatCurrency } from '@/utils';
import { useItemMemory } from '@/hooks/useItemMemory';
import { useBomCalculations } from '@/hooks/useBomCalculations';
import { useDragHandlers } from '@/hooks/useDragHandlers';
import { usePlacements } from '@/hooks/usePlacements';
import { useProjectData } from '@/hooks/useProjectData';

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

  const [placementsVersion, setPlacementsVersion] = useState(0);

  // Project data hook
  const {
    project,
    setProject,
    floorplans,
    setFloorplans,
    activeFloorplan,
    setActiveFloorplan,
    items,
    setItems,
    isLoading,
    setIsLoading,
    showNotFound,
    setShowNotFound,
    error,
    setError,
    visibleCategories,
    setVisibleCategories,
    invoiceSettings,
    setInvoiceSettings,
    floorplanBoms,
    setFloorplanBom,
    fetchProjectData,
    fetchFloorplanBom,
  } = useProjectData({ projectId });

  // BOM calculations
  const { floorplanTotals, projectTotal } = useBomCalculations(floorplans, floorplanBoms);

  // Floorplan modal state
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [floorplanToEdit, setFloorplanToEdit] = useState<Floorplan | null>(null);
  const [showDeleteFloorplanModal, setShowDeleteFloorplanModal] = useState(false);
  const [floorplanToDelete, setFloorplanToDelete] = useState<Floorplan | null>(null);

  // Invoice settings state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Active tab state for right panel
  const [activeTab, setActiveTab] = useState('products');

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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

  // Placements hook
  const {
    placements,
    setPlacements,
    handlePlacementCreate,
    handlePlacementUpdate,
    handlePlacementDelete,
    fetchPlacements,
    placementAddons,
  } = usePlacements({
    activeFloorplan,
    itemSizeMemory,
    itemVariantMemory,
    persistSizeMemory,
    persistVariantMemory,
    setPlacementsVersion,
  });

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

  // Drag handlers hook
  const {
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
  } = useDragHandlers({
    items,
    placements,
    activeFloorplan,
    itemSizeMemory,
    itemVariantMemory,
    itemPaletteRef,
    placementAddons,
    isResizingRef,
    canvasScaleRef,
    handlePlacementCreate,
    handlePlacementUpdate,
    fetchPlacements,
    setPlacementsVersion,
    clearItemMemory,
  });

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
          {activeDragItem && !isDropping && (
            <DragOverlayContent
              item={activeDragItem}
              isCtrlDragging={isCtrlDraggingItem}
              isDropping={isDropping}
              itemSizeMemory={itemSizeMemory}
              itemPaletteRef={itemPaletteRef}
              canvasScale={canvasScaleRef.current}
            />
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
