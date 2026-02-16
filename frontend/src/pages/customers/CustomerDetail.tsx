import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Table, Alert, Spinner, Badge } from 'flowbite-react';
import { HiArrowLeft, HiPlus, HiFolder, HiPencil, HiTrash } from 'react-icons/hi';
import { customerService, type Customer } from '../../services/customer';
import { projectService, type Project, type CreateProjectDTO, type UpdateProjectDTO } from '../../services/project';
import { ProjectFormModal } from '../../components/projects/ProjectFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import axios from 'axios';

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const customerId = parseInt(id || '0');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const fetchData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const customerData = await customerService.getById(customerId, signal);
      setCustomer(customerData);

      const projectsData = await customerService.getProjects(customerId, signal);
      setProjects(projectsData);

      setError('');
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to load customer data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [customerId]);

  const handleCreateProject = async (data: CreateProjectDTO | UpdateProjectDTO) => {
    await projectService.create(data as CreateProjectDTO);
    fetchData();
  };

  const handleUpdateProject = async (data: UpdateProjectDTO) => {
    if (!projectToEdit) return;
    await projectService.update(projectToEdit.id, data);
    fetchData();
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await projectService.delete(projectToDelete.id);
    fetchData();
  };

  const openCreateProjectModal = () => {
    setProjectToEdit(null);
    setShowProjectModal(true);
  };

  const openEditProjectModal = (project: Project) => {
    setProjectToEdit(project);
    setShowProjectModal(true);
  };

  const openDeleteProjectModal = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'completed':
        return 'info';
      case 'cancelled':
        return 'failure';
      default:
        return 'gray';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-6">
        <Button color="light" onClick={() => navigate('/customers')}>
          <HiArrowLeft className="mr-2 h-5 w-5" />
          Back to Customers
        </Button>
        <Alert color="failure">
          {error || 'Customer not found'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Button color="light" size="sm" onClick={() => navigate('/customers')} className="mb-4">
            <HiArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h1>
          <div className="mt-2 space-y-1 text-gray-600 dark:text-gray-400">
            {customer.email && <p>Email: {customer.email}</p>}
            {customer.phone && <p>Phone: {customer.phone}</p>}
            {customer.address && <p>Address: {customer.address}</p>}
          </div>
        </div>
        <Button onClick={openCreateProjectModal}>
          <HiPlus className="mr-2 h-5 w-5" />
          New Project
        </Button>
      </div>

      {/* Projects Section */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <HiFolder className="h-5 w-5" />
            Projects
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No projects yet. Create your first project to get started.</p>
          </div>
        ) : (
          <Table>
            <Table.Head>
              <Table.HeadCell>Project Name</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell>Created</Table.HeadCell>
              <Table.HeadCell className="text-right">Actions</Table.HeadCell>
            </Table.Head>
            <Table.Body className="divide-y">
              {projects.map((project) => (
                <Table.Row key={project.id} className="bg-white dark:border-gray-700 dark:bg-gray-800">
                  <Table.Cell className="whitespace-nowrap font-medium text-gray-900 dark:text-white">
                    {project.name}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={getStatusColor(project.status)}>
                      {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {new Date(project.created_at).toLocaleDateString()}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        Open
                      </Button>
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => openEditProjectModal(project)}
                      >
                        <HiPencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        color="failure"
                        size="xs"
                        onClick={() => openDeleteProjectModal(project)}
                      >
                        <HiTrash className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      {/* Modals */}
      <ProjectFormModal
        project={projectToEdit}
        customerId={customerId}
        isOpen={showProjectModal}
        onClose={() => {
          setShowProjectModal(false);
          setProjectToEdit(null);
        }}
        onSubmit={projectToEdit ? handleUpdateProject : handleCreateProject}
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

export default CustomerDetail;
