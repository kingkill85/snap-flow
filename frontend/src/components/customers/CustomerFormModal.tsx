import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Alert, Spinner } from 'flowbite-react';
import { HiUserAdd, HiPencil } from 'react-icons/hi';
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO } from '../../services/customer';

interface CustomerFormModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCustomerDTO | UpdateCustomerDTO) => Promise<void>;
}

export function CustomerFormModal({ customer, isOpen, onClose, onSubmit }: CustomerFormModalProps) {
  const isEdit = !!customer;
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || '',
          address: customer.address || '',
        });
      } else {
        setFormData({
          name: '',
          email: '',
          phone: '',
          address: '',
        });
      }
      setError('');
    }
  }, [customer, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateCustomerDTO = {};
        if (formData.name) updateData.name = formData.name;
        if (formData.email) updateData.email = formData.email;
        if (formData.phone) updateData.phone = formData.phone;
        if (formData.address) updateData.address = formData.address;
        await onSubmit(updateData);
      } else {
        const createData: CreateCustomerDTO = {
          name: formData.name,
        };
        if (formData.email) createData.email = formData.email;
        if (formData.phone) createData.phone = formData.phone;
        if (formData.address) createData.address = formData.address;
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
        errorMessage = errorData || err.message || `Failed to ${isEdit ? 'update' : 'create'} customer`;
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
      <Modal.Header>{isEdit ? 'Edit Customer' : 'Create New Customer'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" value="Name *" />
            <TextInput
              id="name"
              type="text"
              placeholder="John Doe"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email" value="Email" />
            <TextInput
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone" value="Phone" />
            <TextInput
              id="phone"
              type="tel"
              placeholder="555-1234"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="address" value="Address" />
            <TextInput
              id="address"
              type="text"
              placeholder="123 Main St, City, State"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
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
              {isEdit ? 'Save Changes' : 'Create Customer'}
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
