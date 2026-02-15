import { useState, useEffect } from 'react';
import { Button, Modal, Label, TextInput, Alert, Spinner, Checkbox, ToggleSwitch } from 'flowbite-react';
import { HiPlus, HiTrash, HiXCircle, HiSearch, HiPuzzle, HiPhotograph } from 'react-icons/hi';
import { itemService, type ItemVariant, type VariantAddon, type Item } from '../../services/item';

interface VariantFormModalProps {
  itemId: number;
  variant: ItemVariant | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    style_name: string;
    price: number;
    image?: File;
    remove_image?: boolean;
    is_active?: boolean;
  }) => Promise<void>;
}

export function VariantFormModal({ itemId, variant, isOpen, onClose, onSubmit }: VariantFormModalProps) {
  const isEdit = !!variant;
  const [styleName, setStyleName] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreatedMessage, setShowCreatedMessage] = useState(false);

  // Add-ons state (only for edit mode)
  const [addons, setAddons] = useState<VariantAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [selectedAddonVariant, setSelectedAddonVariant] = useState<string>('');
  const [isOptional, setIsOptional] = useState(true);
  const [addingAddon, setAddingAddon] = useState(false);
  const [addonSearchQuery, setAddonSearchQuery] = useState('');
  const [isAddonDropdownOpen, setIsAddonDropdownOpen] = useState(false);
  
  // All variants from all items (for add-on selection)
  const [allVariants, setAllVariants] = useState<ItemVariant[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loadingAllVariants, setLoadingAllVariants] = useState(false);

  // Fetch all variants from all items for add-on selection
  const fetchAllVariants = async () => {
    setLoadingAllVariants(true);
    try {
      // Fetch all items first
      const result = await itemService.getAll({ include_inactive: true }, { page: 1, limit: 1000 });
      const variants: ItemVariant[] = [];
      
      // Fetch variants for each item separately
      for (const item of result.items) {
        try {
          const itemVariants = await itemService.getVariants(item.id, true);
          variants.push(...itemVariants);
        } catch (err) {
          console.error(`Failed to fetch variants for item ${item.id}:`, err);
        }
      }
      
      setAllItems(result.items);
      setAllVariants(variants);
    } catch (err) {
      console.error('Failed to fetch all variants:', err);
    } finally {
      setLoadingAllVariants(false);
    }
  };

  // Helper to get item info for a variant
  const getItemForVariant = (variantId: number): Item | undefined => {
    const variant = allVariants.find(v => v.id === variantId);
    if (!variant) return undefined;
    return allItems.find(item => item.id === variant.item_id);
  };

  // Load variant data when modal opens
  useEffect(() => {
    if (isOpen) {
      // Fetch all variants for add-on selection
      fetchAllVariants();
      
      if (variant) {
        // Edit mode - populate with existing data
        setStyleName(variant.style_name);
        setPrice(variant.price.toString());
        setImagePreview(variant.image_path ? itemService.getImageUrl(variant.image_path) : null);
        setImage(null);
        setRemoveImage(false);
        // Ensure is_active is boolean, default to true if undefined
        const activeStatus = variant.is_active !== undefined ? Boolean(variant.is_active) : true;
        setIsActive(activeStatus);
        loadAddons();
      } else {
        // Create mode - reset form
        setStyleName('');
        setPrice('');
        setImage(null);
        setImagePreview(null);
        setRemoveImage(false);
        setIsActive(true); // New variants are always active by default
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isAddonDropdownOpen && !target.closest('.addon-dropdown-container')) {
        setIsAddonDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      const submitData: {
        style_name: string;
        price: number;
        image?: File;
        remove_image?: boolean;
        is_active?: boolean;
      } = {
        style_name: styleName,
        price: priceValue,
        image: image || undefined,
        remove_image: removeImage,
      };
      
      // Only include is_active when editing
      if (isEdit) {
        submitData.is_active = isActive;
      }
      
      await onSubmit(submitData);
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
  // Include inactive variants but mark them
  const availableAddonVariants = allVariants.filter(v => {
    if (v.id === variant?.id) return false; // Can't add itself
    if (addons.some(a => a.addon_variant_id === v.id)) return false; // Already added
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

        <div className="space-y-4">
          {/* Compact Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="styleName" value="Style Name *" className="text-xs" />
              <TextInput
                id="styleName"
                type="text"
                required
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
                placeholder="e.g., White"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="variantPrice" value="Price *" className="text-xs" />
              <TextInput
                id="variantPrice"
                type="number"
                required
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="29.99"
                className="mt-1"
              />
            </div>
          </div>

          {/* Image Upload - Compact */}
          <div className="flex items-start gap-3">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-20 w-20 object-contain rounded bg-white border"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setImagePreview(null);
                    setRemoveImage(true);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <HiXCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="h-20 w-20 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                <HiPhotograph className="w-8 h-8" />
              </div>
            )}
            <div className="flex-1">
              <Label htmlFor="variantImage" value={isEdit ? 'Replace Image' : 'Upload Image'} className="text-xs" />
              <input
                id="variantImage"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mt-1"
              />
            </div>
            
            {/* Status Toggle - Inline */}
            {isEdit && (
              <div className="flex items-center gap-2 ml-auto">
                <ToggleSwitch
                  checked={isActive}
                  onChange={setIsActive}
                  label=""
                />
                <span className={`text-xs ${isActive ? 'text-green-600' : 'text-gray-500'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Add-ons Section - Compact */}
          {isEdit && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <HiPuzzle className="w-4 h-4" />
                  Add-Ons ({addons.length})
                </h4>
                {addons.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {addons.filter(a => a.is_optional).length} optional, {addons.filter(a => !a.is_optional).length} required
                  </span>
                )}
              </div>
              
              {loadingAddons ? (
                <div className="text-center py-2">
                  <Spinner size="sm" />
                </div>
              ) : addons.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No add-ons configured.</p>
              ) : (
                <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                  {addons.map((addon) => {
                    const addonItem = addon.addon_variant ? getItemForVariant(addon.addon_variant.id) : undefined;
                    return (
                      <div key={addon.id} className={`flex items-center justify-between p-1.5 rounded text-xs ${addon.addon_variant?.is_active ? 'bg-white' : 'bg-gray-100 opacity-60'}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {addon.addon_variant?.image_path ? (
                            <img
                              src={itemService.getImageUrl(addon.addon_variant.image_path) || ''}
                              alt=""
                              className="h-8 w-8 object-contain rounded bg-white flex-shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 bg-gray-200 rounded flex items-center justify-center text-gray-400 flex-shrink-0">
                              -
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{addonItem?.name || 'Unknown'}</div>
                            <div className="text-gray-500 truncate">{addon.addon_variant?.style_name} • ${addon.addon_variant?.price}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${addon.is_optional ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {addon.is_optional ? 'Opt' : 'Req'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAddon(addon.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <HiTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(loadingAllVariants || availableAddonVariants.length > 0) && (
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Add New:</p>
                  <div className="flex gap-2">
                    <div className="flex-1 relative addon-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setIsAddonDropdownOpen(!isAddonDropdownOpen)}
                        disabled={loadingAllVariants}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="truncate">
                          {selectedAddonVariant ? (
                            (() => {
                              const selectedVar = availableAddonVariants.find(v => v.id.toString() === selectedAddonVariant);
                              if (!selectedVar) return 'Select...';
                              const item = getItemForVariant(selectedVar.id);
                              return `${item?.name || 'Unknown'} - ${selectedVar.style_name}`;
                            })()
                          ) : (
                            'Select variant...'
                          )}
                        </span>
                        <svg className={`w-3 h-3 ml-1 transition-transform ${isAddonDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isAddonDropdownOpen && (
                        <div className="absolute z-50 bottom-full left-0 mb-1 w-80 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-hidden">
                          <div className="p-2 border-b border-gray-100 bg-gray-50">
                            <div className="relative">
                              <HiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                              <input
                                type="text"
                                placeholder="Search..."
                                value={addonSearchQuery}
                                onChange={(e) => setAddonSearchQuery(e.target.value)}
                                className="w-full pl-7 pr-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {availableAddonVariants
                              .filter(v => {
                                if (!addonSearchQuery) return true;
                                const item = getItemForVariant(v.id);
                                const searchLower = addonSearchQuery.toLowerCase();
                                return (
                                  item?.name?.toLowerCase().includes(searchLower) ||
                                  item?.base_model_number?.toLowerCase().includes(searchLower) ||
                                  v.style_name.toLowerCase().includes(searchLower)
                                );
                              })
                              .map((v) => {
                                const item = getItemForVariant(v.id);
                                const isSelected = selectedAddonVariant === v.id.toString();
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedAddonVariant(v.id.toString());
                                      setIsAddonDropdownOpen(false);
                                      setAddonSearchQuery('');
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50 text-xs ${isSelected ? 'bg-blue-50' : ''}`}
                                  >
                                    {v.image_path ? (
                                      <img
                                        src={itemService.getImageUrl(v.image_path) || ''}
                                        alt=""
                                        className="h-8 w-8 object-contain rounded bg-gray-100 flex-shrink-0"
                                      />
                                    ) : (
                                      <div className="h-8 w-8 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-[10px] flex-shrink-0">
                                        -
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate">{item?.name || 'Unknown'}</div>
                                      <div className="text-gray-500 truncate">{v.style_name} • ${v.price}</div>
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <Checkbox
                        id="isOptional"
                        checked={isOptional}
                        onChange={(e) => setIsOptional(e.target.checked)}
                      />
                      <span className="text-gray-600">Opt</span>
                    </label>
                    <Button
                      size="xs"
                      color="light"
                      onClick={handleAddAddon}
                      disabled={!selectedAddonVariant || addingAddon || loadingAllVariants}
                    >
                      {addingAddon ? <Spinner size="xs" /> : <HiPlus className="w-3 h-3" />}
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
