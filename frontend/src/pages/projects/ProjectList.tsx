import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { projectService, type Project, type CreateProjectDTO, type UpdateProjectDTO } from '@/services/project';
import { floorplanService } from '@/services/floorplan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import { Plus, Pencil, Trash2, Eye, Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Generate project number: YYYY-MM-DD_Customer Name_Address
const generateProjectNumber = (project: Project): string => {
  const date = new Date(project.created_at);
  const formattedDate = date.toISOString().split('T')[0];
  const customerName = project.customer_name || 'Unknown';
  const address = project.customer_address || 'No Address';
  return `${formattedDate}_${customerName}_${address}`;
};

const ProjectList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [floorplanCount, setFloorplanCount] = useState<number>(0);
  const hasInitializedSearchRef = useRef(false);

  const fetchProjects = async (signal?: AbortSignal, isSearch = false) => {
    try {
      if (isSearch) {
        setIsSearching(true);
      } else {
        setIsLoading(true);
      }
      const data = await projectService.getAll(searchQuery || undefined, signal);
      setProjects(data);
      setError('');
      if (!isSearch) {
        setIsLoading(false);
      } else {
        setIsSearching(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to fetch projects');
      }
      if (!isSearch) {
        setIsLoading(false);
      } else {
        setIsSearching(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    const controller = new AbortController();
    fetchProjects(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!hasInitializedSearchRef.current) {
      hasInitializedSearchRef.current = true;
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchProjects(controller.signal, true);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Open create modal if navigated from Home "Get Started"
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setProjectToEdit(null);
      setShowFormModal(true);
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

  const openDeleteModal = async (project: Project) => {
    setProjectToDelete(project);
    try {
      const floorplans = await floorplanService.getAll(project.id);
      setFloorplanCount(floorplans.length);
    } catch {
      setFloorplanCount(0);
    }
    setShowDeleteModal(true);
  };

  const filteredProjects = projects.filter(project => {
    if (filterStatus !== 'all' && project.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => {
    const numA = generateProjectNumber(a);
    const numB = generateProjectNumber(b);
    return numA.localeCompare(numB);
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage all your projects</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by project name or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-40">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="all">All Statuses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-end">
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Number</TableHead>
                <TableHead>Project Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No projects found. Create your first project to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {generateProjectNumber(project)}
                    </TableCell>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell>{project.customer_name}</TableCell>
                    <TableCell>
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
                        <span className="inline-flex items-center text-red-600 text-sm">
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancelled
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/projects/${project.id}`)}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(project)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteModal(project)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
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
        title={floorplanCount > 0 ? 'Cannot Delete Project' : 'Delete Project'}
        itemName={projectToDelete?.name || ''}
        warningText={floorplanCount > 0 ? undefined : 'This will permanently delete the project. This action cannot be undone.'}
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setProjectToDelete(null);
          setFloorplanCount(0);
        }}
        onConfirm={handleDeleteProject}
        disabled={floorplanCount > 0}
        disabledMessage={`This project has ${floorplanCount} floorplan${floorplanCount === 1 ? '' : 's'} and cannot be deleted. Please delete all floorplans first.`}
      />
    </div>
  );
};

export default ProjectList;
