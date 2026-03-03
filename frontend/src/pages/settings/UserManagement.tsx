import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { userService, type CreateUserDTO, type UpdateUserDTO } from '@/services/user';
import type { User } from '@/types';
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

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  const fetchUsers = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await userService.getAll(signal);
      setUsers(data);
      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.response?.data?.error || err.message || 'Failed to fetch users');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, []);

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
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
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
