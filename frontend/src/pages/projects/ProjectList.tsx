import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Card, Table, Alert, Spinner, Select, TextInput } from 'flowbite-react';
import { HiPlus, HiTrash, HiPencil, HiEye, HiSearch, HiCheckCircle, HiXCircle } from 'react-icons/hi';
import { projectService, type Project, type CreateProjectDTO, type UpdateProjectDTO } from '../../services/project';
import { ProjectFormModal } from '../../components/projects/ProjectFormModal';
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

const ProjectList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('active'); // Default to active
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const fetchProjects = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await projectService.getAll(searchQuery || undefined, signal);
      setProjects(data);
      setError('');
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to fetch projects');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchProjects(controller.signal);
    return () => controller.abort();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjects();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open create modal if navigated from Home "Get Started"
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setProjectToEdit(null);
      setShowFormModal(true);
      // Clear the state so modal doesn't reopen on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, location.pathname, navigate]);

  const handleSubmitProject = async (data: CreateProjectDTO | UpdateProjectDTO) => {
    if (projectToEdit) {
      await projectService.update(projectToEdit.id, data as UpdateProjectDTO);
    } else {
      await projectService.create(data as CreateProjectDTO);
    }
    fetchProjects();
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await projectService.delete(projectToDelete.id);
    fetchProjects();
  };

  const openCreateModal = () => {
    setProjectToEdit(null);
    setShowFormModal(true);
  };

  const openEditModal = (project: Project) => {
    setProjectToEdit(project);
    setShowFormModal(true);
  };

  const openDeleteModal = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const filteredProjects = projects.filter(project => {
    if (filterStatus && project.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => {
    // Sort by project number (date first, then customer, then address)
    const numA = generateProjectNumber(a);
    const numB = generateProjectNumber(b);
    return numA.localeCompare(numB);
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage all your projects</p>
        </div>
        <Button onClick={openCreateModal}>
          <HiPlus className="mr-2 h-5 w-5" />
          New Project
        </Button>
      </div>

      {error && (
        <Alert color="failure" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Search and Filter */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <TextInput
              type="text"
              placeholder="Search by project name or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={HiSearch}
            />
          </div>
          <div className="w-40">
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="">All Statuses</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Projects Table */}
      <Card>
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>PROJECT NUMBER</Table.HeadCell>
            <Table.HeadCell>PROJECT NAME</Table.HeadCell>
            <Table.HeadCell>CUSTOMER</Table.HeadCell>
            <Table.HeadCell className="w-28">STATUS</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {filteredProjects.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="text-center py-8 text-gray-500">
                  No projects found. Create your first project to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredProjects.map((project) => (
                <Table.Row key={project.id} className="hover:bg-gray-50 transition-colors">
                  <Table.Cell className="text-sm text-gray-600">
                    {generateProjectNumber(project)}
                  </Table.Cell>
                  <Table.Cell className="font-medium">
                    {project.name}
                  </Table.Cell>
                  <Table.Cell>{project.customer_name}</Table.Cell>
                  <Table.Cell>
                    {project.status === 'active' ? (
                      <span className="inline-flex items-center text-green-600 text-sm">
                        <HiCheckCircle className="w-5 h-5 mr-1" />
                        Active
                      </span>
                    ) : project.status === 'completed' ? (
                      <span className="inline-flex items-center text-blue-600 text-sm">
                        <HiCheckCircle className="w-5 h-5 mr-1" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-600 text-sm">
                        <HiXCircle className="w-5 h-5 mr-1" />
                        Cancelled
                      </span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        <HiEye className="mr-1 h-4 w-4" />
                        Open
                      </Button>
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => openEditModal(project)}
                      >
                        <HiPencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        color="failure"
                        size="xs"
                        onClick={() => openDeleteModal(project)}
                      >
                        <HiTrash className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </Card>

      <ProjectFormModal
        project={projectToEdit}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setProjectToEdit(null);
        }}
        onSubmit={handleSubmitProject}
      />

      <ConfirmDeleteModal
        title="Delete Project"
        itemName={projectToDelete?.name || ''}
        warningText="This will permanently delete the project and all associated floorplans. This action cannot be undone."
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setProjectToDelete(null);
        }}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
};

export default ProjectList;
