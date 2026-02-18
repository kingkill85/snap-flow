import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiFolderAdd, HiPencil } from 'react-icons/hi';
import type { Project, CreateProjectDTO, UpdateProjectDTO } from '../../services/project';

interface ProjectFormModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProjectDTO | UpdateProjectDTO) => Promise<void>;
}

export function ProjectFormModal({ project, isOpen, onClose, onSubmit }: ProjectFormModalProps) {
  const isEdit = !!project;
  const [formData, setFormData] = useState({
    name: '',
    status: 'active' as 'active' | 'completed' | 'cancelled',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          name: project.name,
          status: project.status,
          customer_name: project.customer_name,
          customer_email: project.customer_email || '',
          customer_phone: project.customer_phone || '',
          customer_address: project.customer_address || '',
        });
      } else {
        setFormData({
          name: '',
          status: 'active',
          customer_name: '',
          customer_email: '',
          customer_phone: '',
          customer_address: '',
        });
      }
      setError('');
    }
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateProjectDTO = {};
        if (formData.name) updateData.name = formData.name;
        if (formData.status) updateData.status = formData.status;
        if (formData.customer_name) updateData.customer_name = formData.customer_name;
        if (formData.customer_email) updateData.customer_email = formData.customer_email;
        if (formData.customer_phone) updateData.customer_phone = formData.customer_phone;
        if (formData.customer_address) updateData.customer_address = formData.customer_address;
        await onSubmit(updateData);
      } else {
        const createData: CreateProjectDTO = {
          name: formData.name,
          status: formData.status,
          customer_name: formData.customer_name,
        };
        if (formData.customer_email) createData.customer_email = formData.customer_email;
        if (formData.customer_phone) createData.customer_phone = formData.customer_phone;
        if (formData.customer_address) createData.customer_address = formData.customer_address;
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
          {/* Project Info */}
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

          {/* Customer Info Section */}
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Customer Information</h4>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="customer_name" value="Customer Name *" />
                <TextInput
                  id="customer_name"
                  type="text"
                  placeholder="John Doe"
                  required
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer_email" value="Email" />
                <TextInput
                  id="customer_email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer_phone" value="Phone" />
                <TextInput
                  id="customer_phone"
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer_address" value="Address" />
                <TextInput
                  id="customer_address"
                  type="text"
                  placeholder="123 Main St, City, Country"
                  value={formData.customer_address}
                  onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                />
              </div>
            </div>
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
