import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Alert, Spinner, ToggleSwitch } from 'flowbite-react';
import type { Category } from '../../services/category';

interface CategoryFormModalProps {
  category: Category | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; is_active: boolean }) => Promise<void>;
}

export function CategoryFormModal({ category, isOpen, onClose, onSubmit }: CategoryFormModalProps) {
  const isEdit = !!category;
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (category) {
        setName(category.name);
        setIsActive(category.is_active);
      } else {
        setName('');
        setIsActive(true); // New categories are always active by default
      }
      setError('');
    }
  }, [category, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit({ name, is_active: isActive });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} category`);
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
      <Modal.Header>{isEdit ? 'Edit Category' : 'Create New Category'}</Modal.Header>
      <Modal.Body>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert color="failure" onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}
          <div>
            <Label htmlFor="categoryName">Category Name</Label>
            <TextInput
              id="categoryName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter category name"
              required
            />
          </div>
          {isEdit && (
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={isActive}
                onChange={setIsActive}
                label=""
              />
              <Label className="mb-0">
                <span className={isActive ? 'text-green-600 font-medium' : 'text-gray-500'}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                <p className="text-sm text-gray-500 mt-1">
                  {isActive 
                    ? 'Category is visible in the catalog' 
                    : 'Category is hidden from the catalog. All items and variants will also be hidden.'}
                </p>
              </Label>
            </div>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              {isEdit ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            isEdit ? 'Update Category' : 'Create Category'
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
