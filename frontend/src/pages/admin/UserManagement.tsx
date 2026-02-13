import { useState, useEffect } from 'react';
import { Button, Card, Table, Modal, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiPlus, HiTrash, HiUserAdd } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';

interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  // Form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch users');
      
      const data = await response.json();
      setUsers(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Reset form and close modal
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setShowCreateModal(false);
      
      // Refresh user list
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

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
                <Table.Cell className="font-medium">{user.email}</Table.Cell>
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

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} size="md">
        <Modal.Header>Delete User</Modal.Header>
        <Modal.Body>
          <div className="text-center">
            <HiTrash className="mx-auto mb-4 h-14 w-14 text-gray-400" />
            <h3 className="mb-5 text-lg font-normal text-gray-500">
              Are you sure you want to delete user{' '}
              <span className="font-semibold">{userToDelete?.email}</span>?
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
