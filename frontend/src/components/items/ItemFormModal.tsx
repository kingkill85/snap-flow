import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Textarea, Select, Alert, Spinner, ToggleSwitch } from 'flowbite-react';
import type { Item } from '../../services/item';
import type { Category } from '../../services/category';

interface ItemFormData {
  category_id?: number;
  name: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

interface ItemFormModalProps {
  item: Item | null;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ItemFormData) => Promise<void>;
}

export function ItemFormModal({ item, categories, isOpen, onClose, onSubmit }: ItemFormModalProps) {
  const isEdit = !!item;
  const [formData, setFormData] = useState({
    category_id: undefined as number | undefined,
    name: '',
    description: '',
    base_model_number: '',
    dimensions: '',
    is_active: true,
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load item data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (item) {
        // Edit mode - populate with existing data
        setFormData({
          category_id: item.category_id,
          name: item.name,
          description: item.description || '',
          base_model_number: item.base_model_number || '',
          dimensions: item.dimensions || '',
          is_active: item.is_active,
        });
      } else {
        // Create mode - reset form
        setFormData({
          category_id: undefined,
          name: '',
          description: '',
          base_model_number: '',
          dimensions: '',
          is_active: true, // New items are always active by default
        });
      }
      setError('');
    }
  }, [item, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!isEdit && !formData.category_id) {
      setError('Category is required');
      return;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData: ItemFormData = {
        category_id: formData.category_id,
        name: formData.name,
        description: formData.description || undefined,
        base_model_number: formData.base_model_number || undefined,
        dimensions: formData.dimensions || undefined,
      };
      
      // Only include is_active when editing
      if (isEdit) {
        submitData.is_active = formData.is_active;
      }
      
      await onSubmit(submitData);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} item`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Modal show={isOpen} onClose={handleClose} size="lg">
      <Modal.Header>{isEdit ? 'Edit Item' : 'Add Item'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <Label htmlFor="category" value="Category *" />
              <Select
                id="category"
                required
                value={formData.category_id || ''}
                onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="name" value="Name *" />
            <TextInput
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Smart Light Bulb"
            />
          </div>

          <div>
            <Label htmlFor="description" value="Description" />
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product description..."
              rows={6}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="modelNumber" value="Model Number" />
              <TextInput
                id="modelNumber"
                type="text"
                value={formData.base_model_number}
                onChange={(e) => setFormData({ ...formData, base_model_number: e.target.value })}
                placeholder="e.g., SB-100"
              />
            </div>
            <div>
              <Label htmlFor="dimensions" value="Dimensions" />
              <TextInput
                id="dimensions"
                type="text"
                value={formData.dimensions}
                onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                placeholder="e.g., 120x80mm"
              />
            </div>
          </div>

          {!isEdit && (
            <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
              <strong>Note:</strong> After creating the item, you can add variants (with price and image) by expanding the item row.
            </div>
          )}

          {isEdit && (
            <>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Price and images are managed per variant. Use "Edit" on a variant to manage add-ons and details.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t">
                <ToggleSwitch
                  checked={formData.is_active}
                  onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  label=""
                />
                <Label className="mb-0">
                  <span className={formData.is_active ? 'text-green-600 font-medium' : 'text-gray-500'}>
                    {formData.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.is_active 
                      ? 'Item is visible in the catalog' 
                      : 'Item is hidden from the catalog. All variants will also be hidden.'}
                  </p>
                </Label>
              </div>
            </>
          )}
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
            isEdit ? 'Save Changes' : 'Create Item'
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
