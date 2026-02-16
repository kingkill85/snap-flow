import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiFolderAdd, HiPencil } from 'react-icons/hi';
import type { Project, CreateProjectDTO, UpdateProjectDTO } from '../../services/project';
import type { Customer } from '../../services/customer';

interface ProjectFormModalProps {
  project: Project | null;
  customerId: number;
  customers?: Customer[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProjectDTO | UpdateProjectDTO) => Promise<void>;
}

export function ProjectFormModal({ project, customerId, customers, isOpen, onClose, onSubmit }: ProjectFormModalProps) {
  const isEdit = !!project;
  const [formData, setFormData] = useState({
    name: '',
    status: 'active' as 'active' | 'completed' | 'cancelled',
    selectedCustomerId: customerId,
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          name: project.name,
          status: project.status,
          selectedCustomerId: project.customer_id,
        });
      } else {
        setFormData({
          name: '',
          status: 'active',
          selectedCustomerId: customerId,
        });
      }
      setError('');
    }
  }, [project, customerId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateProjectDTO = {};
        if (formData.name) updateData.name = formData.name;
        if (formData.status) updateData.status = formData.status;
        if (formData.selectedCustomerId) updateData.customer_id = formData.selectedCustomerId;
        await onSubmit(updateData);
      } else {
        const createData: CreateProjectDTO = {
          customer_id: formData.selectedCustomerId,
          name: formData.name,
          status: formData.status,
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
        errorMessage = errorData || err.message || `Failed to ${isEdit ? 'update' : 'create'} project`;
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

  const showCustomerSelect = customers && customers.length > 0;

  return (
    <Modal show={isOpen} onClose={handleClose}>
      <Modal.Header>{isEdit ? 'Edit Project' : 'Create New Project'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {showCustomerSelect && (
            <div>
              <Label htmlFor="customer" value="Customer *" />
              <Select
                id="customer"
                value={formData.selectedCustomerId}
                onChange={(e) => setFormData({ ...formData, selectedCustomerId: parseInt(e.target.value) })}
                required
              >
                <option value="">Select a customer...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="name" value="Project Name *" />
            <TextInput
              id="name"
              type="text"
              placeholder="Living Room Renovation"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="status" value="Status" />
            <Select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'completed' | 'cancelled' })}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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
              {isEdit ? <HiPencil className="mr-2 h-5 w-5" /> : <HiFolderAdd className="mr-2 h-5 w-5" />}
              {isEdit ? 'Save Changes' : 'Create Project'}
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
