import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, Alert, Tabs } from 'flowbite-react';
import { HiArrowLeft, HiPlus, HiPencil, HiTrash, HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { projectService, type Project } from '../../services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '../../services/floorplan';
import { placementService, type Placement, type CreatePlacementDTO } from '../../services/placement';
import { itemService, type Item } from '../../services/item';
import { ProjectFormModal } from '../../components/projects/ProjectFormModal';
import { FloorplanFormModal } from '../../components/floorplans/FloorplanFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import { Canvas } from '../../components/configurator/Canvas';
import { ProductPanel } from '../../components/configurator/ProductPanel';
import axios from 'axios';

// Generate project number: YYYY-MM-DD_Customer Name_Address
const generateProjectNumber = (project: Project): string => {
  const date = new Date(project.created_at);
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
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
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Floorplan management state
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [showDeleteFloorplanModal, setShowDeleteFloorplanModal] = useState(false);
  const [floorplanToEdit, setFloorplanToEdit] = useState<Floorplan | null>(null);
  const [floorplanToDelete, setFloorplanToDelete] = useState<Floorplan | null>(null);
  // Track active drag item for overlay
  const [activeDragItem, setActiveDragItem] = useState<Item | null>(null);

  // DnD sensors - with custom activation to skip resize handles
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
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to load project data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch placements for active floorplan
  const fetchPlacements = async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const placementsData = await placementService.getAll(floorplanId, signal);
      setPlacements(placementsData);
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        console.error('Failed to load placements:', err);
      }
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

  const handleUpdateProject = async (data: Parameters<typeof projectService.update>[1]) => {
    await projectService.update(projectId, data);
    fetchProjectData();
  };

  const handleDeleteProject = async () => {
    await projectService.delete(projectId);
    navigate('/projects');
  };

  // Floorplan handlers
  interface UpdateFloorDTO {
    name?: string;
    sort_order?: number;
  }

  const handleSubmitFloorplan = async (data: CreateFloorplanDTO | UpdateFloorDTO, image?: File) => {
    if (floorplanToEdit) {
      // Update mode - pass image if provided
      await floorplanService.update(floorplanToEdit.id, data, image);
    } else {
      // Create mode
      if (!image) throw new Error('Image is required');
      await floorplanService.create(data as CreateFloorplanDTO, image);
    }
    await fetchProjectData();
  };

  const handleDeleteFloorplan = async () => {
    if (!floorplanToDelete) return;
    await floorplanService.delete(floorplanToDelete.id);
    setActiveFloorplan(null);
    await fetchProjectData();
  };

  const handleReorderFloorplans = async (floorplanId: number, direction: 'up' | 'down') => {
    const currentIndex = floorplans.findIndex(fp => fp.id === floorplanId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= floorplans.length) return;

    // Reorder logic...
    const newOrder = [...floorplans];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    await floorplanService.reorder(projectId, newOrder.map(fp => fp.id));
    await fetchProjectData();
  };

  // Placement handlers
  const handlePlacementCreate = async (placement: { x: number; y: number; width: number; height: number; item_variant_id: number }) => {
    if (!activeFloorplan) return;
    
    const createData: CreatePlacementDTO = {
      floorplan_id: activeFloorplan.id,
      item_variant_id: placement.item_variant_id,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };
    
    await placementService.create(createData);
    await fetchPlacements(activeFloorplan.id);
  };

  const handlePlacementUpdate = async (id: number, placement: { x?: number; y?: number; width?: number; height?: number }) => {
    // Optimistically update local state first for instant feedback
    setPlacements(prev => prev.map(p => 
      p.id === id ? { ...p, ...placement } : p
    ));
    
    // Update server in the background
    await placementService.update(id, placement);
  };

  const handlePlacementDelete = async (id: number) => {
    await placementService.delete(id);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
  };

  // Track if we're currently resizing (to skip move logic)
  const isResizingRef = useRef(false);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id.toString();
    
    // Track item being dragged from palette
    if (activeId.startsWith('item-')) {
      const itemData = event.active.data.current as { item: Item } | undefined;
      if (itemData?.item) {
        setActiveDragItem(itemData.item);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Skip if we're resizing - the Canvas component handles resize
    if (isResizingRef.current) {
      isResizingRef.current = false;
      return;
    }
    
    if (!over || !activeFloorplan) return;
    
    const activeId = active.id.toString();
    const overId = over.id.toString();
    
    // Handle moving existing placement
    if (activeId.startsWith('placement-')) {
      const placementId = parseInt(activeId.replace('placement-', ''));
      const placement = placements.find(p => p.id === placementId);
      
      if (placement && overId.startsWith('canvas-')) {
        // Get canvas element
        const canvasElement = document.querySelector(`[data-canvas-id="${activeFloorplan.id}"]`);
        if (!canvasElement) {
          console.error('Canvas element not found');
          return;
        }
        
        // Get the floorplan image to calculate scale
        const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
        if (!floorplanImage) {
          console.error('Floorplan image not found');
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
          
          // Calculate new position relative to the image (not the canvas)
          const screenX = Math.max(0, activeRect.left - imageRect.left);
          const screenY = Math.max(0, activeRect.top - imageRect.top);
          const newX = screenX / scaleX;
          const newY = screenY / scaleY;
          
          // Update state immediately (don't await) to prevent flicker
          handlePlacementUpdate(placementId, { x: newX, y: newY });
        }
      }
      return;
    }
    
    // Handle creating new placement from palette
    if (activeId.startsWith('item-') && overId.startsWith('canvas-')) {
      const itemData = active.data.current as { item: Item } | undefined;
      
      if (itemData?.item) {
        try {
          const canvasElement = document.querySelector(`[data-canvas-id="${activeFloorplan.id}"]`);
          if (!canvasElement) {
            console.error('Canvas element not found');
            return;
          }
          
          // Get the floorplan image to calculate scale
          const floorplanImage = canvasElement.querySelector('img[data-floorplan-image="true"]') as HTMLImageElement | null;
          if (!floorplanImage) {
            console.error('Floorplan image not found');
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
            // Place at top-left corner of dragged item relative to the image
            screenX = activeRect.left - imageRect.left;
            screenY = activeRect.top - imageRect.top;
          } else {
            screenX = event.delta.x;
            screenY = event.delta.y;
          }
          
          // Clamp to image bounds
          screenX = Math.max(0, Math.min(screenX, imageRect.width - 100));
          screenY = Math.max(0, Math.min(screenY, imageRect.height - 100));
          
          // Convert to natural coordinates
          const dropX = screenX / scaleX;
          const dropY = screenY / scaleY;
          
          const fullItem = await itemService.getById(itemData.item.id);
          const firstVariant = fullItem.variants?.[0];
          
          if (firstVariant) {
            await handlePlacementCreate({
              x: dropX,
              y: dropY,
              width: 60,
              height: 60,
              item_variant_id: firstVariant.id,
            });
          }
        } catch (err) {
          console.error('Failed to create placement:', err);
        }
      }
    }
    
    // Clear active drag item
    setActiveDragItem(null);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Button color="light" onClick={() => navigate('/projects')}>
          <HiArrowLeft className="mr-2 h-5 w-5" />
          Back to Projects
        </Button>
        <Alert color="failure">
          {error || 'Project not found'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Compact Project Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button color="light" size="xs" onClick={() => navigate('/projects')}>
            <HiArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="h-6 w-px bg-gray-300"></div>
          <div className="text-sm text-gray-500 font-mono">
            {generateProjectNumber(project)}
          </div>
          <div className="h-6 w-px bg-gray-300"></div>
          <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
          <div className="h-6 w-px bg-gray-300"></div>
          <span className="text-sm text-gray-600">{project.customer_name}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button color="light" size="xs" onClick={() => setShowEditModal(true)}>
            <HiPencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
          <Button color="failure" size="xs" onClick={() => setShowDeleteModal(true)}>
            <HiTrash className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Configurator Area - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* View Toggle (Future: Configurator/BOM) */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <div className="flex gap-1">
              <Button 
                color="light" 
                size="xs"
                className="bg-gray-100 text-gray-900"
              >
                Configurator
              </Button>
              <Button 
                color="light" 
                size="xs"
                disabled
              >
                BOM View
              </Button>
            </div>
            <Button size="xs" onClick={openCreateFloorplanModal}>
              <HiPlus className="mr-1 h-4 w-4" />
              Add Floorplan
            </Button>
          </div>

          {/* Floorplan Tabs & Canvas */}
          {floorplans.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="mb-2">No floorplans yet.</p>
                <Button size="sm" onClick={openCreateFloorplanModal}>
                  <HiPlus className="mr-2 h-4 w-4" />
                  Add Your First Floorplan
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden floorplan-tabs">
              <Tabs 
                onActiveTabChange={(index) => setActiveFloorplan(floorplans[index] || null)}
                className="h-full flex flex-col overflow-hidden"
              >
                {floorplans.map((floorplan, index) => (
                  <Tabs.Item 
                    key={floorplan.id}
                    active={activeFloorplan?.id === floorplan.id}
                    title={
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{floorplan.name}</span>
                        <div className="flex items-center gap-0.5 ml-1">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openEditFloorplanModal(floorplan);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                            title="Rename"
                            role="button"
                          >
                            <HiPencil className="h-3 w-3" />
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (index > 0) handleReorderFloorplans(floorplan.id, 'up');
                            }}
                            className={`p-1 text-gray-600 hover:bg-gray-200 rounded transition-colors cursor-pointer ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Move Left"
                            role="button"
                          >
                            <HiArrowUp className="h-3 w-3" />
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (index < floorplans.length - 1) handleReorderFloorplans(floorplan.id, 'down');
                            }}
                            className={`p-1 text-gray-600 hover:bg-gray-200 rounded transition-colors cursor-pointer ${index === floorplans.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Move Right"
                            role="button"
                          >
                            <HiArrowDown className="h-3 w-3" />
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openDeleteFloorplanModal(floorplan);
                            }}
                            className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors cursor-pointer"
                            title="Delete"
                            role="button"
                          >
                            <HiTrash className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    }
                  >
                    <DndContext
                      sensors={sensors}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="h-full overflow-hidden">
                        <Canvas
                          floorplan={floorplan}
                          placements={placements}
                          items={items}
                          onPlacementUpdate={handlePlacementUpdate}
                          onPlacementDelete={handlePlacementDelete}
                          isResizingRef={isResizingRef}
                        />
                      </div>
                      
                      {/* Drag overlay - shows just the item image (like it will appear on canvas) */}
                      <DragOverlay>
                        {activeDragItem && (
                          <div className="border-2 border-blue-500 rounded bg-white shadow-xl cursor-grabbing overflow-hidden" style={{ width: '100px', height: '100px' }}>
                            {activeDragItem.preview_image ? (
                              <img
                                src={`/uploads/${activeDragItem.preview_image}`}
                                alt={activeDragItem.name}
                                className="w-full h-full object-contain bg-gray-100"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                No img
                              </div>
                            )}
                          </div>
                        )}
                      </DragOverlay>
                    </DndContext>
                  </Tabs.Item>
                ))}
              </Tabs>
            </div>
          )}
        </div>

        {/* Right Side - Product Panel */}
        <ProductPanel placements={placements} />
      </div>

      {/* Custom styles for floorplan tabs - higher contrast */}
      <style>{`
        .floorplan-tabs {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .floorplan-tabs [role="tablist"] {
          background-color: #f3f4f6;
          border-radius: 0.5rem;
          padding: 0.25rem;
          gap: 0.25rem;
          margin: 0.5rem 1rem 0.5rem 1rem;
          flex-shrink: 0;
        }
        .floorplan-tabs [role="tabpanel"] {
          flex: 1;
          overflow: hidden;
          padding: 0 !important;
        }
        .floorplan-tabs [role="tabpanel"] > div {
          height: 100%;
        }
        .floorplan-tabs [role="tab"] {
          background-color: #e5e7eb;
          border-radius: 0.375rem;
          font-weight: 500;
          color: #374151;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .floorplan-tabs [role="tab"]:hover {
          background-color: #d1d5db;
          color: #111827;
        }
        .floorplan-tabs [role="tab"][aria-selected="true"] {
          background-color: #ffffff;
          color: #111827;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }
        .floorplan-tabs [role="tab"][aria-selected="true"]:hover {
          background-color: #ffffff;
        }
        /* Remove default Flowbite tab panel padding */
        .floorplan-tabs .p-4 {
          padding: 0 !important;
        }
      `}</style>

      {/* Modals */}
      <ProjectFormModal
        project={project}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdateProject}
      />

      <ConfirmDeleteModal
        title="Delete Project"
        itemName={project.name}
        warningText="This will permanently delete the project and all associated floorplans and placements. This action cannot be undone."
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteProject}
      />

      {/* Floorplan Modals */}
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

      <ConfirmDeleteModal
        title="Delete Floorplan"
        itemName={floorplanToDelete?.name || ''}
        warningText="This will permanently delete the floorplan and all placements on it. This action cannot be undone."
        isOpen={showDeleteFloorplanModal}
        onClose={() => {
          setShowDeleteFloorplanModal(false);
          setFloorplanToDelete(null);
        }}
        onConfirm={handleDeleteFloorplan}
      />
    </div>
  );
};

export default ProjectDashboard;
