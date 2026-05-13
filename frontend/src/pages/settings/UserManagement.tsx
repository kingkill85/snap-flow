import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { userService, type CreateUserDTO, type UpdateUserDTO } from '@/services/user';
import { tenantService, type Tenant } from '@/services/tenants';
import type { User } from '@/types';
import { roleLabels } from '@/types';
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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserFormModal } from '@/components/users/UserFormModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { extractErrorMessage } from '@/utils';

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantMap, setTenantMap] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  const isAdmin = currentUser?.role === 'admin';

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await userService.getAll(signal);
      setUsers(data);

      // Fetch tenants for admin users
      if (currentUser?.role === 'admin') {
        const tenantData = await tenantService.getAll(signal);
        setTenants(tenantData);
        const map: Record<number, string> = {};
        tenantData.forEach((t: Tenant) => { map[t.id] = t.name; });
        setTenantMap(map);
      }

      setError('');
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, '');
      if (errorMessage !== 'AbortError') {
        setError(extractErrorMessage(err) || 'Failed to fetch users');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.role]);

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [fetchUsers]);

  const handleSubmitUser = async (data: CreateUserDTO | UpdateUserDTO) => {
    if (userToEdit) {
      await userService.update(userToEdit.id, data as UpdateUserDTO);
    } else {
      await userService.create(data as CreateUserDTO);
    }
    fetchUsers();
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    await userService.delete(userToDelete.id);
    fetchUsers();
  };

  const openCreateModal = () => {
    setUserToEdit(null);
    setShowFormModal(true);
  };

  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setShowFormModal(true);
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const getDisplayName = (user: User) => user.full_name || user.email;

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
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage system users and permissions</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader />
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                {isAdmin && <TableHead>Tenant</TableHead>}
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    No users found. Create your first user to get started.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {getDisplayName(user)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-muted-foreground">
                        {tenantMap[user.tenant_id ?? 0] || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'destructive' : user.role === 'tenant_admin' ? 'default' : 'secondary'}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteModal(user)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserFormModal
        user={userToEdit}
        currentUserRole={currentUser?.role ?? 'user'}
        tenants={isAdmin ? tenants : undefined}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setUserToEdit(null);
        }}
        onSubmit={handleSubmitUser}
      />

      <ConfirmDeleteModal
        title="Delete User"
        itemName={userToDelete?.full_name || userToDelete?.email || ''}
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
        }}
        onConfirm={handleDeleteUser}
      />
    </div>
  );
};

export default UserManagement;
