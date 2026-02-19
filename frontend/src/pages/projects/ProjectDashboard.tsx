import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Spinner, Alert, Tabs, Dropdown } from 'flowbite-react';
import { HiArrowLeft, HiPlus, HiPencil, HiTrash, HiDotsVertical, HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { projectService, type Project } from '../../services/project';
import { floorplanService, type Floorplan, type CreateFloorplanDTO } from '../../services/floorplan';
import { ProjectFormModal } from '../../components/projects/ProjectFormModal';
import { FloorplanFormModal } from '../../components/floorplans/FloorplanFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Floorplan management state
  const [showFloorplanModal, setShowFloorplanModal] = useState(false);
  const [showDeleteFloorplanModal, setShowDeleteFloorplanModal] = useState(false);
  const [floorplanToEdit, setFloorplanToEdit] = useState<Floorplan | null>(null);
  const [floorplanToDelete, setFloorplanToDelete] = useState<Floorplan | null>(null);

  const fetchProjectData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const projectData = await projectService.getById(projectId, signal);
      setProject(projectData);

      const floorplansData = await floorplanService.getAll(projectId, signal);
      setFloorplans(floorplansData);
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
    
    // Create new order
    const newOrder = [...floorplans];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    
    // Update sort order via API
    await floorplanService.reorder(projectId, newOrder.map(fp => fp.id));
    await fetchProjectData();
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
          <Tabs>
            {floorplans.map((floorplan, index) => (
              <Tabs.Item 
                key={floorplan.id} 
                title={
                  <div className="flex items-center gap-2">
                    <span>{floorplan.name}</span>
                    <Dropdown
                      label=""
                      dismissOnClick={true}
                      renderTrigger={() => (
                        <button 
                          className="p-1 hover:bg-gray-200 rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HiDotsVertical className="h-4 w-4" />
                        </button>
                      )}
                    >
                      <Dropdown.Item onClick={() => openEditFloorplanModal(floorplan)}>
                        <HiPencil className="mr-2 h-4 w-4" />
                        Rename
                      </Dropdown.Item>
                      <Dropdown.Item 
                        onClick={() => handleReorderFloorplans(floorplan.id, 'up')}
                        disabled={index === 0}
                      >
                        <HiArrowUp className="mr-2 h-4 w-4" />
                        Move Left
                      </Dropdown.Item>
                      <Dropdown.Item 
                        onClick={() => handleReorderFloorplans(floorplan.id, 'down')}
                        disabled={index === floorplans.length - 1}
                      >
                        <HiArrowDown className="mr-2 h-4 w-4" />
                        Move Right
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item 
                        onClick={() => openDeleteFloorplanModal(floorplan)}
                        className="text-red-600"
                      >
                        <HiTrash className="mr-2 h-4 w-4" />
                        Delete
                      </Dropdown.Item>
                    </Dropdown>
                  </div>
                }
              >
                <div className="p-4">
                  {/* Configurator placeholder */}
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-500 mb-2">Configurator coming soon</p>
                      <p className="text-sm text-gray-400">Floorplan: {floorplan.name}</p>
                      {floorplan.image_path && (
                        <img
                          src={floorplanService.getImageUrl(floorplan.image_path)}
                          alt={floorplan.name}
                          className="mt-4 max-h-96 mx-auto rounded shadow"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </Tabs.Item>
            ))}
          </Tabs>
        )}
      </Card>

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
