import { useState, useEffect } from 'react';
import { Button, Card, Table, Modal, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiPlus, HiTrash, HiUserAdd, HiPencil } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import { userService, type User, type CreateUserDTO, type UpdateUserDTO } from '../../services/user';
import axios from 'axios';

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  // Create form state
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit form state
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchUsers = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await userService.getAll(signal);
      setUsers(data);
      setError('');
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        const errorData = err.response?.data?.error;
        // Handle Zod validation errors which come as objects
        let errorMessage: string;
        if (typeof errorData === 'object' && errorData !== null) {
          if (errorData.issues && Array.isArray(errorData.issues)) {
            errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        } else {
          errorMessage = errorData || err.message || 'Failed to fetch users';
        }
        setError(errorMessage);
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      const data: CreateUserDTO = {
        full_name: newUserFullName || undefined,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      };

      await userService.create(data);

      // Reset form and close modal
      setNewUserFullName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setShowCreateModal(false);
      
      // Refresh user list
      fetchUsers();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      // Handle Zod validation errors which come as objects
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        // Zod error format: { issues: [{ message: ... }], name: "ZodError" }
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || 'Failed to create user';
      }
      setCreateError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;

    setEditError('');
    setIsEditing(true);

    try {
      const data: UpdateUserDTO = {
        full_name: editFullName || null,
        email: editEmail,
        role: editRole,
      };
      
      // Only include password if it's set
      if (editPassword) {
        data.password = editPassword;
      }

      await userService.update(userToEdit.id, data);

      setShowEditModal(false);
      setUserToEdit(null);
      setEditPassword('');
      fetchUsers();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      // Handle Zod validation errors which come as objects
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || 'Failed to update user';
      }
      setEditError(errorMessage);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await userService.delete(userToDelete.id);

      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      // Handle Zod validation errors which come as objects
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || 'Failed to delete user';
      }
      setError(errorMessage);
    }
  };

  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setEditFullName(user.full_name || '');
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditError('');
    setShowEditModal(true);
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const getDisplayName = (user: User) => user.full_name || user.email;

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
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage system users and permissions</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <HiPlus className="mr-2 h-5 w-5" />
          Add User
        </Button>
      </div>

      {error && (
        <Alert color="failure" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <Table>
          <Table.Head>
            <Table.HeadCell>Name</Table.HeadCell>
            <Table.HeadCell>Email</Table.HeadCell>
            <Table.HeadCell>Role</Table.HeadCell>
            <Table.HeadCell>Created</Table.HeadCell>
            <Table.HeadCell>
              <span className="sr-only">Actions</span>
            </Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {users.map((user) => (
              <Table.Row key={user.id}>
                <Table.Cell className="font-medium">
                  {getDisplayName(user)}
                </Table.Cell>
                <Table.Cell className="text-gray-600">{user.email}</Table.Cell>
                <Table.Cell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {user.role}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {new Date(user.created_at).toLocaleDateString()}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button
                      color="light"
                      size="xs"
                      onClick={() => openEditModal(user)}
                    >
                      <HiPencil className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    {user.id !== currentUser?.id && (
                      <Button
                        color="failure"
                        size="xs"
                        onClick={() => openDeleteModal(user)}
                      >
                        <HiTrash className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Card>

      {/* Create User Modal */}
      <Modal show={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <Modal.Header>Create New User</Modal.Header>
        <Modal.Body>
          {createError && (
            <Alert color="failure" className="mb-4">
              {createError}
            </Alert>
          )}
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Label htmlFor="fullName" value="Full Name (Optional)" />
              <TextInput
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={newUserFullName}
                onChange={(e) => setNewUserFullName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email" value="Email" />
              <TextInput
                id="email"
                type="email"
                placeholder="user@example.com"
                required
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password" value="Password" />
              <TextInput
                id="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role" value="Role" />
              <Select
                id="role"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleCreateUser} disabled={isCreating}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              <>
                <HiUserAdd className="mr-2 h-5 w-5" />
                Create User
              </>
            )}
          </Button>
          <Button color="gray" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit User Modal */}
      <Modal show={showEditModal} onClose={() => setShowEditModal(false)}>
        <Modal.Header>Edit User</Modal.Header>
        <Modal.Body>
          {editError && (
            <Alert color="failure" className="mb-4">
              {editError}
            </Alert>
          )}
          <form onSubmit={handleEditUser} className="space-y-4">
            <div>
              <Label htmlFor="editFullName" value="Full Name" />
              <TextInput
                id="editFullName"
                type="text"
                placeholder="John Doe"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="editEmail" value="Email" />
              <TextInput
                id="editEmail"
                type="email"
                placeholder="user@example.com"
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="editPassword" value="New Password (leave blank to keep current)" />
              <TextInput
                id="editPassword"
                type="password"
                placeholder="••••••••"
                minLength={6}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                helperText="Only enter if you want to change the password"
              />
            </div>
            <div>
              <Label htmlFor="editRole" value="Role" />
              <Select
                id="editRole"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleEditUser} disabled={isEditing}>
            {isEditing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <HiPencil className="mr-2 h-5 w-5" />
                Save Changes
              </>
            )}
          </Button>
          <Button color="gray" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} size="md">
        <Modal.Header>Delete User</Modal.Header>
        <Modal.Body>
          <div className="text-center">
            <HiTrash className="mx-auto mb-4 h-14 w-14 text-gray-400" />
            <h3 className="mb-5 text-lg font-normal text-gray-500">
              Are you sure you want to delete user{' '}
              <span className="font-semibold">{userToDelete?.full_name || userToDelete?.email}</span>?
            </h3>
            <div className="flex justify-center gap-4">
              <Button color="failure" onClick={handleDeleteUser}>
                Yes, delete
              </Button>
              <Button color="gray" onClick={() => setShowDeleteModal(false)}>
                No, cancel
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default UserManagement;
