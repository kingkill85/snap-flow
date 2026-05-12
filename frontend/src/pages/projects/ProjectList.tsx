import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { projectService, type Project, type CreateProjectDTO, type UpdateProjectDTO } from '@/services/project';
import { projectGroupService } from '@/services/projectGroup';
import type { ProjectGroup, ProjectVersion } from '@/services/projectGroup';
import { floorplanService } from '@/services/floorplan';
import { tenantService, type Tenant } from '@/services/tenants';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { CreateVersionModal } from '@/components/projects/CreateVersionModal';
import { EditGroupModal } from '@/components/projects/EditGroupModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import { Plus, Pencil, Trash2, Eye, Search, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight, Save, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { extractErrorMessage } from '@/utils';

// Generate project number: YYYY-MM-DD_Customer Name_Address
const generateProjectNumber = (group: ProjectGroup): string => {
  const date = new Date(group.created_at);
  const formattedDate = date.toISOString().split('T')[0];
  const customerName = group.customer_name || 'Unknown';
  const address = group.customer_address || 'No Address';
  return `${formattedDate}_${customerName}_${address}`;
};

type VersionStatus = 'active' | 'completed' | 'cancelled';

const ProjectList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isUser = user?.role === 'user';
  const canManage = !isUser;

  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteVersionModal, setShowDeleteVersionModal] = useState(false);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [showCreateVersionModal, setShowCreateVersionModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showEditVersionModal, setShowEditVersionModal] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<ProjectVersion | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<ProjectGroup | null>(null);
  const [groupForAction, setGroupForAction] = useState<ProjectGroup | null>(null);
  const [versionForAction, setVersionForAction] = useState<ProjectVersion | null>(null);
  const [sourceProjectId, setSourceProjectId] = useState<number | null>(null);
  const [floorplanCount, setFloorplanCount] = useState<number>(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isEditVersionSubmitting, setIsEditVersionSubmitting] = useState(false);
  const [editVersionError, setEditVersionError] = useState('');
  const [editVersionForm, setEditVersionForm] = useState({ version_name: '', status: 'active' as VersionStatus });
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const hasInitializedSearchRef = useRef(false);
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const fetchGroups = useCallback(async (signal?: AbortSignal, isSearch = false) => {
    try {
      if (isSearch) {
        setIsSearching(true);
      } else {
        setIsLoading(true);
      }
      const data = await projectGroupService.getAll(searchQueryRef.current || undefined, signal);
      setGroups(data);
      setError('');
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, '');
      if (errorMessage !== 'AbortError') {
        setError(extractErrorMessage(err) || 'Failed to fetch projects');
      }
    } finally {
      if (isSearch) {
        setIsSearching(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    const controller = new AbortController();
    fetchGroups(controller.signal);
    if (isAdmin) {
      tenantService.getAll(controller.signal).then((data) => {
        setTenants(data);
        const map: Record<number, string> = {};
        data.forEach((t: Tenant) => { map[t.id] = t.name; });
        setTenantMap(map);
      }).catch(() => { /* ignore */ });
    }
    return () => {
      controller.abort();
    };
  }, [fetchGroups, isAdmin]);

  // Debounced search
  useEffect(() => {
    if (!hasInitializedSearchRef.current) {
      hasInitializedSearchRef.current = true;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchGroups(controller.signal, true);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, fetchGroups]);

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
    fetchGroups();
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    setIsDeletingGroup(true);
    try {
      await projectGroupService.delete(groupToDelete.id);
      setShowDeleteGroupModal(false);
      setGroupToDelete(null);
      fetchGroups();
    } catch (_err: unknown) {
      /* ignore - error shown elsewhere or not */
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleDeleteVersion = async () => {
    if (!versionToDelete) return;
    setIsDeletingVersion(true);
    try {
      await projectService.delete(versionToDelete.id);
      setShowDeleteVersionModal(false);
      setVersionToDelete(null);
      fetchGroups();
    } catch (_err: unknown) {
      /* ignore - error shown elsewhere or not */
    } finally {
      setIsDeletingVersion(false);
    }
  };

  const openCreateModal = () => {
    setProjectToEdit(null);
    setShowFormModal(true);
  };

  const openLatest = (group: ProjectGroup) => {
    if (group.versions.length > 0) {
      navigate(`/projects/${group.versions[0].id}`);
    }
  };

  const openCreateVersion = (group: ProjectGroup, sourceVersionId: number) => {
    setGroupForAction(group);
    setSourceProjectId(sourceVersionId);
    setShowCreateVersionModal(true);
  };

  const openEditGroup = (group: ProjectGroup) => {
    setGroupForAction(group);
    setShowEditGroupModal(true);
  };

  const openDeleteGroup = (group: ProjectGroup) => {
    setGroupToDelete(group);
    setShowDeleteGroupModal(true);
  };

  const handleCreateVersion = async (groupId: number, versionName: string, sourceProjectId: number) => {
    await projectGroupService.createVersion(groupId, { version_name: versionName, source_project_id: sourceProjectId });
    fetchGroups();
  };

  const openEditVersion = (version: ProjectVersion) => {
    setVersionForAction(version);
    setEditVersionForm({ version_name: version.version_name, status: version.status });
    setEditVersionError('');
    setShowEditVersionModal(true);
  };

  const handleEditVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionForAction) return;
    setEditVersionError('');
    setIsEditVersionSubmitting(true);
    try {
      await projectService.update(versionForAction.id, {
        version_name: editVersionForm.version_name,
        status: editVersionForm.status,
      });
      setShowEditVersionModal(false);
      setVersionForAction(null);
      fetchGroups();
    } catch (err: unknown) {
      setEditVersionError(extractErrorMessage(err, 'Failed to update version'));
    } finally {
      setIsEditVersionSubmitting(false);
    }
  };

  const openDeleteVersion = async (version: ProjectVersion) => {
    setVersionToDelete(version);
    try {
      const floorplans = await floorplanService.getAll(version.id);
      setFloorplanCount(floorplans.length);
    } catch {
      setFloorplanCount(0);
    }
    setShowDeleteVersionModal(true);
  };

  const toggleExpand = (groupId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getGroupStatus = (group: ProjectGroup): VersionStatus | string => {
    if (group.versions.length === 0) return '-';
    if (group.versions.some(v => v.status === 'active')) return 'active';
    return group.versions[0].status;
  };

  const filteredGroups = groups.filter(group => {
    if (filterStatus !== 'all') {
      return group.versions.some(v => v.status === filterStatus);
    }
    return true;
  }).sort((a, b) => {
    const numA = generateProjectNumber(a);
    const numB = generateProjectNumber(b);
    return numA.localeCompare(numB);
  });

  const renderStatusBadge = (status: string) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center text-green-600 text-sm">
          <CheckCircle className="w-4 h-4 mr-1" />
          Active
        </span>
      );
    }
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center text-blue-600 text-sm">
          <CheckCircle className="w-4 h-4 mr-1" />
          Completed
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center text-red-600 text-sm">
          <XCircle className="w-4 h-4 mr-1" />
          Cancelled
        </span>
      );
    }
    return <span className="text-muted-foreground text-sm">{status}</span>;
  };

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
                <TableHead className="w-8"></TableHead>
                <TableHead>Project Number</TableHead>
                <TableHead>Group Name</TableHead>
                <TableHead>Customer</TableHead>
                {isAdmin && <TableHead>Tenant</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-40"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    No projects found. Create your first project to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map((group) => (
                  <>
                    <TableRow key={`group-${group.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(group.id)}>
                      <TableCell className="p-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); toggleExpand(group.id); }}>
                          {expandedGroups.has(group.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {generateProjectNumber(group)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {group.name}{' '}
                        <span className="text-muted-foreground text-xs">
                          ({group.versions.length} versions)
                        </span>
                      </TableCell>
                      <TableCell>{group.customer_name}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground">
                          {tenantMap[group.tenant_id] || '—'}
                        </TableCell>
                      )}
                      <TableCell>{renderStatusBadge(getGroupStatus(group))}</TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openLatest(group)}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Open
                          </Button>
                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditGroup(group)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit Group
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteGroup(group)}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete Group
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedGroups.has(group.id) && (
                      <>
                        {group.versions.map((version) => (
                          <TableRow key={`version-${version.id}`} className="bg-muted/30">
                            <TableCell className="p-2"></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="pl-8 font-medium text-sm">
                              {version.version_name}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(version.created_at).toLocaleDateString()}
                            </TableCell>
                            {isAdmin && <TableCell></TableCell>}
                            <TableCell>{renderStatusBadge(version.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/projects/${version.id}`)}
                                >
                                  <Eye className="mr-1 h-3 w-3" />
                                  Open
                                </Button>
                                {canManage && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openCreateVersion(group, version.id)}
                                  >
                                    <Plus className="mr-1 h-3 w-3" />
                                    Create Version
                                  </Button>
                                )}
                                {(canManage || version.status === 'active') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditVersion(version)}
                                  >
                                    <Pencil className="mr-1 h-3 w-3" />
                                    Edit
                                  </Button>
                                )}
                                {canManage && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => openDeleteVersion(version)}
                                  >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProjectFormModal
        project={projectToEdit}
        tenants={isAdmin ? tenants : undefined}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setProjectToEdit(null);
        }}
        onSubmit={handleSubmitProject}
      />

      <CreateVersionModal
        groupName={groupForAction?.name || ''}
        existingVersionNames={groupForAction?.versions.map(v => v.version_name) || []}
        sourceProjectId={sourceProjectId ?? 0}
        isOpen={showCreateVersionModal}
        onClose={() => {
          setShowCreateVersionModal(false);
          setGroupForAction(null);
          setSourceProjectId(null);
        }}
        onSubmit={async (data) => {
          if (groupForAction && data.source_project_id) {
            await handleCreateVersion(groupForAction.id, data.version_name, data.source_project_id);
          }
        }}
      />

      <EditGroupModal
        group={groupForAction}
        isOpen={showEditGroupModal}
        onClose={() => {
          setShowEditGroupModal(false);
          setGroupForAction(null);
        }}
        onSubmit={async (data) => {
          if (groupForAction) {
            await projectGroupService.update(groupForAction.id, data);
            fetchGroups();
            setShowEditGroupModal(false);
            setGroupForAction(null);
          }
        }}
      />

      {/* Edit Version Modal */}
      <Dialog open={showEditVersionModal} onOpenChange={(open) => !open && setShowEditVersionModal(false)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Version</DialogTitle>
            <DialogDescription>Update version details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditVersion}>
            {editVersionError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{editVersionError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="version_name">Version Name *</Label>
                <Input
                  id="version_name"
                  type="text"
                  required
                  value={editVersionForm.version_name}
                  onChange={(e) => setEditVersionForm({ ...editVersionForm, version_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version_status">Status</Label>
                <Select
                  value={editVersionForm.status}
                  onValueChange={(value: VersionStatus) => setEditVersionForm({ ...editVersionForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditVersionModal(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={isEditVersionSubmitting}>
                {isEditVersionSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Update
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteModal
        title={floorplanCount > 0 ? 'Cannot Delete Version' : 'Delete Version'}
        itemName={versionToDelete?.version_name || ''}
        warningText={floorplanCount > 0 ? undefined : 'This will permanently delete the version. This action cannot be undone.'}
        isOpen={showDeleteVersionModal}
        onClose={() => {
          setShowDeleteVersionModal(false);
          setVersionToDelete(null);
          setFloorplanCount(0);
        }}
        onConfirm={handleDeleteVersion}
        disabled={floorplanCount > 0 || isDeletingVersion}
        disabledMessage={`This version has ${floorplanCount} floorplan${floorplanCount === 1 ? '' : 's'} and cannot be deleted. Please delete all floorplans first.`}
      />

      <ConfirmDeleteModal
        title="Delete Group"
        itemName={groupToDelete?.name || ''}
        warningText="This will permanently delete the group and all its versions. This action cannot be undone."
        isOpen={showDeleteGroupModal}
        onClose={() => {
          setShowDeleteGroupModal(false);
          setGroupToDelete(null);
        }}
        onConfirm={handleDeleteGroup}
        disabled={isDeletingGroup}
      />
    </div>
  );
};

export default ProjectList;
