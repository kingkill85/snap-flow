import { useState, useEffect } from 'react';
import { Button, Card, Table, Alert, Spinner } from 'flowbite-react';
import { HiPlus, HiTrash, HiPencil } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import { userService, type User, type CreateUserDTO, type UpdateUserDTO } from '../../services/user';
import { UserFormModal } from '../../components/users/UserFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import axios from 'axios';

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
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        const errorData = err.response?.data?.error;
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

  const handleSubmitUser = async (data: CreateUserDTO | UpdateUserDTO) => {
    if (userToEdit) {
      // Update mode
      await userService.update(userToEdit.id, data as UpdateUserDTO);
    } else {
      // Create mode
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
        <Button onClick={openCreateModal}>
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
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>NAME</Table.HeadCell>
            <Table.HeadCell>EMAIL</Table.HeadCell>
            <Table.HeadCell>ROLE</Table.HeadCell>
            <Table.HeadCell>CREATED</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {users.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="text-center py-8 text-gray-500">
                  No users found. Create your first user to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              users.map((user) => (
                <Table.Row key={user.id} className="hover:bg-gray-50">
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
                  <Table.Cell className="text-gray-600">
                    {new Date(user.created_at).toLocaleDateString()}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
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
              ))
            )}
          </Table.Body>
        </Table>
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
