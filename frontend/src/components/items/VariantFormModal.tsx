import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Upload, Plus, Trash2, Loader2, ChevronDown, Image as ImageIcon } from 'lucide-react';
import type { ItemVariant, Item } from '@/services/item';
import { variantAddonService, type VariantAddon } from '@/services/variant-addon';

export interface CreateVariantDTO {
  style_name: string;
  price: number;
  image?: File;
}

export interface UpdateVariantDTO {
  style_name?: string;
  price?: number;
  image?: File;
  remove_image?: boolean;
  is_active?: boolean;
}

interface VariantFormModalProps {
  itemId: number;
  item: Item | null;
  variant: ItemVariant | null;
  availableVariants: ItemVariant[];
  availableItems: Item[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateVariantDTO | UpdateVariantDTO) => Promise<void>;
}

export function VariantFormModal({ itemId, item: _item, variant, availableVariants, availableItems, isOpen, onClose, onSubmit }: VariantFormModalProps) {
  const isEdit = !!variant;
  const [styleName, setStyleName] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add-ons state
  const [addons, setAddons] = useState<VariantAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [selectedAddonVariant, setSelectedAddonVariant] = useState<string>('');
  const [isRequired, setIsRequired] = useState(false);
  const [addingAddon, setAddingAddon] = useState(false);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);

  // Helper to get item info by ID
  const getItemInfo = (itemId: number): Item | undefined => {
    return availableItems.find(i => i.id === itemId);
  };

  useEffect(() => {
    if (variant) {
      setStyleName(variant.style_name);
      setPrice(variant.price.toString());
      setIsActive(variant.is_active);
      setImage(null);
      setImagePreview(variant.image_path ? `/uploads/${variant.image_path}` : null);
      setRemoveImage(false);
    } else {
      setStyleName('');
      setPrice('');
      setIsActive(true);
      setImage(null);
      setImagePreview(null);
      setRemoveImage(false);
    }
    setError('');
  }, [variant, isOpen]);

  // Load addons when in edit mode
  useEffect(() => {
    if (isOpen && isEdit && variant) {
      loadAddons();
    } else {
      setAddons([]);
      setSelectedAddonVariant('');
      setIsRequired(false);
      setShowVariantDropdown(false);
    }
  }, [isOpen, isEdit, variant, itemId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.variant-dropdown-container')) {
        setShowVariantDropdown(false);
      }
    };

    if (showVariantDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showVariantDropdown]);

  const loadAddons = async () => {
    if (!variant) return;
    setLoadingAddons(true);
    try {
      const data = await variantAddonService.getByVariant(itemId, variant.id);
      setAddons(data);
    } catch (err: any) {
      console.error('Failed to load add-ons:', err);
    } finally {
      setLoadingAddons(false);
    }
  };

  const handleAddAddon = async () => {
    if (!variant || !selectedAddonVariant) return;

    setAddingAddon(true);
    setError('');
    try {
      await variantAddonService.addAddon(itemId, variant.id, {
        addon_variant_id: parseInt(selectedAddonVariant),
        is_required: isRequired,
      });
      await loadAddons();
      setSelectedAddonVariant('');
      setIsRequired(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add add-on');
    } finally {
      setAddingAddon(false);
    }
  };

  const handleRemoveAddon = async (addonId: number) => {
    if (!variant) return;

    try {
      await variantAddonService.removeAddon(itemId, variant.id, addonId);
      await loadAddons();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove add-on');
    }
  };

  const handleFileChange = (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setRemoveImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Please enter a valid price');
      setIsLoading(false);
      return;
    }

    try {
      const data: CreateVariantDTO | UpdateVariantDTO = isEdit
        ? {
            style_name: styleName,
            price: priceNum,
            ...(image && { image }),
            ...(removeImage && { remove_image: true }),
            is_active: isActive,
          }
        : {
            style_name: styleName,
            price: priceNum,
            ...(image && { image }),
          };

      await onSubmit(data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save variant');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{isEdit ? 'Edit Variant' : 'Create Variant'}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="style_name">Style Name *</Label>
            <Input
              id="style_name"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder="e.g., White, Black, Matte Finish"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                border-2 border-dashed rounded-lg p-6 cursor-pointer
                transition-colors duration-200
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
                ${imagePreview ? 'p-1' : 'p-3'}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />

              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-16 mx-auto rounded object-contain"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">
                    Drop image here or click
                  </p>
                </div>
              )}
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                Active
              </Label>
            </div>
          )}

          {/* Add-ons Section - Only for Edit Mode */}
          {isEdit && (
            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-semibold mb-2">Add-ons</h4>
              
              {/* Add New Add-on - Compact single line */}
              <div className="bg-muted/50 p-2 rounded mb-2">
                <div className="flex items-center gap-2">
                  {/* Variant Dropdown */}
                  <div className="flex-1 variant-dropdown-container relative">
                    <button
                      type="button"
                      onClick={() => setShowVariantDropdown(!showVariantDropdown)}
                      className="w-full flex items-center justify-between px-2 py-1.5 border rounded bg-background hover:bg-accent transition-colors text-left"
                    >
                      {selectedAddonVariant ? (
                        <span className="text-sm truncate">
                          {(() => {
                            const v = availableVariants.find(v => v.id.toString() === selectedAddonVariant);
                            const itemInfo = v ? getItemInfo(v.item_id) : null;
                            return v ? `${itemInfo?.base_model_number || itemInfo?.name || 'Unknown'} - ${v.style_name}` : 'Select variant...';
                          })()}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Select variant...</span>
                      )}
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
                    </button>
                    
                    {showVariantDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border rounded shadow-lg max-h-48 overflow-auto">
                        {availableVariants
                          .filter(v => v.id !== variant?.id && !addons.some(a => a.addon_variant_id === v.id))
                          .map((v) => {
                            const itemInfo = getItemInfo(v.item_id);
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAddonVariant(v.id.toString());
                                  setShowVariantDropdown(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent transition-colors text-left"
                              >
                                {v.image_path ? (
                                  <img
                                    src={`/uploads/${v.image_path}`}
                                    alt={v.style_name}
                                    className="h-6 w-6 object-contain rounded border bg-white flex-shrink-0"
                                  />
                                ) : (
                                  <div className="h-6 w-6 bg-muted rounded border flex items-center justify-center flex-shrink-0">
                                    <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium truncate">
                                    {itemInfo?.base_model_number || itemInfo?.name || 'Unknown'}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {v.style_name} - ${v.price}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                  
                  {/* Required Toggle */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch
                      id="is_required"
                      checked={isRequired}
                      onCheckedChange={setIsRequired}
                      className="scale-75"
                    />
                    <Label htmlFor="is_required" className="text-xs whitespace-nowrap cursor-pointer">
                      Required
                    </Label>
                  </div>
                  
                  {/* Add Button */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddAddon}
                    disabled={!selectedAddonVariant || addingAddon}
                    className="h-7 w-7 p-0 flex-shrink-0"
                  >
                    {addingAddon ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Existing Add-ons List - Scrollable */}
              {loadingAddons ? (
                <div className="flex items-center justify-center py-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading add-ons...
                </div>
              ) : addons.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No add-ons configured.</p>
              ) : (
                <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1">
                  {addons.map((addon) => (
                    <div key={addon.id} className="flex items-center justify-between bg-muted p-1.5 rounded">
                      <div className="flex items-center gap-1.5">
                        {addon.addon_variant?.image_path ? (
                          <img
                            src={`/uploads/${addon.addon_variant.image_path}`}
                            alt={addon.addon_variant.style_name}
                            className="h-5 w-5 object-contain rounded border bg-white"
                          />
                        ) : (
                          <div className="h-5 w-5 bg-background rounded border flex items-center justify-center text-muted-foreground text-[10px]">
                            No
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-xs">
                            {addon.addon_variant?.item_name} - {addon.addon_variant?.style_name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            ${addon.addon_variant?.price} 
                            <span className={`text-[10px] px-1 py-0 rounded ${addon.is_required ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {addon.is_required ? 'Req' : 'Opt'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveAddon(addon.id)}
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
