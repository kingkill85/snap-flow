import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { Project } from '@/services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '@/services/floorplan';
import type { InvoiceSettings } from '@/services/invoice-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { ConfiguratorCanvas, ItemPalette, BOMPanel } from '@/components/configurator';
import type { ItemPaletteRef } from '@/components/configurator';
import { DragOverlayContent } from '@/components/configurator/DragOverlayContent';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import { DeleteFloorplanDialog } from '@/components/floorplans/DeleteFloorplanDialog';
import { FloorplanTabs } from '@/components/floorplans/FloorplanTabs';
import { InvoiceSettingsModal, SummaryTab } from '@/components/invoice';
import type { FloorplanAreaData } from '@/services/invoice-docx';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { EmptyFloorplanState } from '@/components/projects/EmptyFloorplanState';

import { extractErrorMessage, formatCurrency } from '@/utils';
import { areaService } from '@/services/area';
import { placementService } from '@/services/placement';
import { useItemMemory } from '@/hooks/useItemMemory';
import { useBomCalculations } from '@/hooks/useBomCalculations';
import { useDragHandlers } from '@/hooks/useDragHandlers';
import { usePlacements } from '@/hooks/usePlacements';
import { useProjectData } from '@/hooks/useProjectData';
import { useAreas } from '@/hooks/useAreas';
import { AreasPanel } from '@/components/configurator/AreasPanel';
import { AreaEditModal } from '@/components/configurator/AreaEditModal';
import type { Area } from '@/services/area';

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
  const { user } = useAuth();
  const projectId = parseInt(id || '0');

  const [placementsVersion, setPlacementsVersion] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [canvasBounds, setCanvasBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Project data hook
  const {
    project,
    floorplans,
    activeFloorplan,
    setActiveFloorplan,
    items,
    categories,
    isLoading,
    showNotFound,
    error,
    setError,
    visibleCategories,
    setVisibleCategories,
    invoiceSettings,
    setInvoiceSettings,
    floorplanBoms,
    setFloorplanBoms,
    fetchProjectData,
    fetchFloorplanBom,
  } = useProjectData({ projectId });

  // Users can only edit active projects; admins/tenant_admins can edit any
  const canEdit = user?.role !== 'user' || project?.status === 'active';

  // BOM calculations
  const { floorplanTotals, projectTotal } = useBomCalculations(floorplans, floorplanBoms, items, categories);

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
  }, [placementsVersion, floorplans, fetchFloorplanBom]);

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
  }, [floorplans, fetchFloorplanBom]);

  // Placements hook - MUST be called before useEffect that uses fetchPlacements
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
    onPlacementChanged: activeFloorplan ? () => fetchAreas(activeFloorplan.id) : undefined,
  });

  // Areas hook
  const { areas, fetchAreas, createArea, updateArea, updateVertices, deleteArea, selectedAreaId, setSelectedAreaId } = useAreas({ activeFloorplanId: activeFloorplan?.id ?? null });

  // Area edit modal state
  const [editingArea, setEditingArea] = useState<Area | null>(null);

  // Area visibility — hidden areas and their contained items are invisible on canvas
  const [hiddenAreaIds, setHiddenAreaIds] = useState<Set<number>>(new Set());
  const handleToggleAreaVisibility = useCallback((areaId: number) => {
    setHiddenAreaIds(prev => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  }, []);

  const handleToggleAllAreasVisibility = useCallback(() => {
    setHiddenAreaIds(prev => {
      if (prev.size === areas.length) return new Set(); // all hidden → show all
      return new Set(areas.map(a => a.id)); // some visible → hide all
    });
  }, [areas]);

  // Local area state for optimistic vertex updates during drag
  const [localAreas, setLocalAreas] = useState<Area[]>([]);
  const localAreasRef = useRef<Area[]>([]);
  useEffect(() => { setLocalAreas(areas); localAreasRef.current = areas; }, [areas]);

  const handleAreaMove = useCallback((id: number, dx: number, dy: number) => {
    setLocalAreas(prev => {
      const next = prev.map(a => {
        if (a.id !== id) return a;
        return {
          ...a,
          x: a.x + dx,
          y: a.y + dy,
          vertices: a.vertices.map(v => ({ ...v, x: v.x + dx, y: v.y + dy })),
        };
      });
      localAreasRef.current = next;
      return next;
    });
  }, []);

  const handleAreaVertexMove = useCallback((id: number, vertexIndex: number, x: number, y: number) => {
    setLocalAreas(prev => {
      const next = prev.map(a => {
        if (a.id !== id) return a;
        return {
          ...a,
          vertices: a.vertices.map((v, i) => i === vertexIndex ? { ...v, x, y } : v),
        };
      });
      localAreasRef.current = next;
      return next;
    });
  }, []);

  const handleAreaVerticesReplace = useCallback((id: number, updates: { index: number; x: number; y: number }[]) => {
    setLocalAreas(prev => {
      const next = prev.map(a => {
        if (a.id !== id) return a;
        const newVertices = [...a.vertices];
        for (const u of updates) {
          const v = newVertices.find(v => v.vertex_index === u.index);
          if (v) { v.x = u.x; v.y = u.y; }
        }
        return { ...a, vertices: newVertices.map(v => ({ ...v })) };
      });
      localAreasRef.current = next;
      return next;
    });
  }, []);

  const handleAreaVertexAdd = useCallback((id: number, afterIndex: number, x: number, y: number) => {
    setLocalAreas(prev => {
      const newAreas = prev.map(a => {
        if (a.id !== id) return a;
        const newVertices = [...a.vertices];
        newVertices.splice(afterIndex + 1, 0, {
          id: -Date.now(),
          placement_id: id,
          vertex_index: afterIndex + 1,
          x,
          y,
        });
        return {
          ...a,
          vertices: newVertices.map((v, i) => ({ ...v, vertex_index: i })),
        };
      });
      localAreasRef.current = newAreas;
      return newAreas;
    });
  }, []);

  const handleAreaVertexDelete = useCallback(async (id: number, vertexIndex: number) => {
    setLocalAreas(prev => {
      const next = prev.map(a => {
        if (a.id !== id) return a;
        const filtered = a.vertices.filter(v => v.vertex_index !== vertexIndex);
        return { ...a, vertices: filtered.map((v, i) => ({ ...v, vertex_index: i })) };
      });
      localAreasRef.current = next;
      return next;
    });
    // Commit immediately
    const area = localAreasRef.current.find(a => a.id === id);
    if (area) {
      await updateVertices(id, area.vertices.map(v => ({ x: v.x, y: v.y })));
    }
  }, [updateVertices]);

  const refreshAfterContainment = useCallback(async () => {
    if (!activeFloorplan) return;
    await Promise.all([
      fetchAreas(activeFloorplan.id),
      fetchPlacements(activeFloorplan.id),
      fetchFloorplanBom(activeFloorplan.id),
    ]);
  }, [activeFloorplan, fetchAreas, fetchPlacements, fetchFloorplanBom]);

  const handleAreaVerticesCommit = useCallback(async (id: number) => {
    const area = localAreasRef.current.find(a => a.id === id);
    if (!area) return;
    await updateVertices(id, area.vertices.map(v => ({ x: v.x, y: v.y })));
    await refreshAfterContainment();
  }, [updateVertices, refreshAfterContainment]);

  useEffect(() => {
    if (activeFloorplan) {
      const controller = new AbortController();
      fetchPlacements(activeFloorplan.id, controller.signal);
      return () => controller.abort();
    }
  }, [activeFloorplan, fetchPlacements]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectData(controller.signal);
    return () => controller.abort();
  }, [projectId, fetchProjectData]);

  // Note: Auto-selection of floorplan is handled by useProjectData hook in fetchProjectData

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

  // Toggle all categories on/off
  const handleToggleAllCategories = (visible: boolean) => {
    if (visible) {
      setVisibleCategories(new Set(categories.map(c => c.id)));
    } else {
      setVisibleCategories(new Set());
    }
  };

  // Build area data for the active floorplan for DOCX area summary
  // For DOCX export: fetch area data for all floorplans on demand
  const getFloorplanAreaData = useCallback(async (): Promise<FloorplanAreaData[]> => {
    const results: FloorplanAreaData[] = [];
    for (const fp of floorplans) {
      const [fpAreas, fpPlacements] = await Promise.all([
        areaService.getByFloorplan(fp.id),
        placementService.getAll(fp.id),
      ]);
      results.push({ floorplan: fp, areas: fpAreas, placements: fpPlacements });
    }
    return results;
  }, [floorplans]);

  // Calculate item counts per category for current floorplan
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    placements.forEach(placement => {
      const item = items.find(i => i.id === placement.item_id);
      if (item) {
        counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
      }
    });
    return counts;
  }, [placements, items]);

  // Drag handlers hook
  const {
    activeDragItem,
    isDuplicating,
    isDropping,
    isCtrlDraggingItem,
    isDraggingArea,
    handleDragStart,
    handleDragEnd,
  } = useDragHandlers({
    items,
    placements,
    activeFloorplan,
    itemSizeMemory,
    itemVariantMemory,
    itemPaletteRef,
    isResizingRef,
    handlePlacementCreate,
    handlePlacementUpdate,
    setPlacements,
    clearItemMemory,
    areas,
    fetchAreas: activeFloorplan ? () => fetchAreas(activeFloorplan.id) : undefined,
    setPlacementsVersion,
    handleAreaCreate: async (data) => {
      const AREA_COLORS = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
      ];
      const nextNum = areas.length + 1;
      const nextColor = AREA_COLORS[(areas.length) % AREA_COLORS.length];
      const newArea = await createArea({
        ...data,
        name: `Area ${nextNum}`,
        color: nextColor,
        opacity: 0.1,
      });
      await refreshAfterContainment();
      // Open edit modal so user can set name and color
      setEditingArea(newArea);
    },
  });

  const handleSubmitFloorplan = async (data: CreateFloorplanDTO | { name?: string; sort_order?: number }, image?: File) => {
    let createdFloorplan: Floorplan | null = null;
    
    if (floorplanToEdit) {
      await floorplanService.update(floorplanToEdit.id, data as { name?: string; sort_order?: number }, image);
    } else {
      if (!image) {
        throw new Error('Image is required');
      }
      createdFloorplan = await floorplanService.create(data as CreateFloorplanDTO, image);
    }
    
    setShowFloorplanModal(false);
    setFloorplanToEdit(null);
    await fetchProjectData();
    
    // After fetch, select the newly created floorplan
    if (createdFloorplan) {
      setActiveFloorplan(createdFloorplan);
    }
  };

  const handleDeleteFloorplan = async () => {
    if (!floorplanToDelete) return;
    
    // Capture ID before clearing state
    const deletedFloorplanId = floorplanToDelete.id;
    const wasActiveFloorplan = activeFloorplan?.id === deletedFloorplanId;
    
    try {
      await floorplanService.delete(deletedFloorplanId);
      
      setShowDeleteFloorplanModal(false);
      setFloorplanToDelete(null);
      
      // Clear BOM data for deleted floorplan to prevent stale data
      setFloorplanBoms(prev => {
        const next = new Map(prev);
        next.delete(deletedFloorplanId);
        return next;
      });
      
      // If deleted floorplan was active, clear it before fetch to avoid stale references
      if (wasActiveFloorplan) {
        setActiveFloorplan(null);
      }
      
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

      {!canEdit && (
        <div className="bg-muted border-b px-4 py-2 text-sm text-muted-foreground text-center">
          This project is read-only because it is no longer active.
        </div>
      )}

      {/* Configurator Area */}
      <DndContext
        sensors={canEdit ? sensors : []}
        onDragStart={canEdit ? handleDragStart : undefined}
        onDragEnd={canEdit ? handleDragEnd : undefined}
        collisionDetection={pointerWithin}
      >
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Canvas Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-card">
            {floorplans.length === 0 ? (
              <EmptyFloorplanState onAdd={canEdit ? openCreateFloorplanModal : () => {}} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <FloorplanTabs
                  floorplans={floorplans}
                  activeFloorplan={activeFloorplan}
                  onSelect={setActiveFloorplan}
                  onEdit={canEdit ? openEditFloorplanModal : () => {}}
                  onDelete={canEdit ? openDeleteFloorplanModal : () => {}}
                  onReorder={canEdit ? handleReorderFloorplans : () => {}}
                  onAdd={canEdit ? openCreateFloorplanModal : () => {}}
                  readOnly={!canEdit}
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
                        onPlacementUpdate={canEdit ? handlePlacementUpdate : () => {}}
                        onPlacementDelete={canEdit ? handlePlacementDelete : () => {}}
                        isResizingRef={isResizingRef}
                        zoomRef={canvasZoomRef}
                        scaleRef={canvasScaleRef}
                        isDuplicating={isDuplicating}
                        isItemDragging={!!activeDragItem}
                        visibleCategoryIds={visibleCategories}
                        areas={localAreas}
                        hiddenAreaIds={hiddenAreaIds}
                        selectedAreaId={selectedAreaId}
                        onSelectArea={setSelectedAreaId}
                        onAreaMove={canEdit ? handleAreaMove : () => {}}
                        onAreaVertexMove={canEdit ? handleAreaVertexMove : () => {}}
                        onAreaVerticesReplace={canEdit ? handleAreaVerticesReplace : () => {}}
                        onAreaVertexAdd={canEdit ? handleAreaVertexAdd : () => {}}
                        onAreaVertexDelete={canEdit ? handleAreaVertexDelete : () => {}}
                        onAreaVerticesCommit={canEdit ? handleAreaVerticesCommit : () => {}}
                        onAreaEdit={canEdit ? (id) => setEditingArea(localAreas.find(a => a.id === id) || null) : () => {}}
                        onAreaDelete={canEdit ? async (id) => {
                          await deleteArea(id);
                          if (activeFloorplan) fetchPlacements(activeFloorplan.id);
                        } : () => {}}
                        onCanvasBoundsChange={setCanvasBounds}
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
                <TabsTrigger value="areas" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  Areas
                </TabsTrigger>
                <TabsTrigger value="bom" className="data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-medium data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent data-[state=inactive]:hover:text-foreground rounded-none bg-transparent shadow-none border-0 px-3 py-2">
                  BOM
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
                  onToggleAllCategories={handleToggleAllCategories}
                  categoryCounts={categoryCounts}
                />
              </TabsContent>

              <TabsContent
                value="areas"
                forceMount
                className={`flex-1 m-0 overflow-hidden ${activeTab !== 'areas' ? 'hidden' : ''}`}
              >
                <AreasPanel
                  areas={areas}
                  selectedAreaId={selectedAreaId}
                  onSelectArea={setSelectedAreaId}
                  onEditArea={canEdit ? (id) => setEditingArea(areas.find(a => a.id === id) || null) : () => {}}
                  onDeleteArea={canEdit ? async (id) => {
                    await deleteArea(id);
                    if (activeFloorplan) fetchPlacements(activeFloorplan.id);
                  } : () => {}}
                  onToggleAreaVisibility={handleToggleAreaVisibility}
                  onToggleAllAreasVisibility={handleToggleAllAreasVisibility}
                  hiddenAreaIds={hiddenAreaIds}
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
                    areas={areas}
                    placements={placements}
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
                  onConfigureInvoice={canEdit ? () => setShowInvoiceModal(true) : () => {}}
                  items={items}
                  categories={categories}
                  getFloorplanAreaData={getFloorplanAreaData}
                />
              </TabsContent>
            </Tabs>

            {/* Project Total - shown in Products and BOM tabs */}
            {(activeTab === 'products' || activeTab === 'areas' || activeTab === 'bom') && (
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
          {isDraggingArea && (
            <div
              className="w-[120px] h-[90px] rounded border-2 border-primary bg-primary/10 flex items-center justify-center shadow-lg"
            >
              <span className="text-xs font-medium text-primary">New Area</span>
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

      {/* Invoice Settings Modal */}
      <InvoiceSettingsModal
        projectId={projectId}
        bomTotal={projectTotal}
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSave={handleSaveInvoiceSettings}
        initialSettings={invoiceSettings || undefined}
      />

      <AreaEditModal
        area={editingArea}
        onSave={async (id, data) => { await updateArea(id, data); }}
        onClose={() => setEditingArea(null)}
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
