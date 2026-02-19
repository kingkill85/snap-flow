import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Spinner, Alert, Tabs } from 'flowbite-react';
import { HiArrowLeft, HiPlus, HiPencil, HiTrash, HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { DndContext, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { projectService, type Project } from '../../services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '../../services/floorplan';
import { placementService, type Placement, type CreatePlacementDTO } from '../../services/placement';
import { itemService, type Item, type ItemVariant } from '../../services/item';
import { ProjectFormModal } from '../../components/projects/ProjectFormModal';
import { FloorplanFormModal } from '../../components/floorplans/FloorplanFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import { Canvas } from '../../components/configurator/Canvas';
import { ItemPalette } from '../../components/configurator/ItemPalette';
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

  // DnD sensors
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
        itemService.getAll({ include_inactive: false }),
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
      // Update mode
      await floorplanService.update(floorplanToEdit.id, data);
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
    await placementService.update(id, placement);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
  };

  const handlePlacementDelete = async (id: number) => {
    await placementService.delete(id);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    console.log('Drag started:', event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !activeFloorplan) return;
    
    // Check if dropped on canvas
    if (over.id.toString().startsWith('canvas-')) {
      const variantData = active.data.current as { variant: ItemVariant; item: Item } | undefined;
      
      if (variantData?.variant) {
        // Get drop coordinates from event
        const x = event.delta.x;
        const y = event.delta.y;
        
        // Default size for new placements (100x100)
        handlePlacementCreate({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: 100,
          height: 100,
          item_variant_id: variantData.variant.id,
        });
      }
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Button color="light" size="sm" onClick={() => navigate('/projects')} className="mb-4">
            <HiArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
          <div className="text-sm text-gray-500 mb-2">
            {generateProjectNumber(project)}
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Customer: {project.customer_name}
          </p>
          {project.customer_email && (
            <p className="text-gray-500 text-sm mt-1">
              Email: {project.customer_email}
            </p>
          )}
          {project.customer_phone && (
            <p className="text-gray-500 text-sm mt-1">
              Phone: {project.customer_phone}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button color="light" onClick={() => setShowEditModal(true)}>
            <HiPencil className="mr-2 h-5 w-5" />
            Edit
          </Button>
          <Button color="failure" onClick={() => setShowDeleteModal(true)}>
            <HiTrash className="mr-2 h-5 w-5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Floorplan Tabs */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Floorplans</h2>
          <Button size="sm" onClick={openCreateFloorplanModal}>
            <HiPlus className="mr-2 h-4 w-4" />
            Add Floorplan
          </Button>
        </div>

        {floorplans.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No floorplans yet. Add your first floorplan to start configuring.</p>
          </div>
        ) : (
          <div className="floorplan-tabs">
            <Tabs 
              onActiveTabChange={(index) => setActiveFloorplan(floorplans[index] || null)}
            >
              {floorplans.map((floorplan, index) => (
              <Tabs.Item 
                key={floorplan.id}
                active={activeFloorplan?.id === floorplan.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{floorplan.name}</span>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          openEditFloorplanModal(floorplan);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                        title="Rename"
                      >
                        <HiPencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (index > 0) handleReorderFloorplans(floorplan.id, 'up');
                        }}
                        disabled={index === 0}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Left"
                      >
                        <HiArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (index < floorplans.length - 1) handleReorderFloorplans(floorplan.id, 'down');
                        }}
                        disabled={index === floorplans.length - 1}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Right"
                      >
                        <HiArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          openDeleteFloorplanModal(floorplan);
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors"
                        title="Delete"
                      >
                        <HiTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                }
              >
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex gap-4" style={{ height: '70vh', minHeight: '500px' }}>
                    {/* Item Palette Sidebar */}
                    <div className="w-72 flex-shrink-0">
                      <ItemPalette />
                    </div>
                    
                    {/* Canvas Area */}
                    <div className="flex-1 min-w-0">
                      <Canvas
                        floorplan={floorplan}
                        placements={placements}
                        itemVariants={items.flatMap(item => item.variants || [])}
                        onPlacementCreate={handlePlacementCreate}
                        onPlacementUpdate={handlePlacementUpdate}
                        onPlacementDelete={handlePlacementDelete}
                      />
                    </div>
                  </div>
                </DndContext>
              </Tabs.Item>
            ))}
            </Tabs>
          </div>
        )}
      </Card>

      {/* Custom styles for floorplan tabs - higher contrast */}
      <style>{`
        .floorplan-tabs [role="tablist"] {
          background-color: #f3f4f6;
          border-radius: 0.5rem;
          padding: 0.25rem;
          gap: 0.25rem;
        }
        .floorplan-tabs [role="tab"] {
          background-color: #e5e7eb;
          border-radius: 0.375rem;
          font-weight: 500;
          color: #374151;
          padding: 0.75rem 1rem;
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
      `}</style>

      {/* Summary Panel Placeholder */}
      <Card>
        <h2 className="text-xl font-semibold mb-4">Project Summary</h2>
        <div className="text-center py-8 text-gray-500">
          <p>Summary panel coming soon</p>
          <p className="text-sm mt-2">This will show item quantities and pricing</p>
        </div>
      </Card>

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
