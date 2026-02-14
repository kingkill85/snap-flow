import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Alert, Spinner, Select, Checkbox } from 'flowbite-react';
import { HiPlus, HiTrash } from 'react-icons/hi';
import { itemService, type ItemVariant, type VariantAddon } from '../../services/item';
import type { Item } from '../../services/item';

interface VariantFormModalProps {
  itemId: number;
  item: Item | null;
  variant: ItemVariant | null;
  availableVariants: ItemVariant[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    style_name: string;
    price: number;
    image?: File;
    remove_image?: boolean;
  }) => Promise<void>;
}

export function VariantFormModal({ itemId, item, variant, availableVariants, isOpen, onClose, onSubmit }: VariantFormModalProps) {
  const isEdit = !!variant;
  const [styleName, setStyleName] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreatedMessage, setShowCreatedMessage] = useState(false);

  // Add-ons state (only for edit mode)
  const [addons, setAddons] = useState<VariantAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [selectedAddonVariant, setSelectedAddonVariant] = useState<string>('');
  const [isOptional, setIsOptional] = useState(true);
  const [addingAddon, setAddingAddon] = useState(false);

  // Load variant data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (variant) {
        // Edit mode - populate with existing data
        setStyleName(variant.style_name);
        setPrice(variant.price.toString());
        setImagePreview(variant.image_path ? itemService.getImageUrl(variant.image_path) : null);
        setImage(null);
        setRemoveImage(false);
        loadAddons();
      } else {
        // Create mode - reset form
        setStyleName('');
        setPrice('');
        setImage(null);
        setImagePreview(null);
        setRemoveImage(false);
        setAddons([]);
        setShowCreatedMessage(false);
      }
      setError('');
    }
  }, [variant, isOpen]);

  // Handle transition from create to edit mode
  useEffect(() => {
    if (isOpen && !isEdit && variant) {
      // We just switched from create to edit (variant was created)
      setShowCreatedMessage(true);
      loadAddons();
    }
  }, [variant, isOpen, isEdit]);

  const loadAddons = async () => {
    if (!variant) return;
    setLoadingAddons(true);
    try {
      const data = await itemService.getVariantAddons(itemId, variant.id);
      setAddons(data);
    } catch (err: any) {
      console.error('Failed to load add-ons:', err);
    } finally {
      setLoadingAddons(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!styleName || !price) {
      setError('Style name and price are required');
      return;
    }

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue < 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        style_name: styleName,
        price: priceValue,
        image: image || undefined,
        remove_image: removeImage,
      });
      // Only close on edit mode - create mode stays open for add-ons
      if (isEdit) {
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} variant`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAddon = async () => {
    if (!variant || !selectedAddonVariant) return;

    setAddingAddon(true);
    setError('');
    try {
      await itemService.addVariantAddon(itemId, variant.id, {
        addon_variant_id: parseInt(selectedAddonVariant),
        is_optional: isOptional,
      });
      await loadAddons();
      setSelectedAddonVariant('');
      setIsOptional(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add add-on');
    } finally {
      setAddingAddon(false);
    }
  };

  const handleRemoveAddon = async (addonId: number) => {
    if (!variant) return;

    try {
      await itemService.removeVariantAddon(itemId, variant.id, addonId);
      await loadAddons();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove add-on');
    }
  };

  const handleClose = () => {
    setError('');
    setImage(null);
    onClose();
  };

  // Filter out current variant and already added variants
  const availableAddonVariants = availableVariants.filter(v => {
    if (v.id === variant?.id) return false;
    if (addons.some(a => a.addon_variant_id === v.id)) return false;
    return true;
  });

  return (
    <Modal show={isOpen} onClose={handleClose} size="lg">
      <Modal.Header>{isEdit ? 'Edit Variant' : 'Add Variant'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        {showCreatedMessage && (
          <Alert color="success" className="mb-4">
            Variant created successfully! You can now add add-ons below, or click Save to finish.
          </Alert>
        )}

        <div className="space-y-6">
          {/* Basic Info Section */}
          <div className="border-b pb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
            <div className="space-y-4">
              <div>
                <Label htmlFor="styleName" value="Style Name *" />
                <TextInput
                  id="styleName"
                  type="text"
                  required
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  placeholder="e.g., White, Black, Silver"
                />
              </div>

              <div>
                <Label htmlFor="variantPrice" value="Price *" />
                <TextInput
                  id="variantPrice"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="29.99"
                />
              </div>

              <div>
                <Label htmlFor="variantImage" value={isEdit ? 'Image (replace current or remove)' : 'Image'} />
                <input
                  id="variantImage"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {imagePreview && (
                  <div className="mt-2 flex items-start gap-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-32 w-auto max-w-48 object-contain rounded bg-white"
                    />
                    <Button
                      size="xs"
                      color="failure"
                      onClick={() => {
                        setImage(null);
                        setImagePreview(null);
                        setRemoveImage(true);
                      }}
                    >
                      <HiTrash className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add-ons Section - Only for Edit Mode */}
          {isEdit && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Add-Ons</h4>
              
              {loadingAddons ? (
                <div className="text-center py-2">
                  <Spinner size="sm" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              ) : addons.length === 0 ? (
                <p className="text-sm text-gray-500 italic mb-3">No add-ons configured.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {addons.map((addon) => (
                    <div key={addon.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        {addon.addon_variant?.image_path ? (
                          <img
                            src={itemService.getImageUrl(addon.addon_variant.image_path) || ''}
                            alt={addon.addon_variant.style_name}
                            className="h-16 w-auto max-w-24 object-contain rounded bg-white"
                          />
                        ) : (
                          <div className="h-16 w-24 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        )}
                        <span className="font-medium">{item?.base_model_number || 'Unknown'} - {addon.addon_variant?.style_name}</span>
                        <span className="text-gray-500">(${addon.addon_variant?.price})</span>
                        <span className={`text-xs px-2 py-1 rounded ${addon.is_optional ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {addon.is_optional ? 'Optional' : 'Required'}
                        </span>
                      </div>
                      <Button size="xs" color="failure" onClick={() => handleRemoveAddon(addon.id)}>
                        <HiTrash />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {availableAddonVariants.length > 0 && (
                <div className="bg-blue-50 p-3 rounded space-y-2">
                  <p className="text-sm font-medium text-gray-700">Add New Add-on</p>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Select
                        value={selectedAddonVariant}
                        onChange={(e) => setSelectedAddonVariant(e.target.value)}
                      >
                        <option value="">Select variant...</option>
                        {availableAddonVariants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {item?.base_model_number || 'Unknown'} - {v.style_name} (${v.price})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 h-10">
                      <Checkbox
                        id="isOptional"
                        checked={isOptional}
                        onChange={(e) => setIsOptional(e.target.checked)}
                      />
                      <Label htmlFor="isOptional" className="text-sm whitespace-nowrap mb-0">Optional</Label>
                    </div>
                    <Button
                      size="sm"
                      color="light"
                      onClick={handleAddAddon}
                      disabled={!selectedAddonVariant || addingAddon}
                    >
                      {addingAddon ? <Spinner size="sm" /> : <HiPlus />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              {isEdit ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            isEdit ? 'Save Changes' : 'Create & Continue'
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
