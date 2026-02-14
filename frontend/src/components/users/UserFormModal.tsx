import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiUserAdd, HiPencil } from 'react-icons/hi';
import type { User, CreateUserDTO, UpdateUserDTO } from '../../services/user';

interface UserFormModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserDTO | UpdateUserDTO) => Promise<void>;
}

export function UserFormModal({ user, isOpen, onClose, onSubmit }: UserFormModalProps) {
  const isEdit = !!user;
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        setFormData({
          full_name: user.full_name || '',
          email: user.email,
          password: '',
          role: user.role,
        });
      } else {
        setFormData({
          full_name: '',
          email: '',
          password: '',
          role: 'user',
        });
      }
      setError('');
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateUserDTO = {
          full_name: formData.full_name || null,
          email: formData.email,
          role: formData.role,
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await onSubmit(updateData);
      } else {
        const createData: CreateUserDTO = {
          full_name: formData.full_name || undefined,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        };
        await onSubmit(createData);
      }
      onClose();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || `Failed to ${isEdit ? 'update' : 'create'} user`;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Modal show={isOpen} onClose={handleClose}>
      <Modal.Header>{isEdit ? 'Edit User' : 'Create New User'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName" value="Full Name (Optional)" />
            <TextInput
              id="fullName"
              type="text"
              placeholder="John Doe"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email" value="Email" />
            <TextInput
              id="email"
              type="email"
              placeholder="user@example.com"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label 
              htmlFor="password" 
              value={isEdit ? 'New Password (leave blank to keep current)' : 'Password'} 
            />
            <TextInput
              id="password"
              type="password"
              placeholder="••••••••"
              required={!isEdit}
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              helperText={isEdit ? 'Only enter if you want to change the password' : undefined}
            />
          </div>
          <div>
            <Label htmlFor="role" value="Role" />
            <Select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              {isEdit ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            <>
              {isEdit ? <HiPencil className="mr-2 h-5 w-5" /> : <HiUserAdd className="mr-2 h-5 w-5" />}
              {isEdit ? 'Save Changes' : 'Create User'}
            </>
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
