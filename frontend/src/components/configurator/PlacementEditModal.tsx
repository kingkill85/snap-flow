import { useState, useEffect } from 'react';
import { Button, Spinner, Alert, Checkbox } from 'flowbite-react';
import { HiX } from 'react-icons/hi';
import { itemService, type Item, type ItemVariant } from '../../services/item';
import { variantAddonService, type VariantAddon } from '../../services/variant-addon';
import { bomService } from '../../services/bom';
import type { Placement } from '../../services/placement';

interface PlacementEditModalProps {
  placement: Placement | null;
  floorplanId?: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (variantId: number, selectedAddons: number[]) => Promise<void>;
}

export function PlacementEditModal({ placement, floorplanId, isOpen, onClose, onUpdate }: PlacementEditModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [variants, setVariants] = useState<ItemVariant[]>([]);
  const [addons, setAddons] = useState<VariantAddon[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [originalVariantId, setOriginalVariantId] = useState<number | null>(null);
  const [originalAddons, setOriginalAddons] = useState<Set<number>>(new Set()); // Store BOM addons for original variant
  const [selectedAddons, setSelectedAddons] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load item data when placement changes
  useEffect(() => {
    const loadItemData = async () => {
      if (!placement) {
        setItem(null);
        setVariants([]);
        setAddons([]);
        return;
      }

      try {
        setIsLoading(true);
        setError('');

        // Fetch item with variants
        const itemData = await itemService.getById(placement.item_id);
        setItem(itemData);
        setVariants(itemData.variants || []);

        // Set current variant and track original
        setSelectedVariantId(placement.item_variant_id);
        setOriginalVariantId(placement.item_variant_id);

        // Fetch current BOM to get selected addons
        let currentAddonIds: number[] = [];
        if (floorplanId) {
          try {
            const bomData = await bomService.getBomForFloorplan(floorplanId);
            // Find the group that contains this placement's variant
            const group = bomData.groups.find(g => 
              g.mainEntry.variant_id === placement.item_variant_id
            );
            if (group) {
              // Get addon IDs from children
              currentAddonIds = group.children.map(child => child.variant_id);
            }
          } catch (err) {
            console.error('Failed to load BOM:', err);
          }
        }

        // Fetch addons for current variant
        const addonData = await variantAddonService.getByVariant(placement.item_id, placement.item_variant_id);
        setAddons(addonData);

        // Set currently selected addons (from BOM only, not auto-adding required)
        const currentAddons = new Set<number>(currentAddonIds);
        setSelectedAddons(currentAddons);
        
        // Store original addons for restoration when switching back
        setOriginalAddons(new Set(currentAddonIds));
      } catch (err) {
        console.error('Failed to load item data:', err);
        setError('Failed to load item details');
      } finally {
        setIsLoading(false);
      }
    };

    loadItemData();
  }, [placement]);

  // Load addons when variant changes
  useEffect(() => {
    const loadAddons = async () => {
      if (!selectedVariantId || !placement) return;

      try {
        const addonData = await variantAddonService.getByVariant(placement.item_id, selectedVariantId);
        setAddons(addonData);

        // Debug logging
        console.log('Variant changed:', { selectedVariantId, originalVariantId, addonData });

        // If variant was changed (not the original), auto-select required addons
        if (originalVariantId !== null && selectedVariantId !== originalVariantId) {
          const requiredAddons = addonData.filter(a => a.is_required).map(a => a.addon_variant.id);
          console.log('Auto-selecting required addons:', requiredAddons);
          setSelectedAddons(new Set(requiredAddons));
        } else if (originalVariantId !== null && selectedVariantId === originalVariantId) {
          // Switched back to original variant - restore original BOM addons
          console.log('Restoring original addons:', Array.from(originalAddons));
          setSelectedAddons(new Set(originalAddons));
        }
        // Note: If it's the original variant on initial load, selectedAddons is already set from BOM in loadItemData
      } catch (err) {
        console.error('Failed to load addons:', err);
      }
    };

    loadAddons();
  }, [selectedVariantId, placement, originalVariantId]);

  const handleAddonToggle = (addonId: number) => {
    setSelectedAddons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(addonId)) {
        newSet.delete(addonId);
      } else {
        newSet.add(addonId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!selectedVariantId) return;

    try {
      setIsSaving(true);
      await onUpdate(selectedVariantId, Array.from(selectedAddons));
      onClose();
    } catch (err) {
      console.error('Failed to update placement:', err);
      setError('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !placement) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Placement</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <HiX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <Alert color="failure" className="mb-4">
              {error}
            </Alert>
          ) : (
            <>
              {/* Item Info */}
              {item && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-500">{item.base_model_number}</p>
                </div>
              )}

              {/* Variant Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Variant
                </label>
                <select
                  value={selectedVariantId || ''}
                  onChange={(e) => setSelectedVariantId(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.style_name} - ${variant.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Addons */}
              {addons.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add-ons
                  </label>
                  <div className="space-y-2">
                    {addons.map((addon) => (
                      <div
                        key={addon.id}
                        className={`flex items-center justify-between p-2 rounded-lg border ${
                          addon.is_required ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedAddons.has(addon.addon_variant.id)}
                            onChange={() => handleAddonToggle(addon.addon_variant.id)}
                          />
                          <div>
                            <p className="font-medium text-sm">
                              {addon.addon_variant.item_name}
                              {addon.addon_variant.style_name && (
                                <span className="text-gray-500"> - {addon.addon_variant.style_name}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              ${addon.addon_variant.price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        {addon.is_required && (
                          <span className="text-xs text-blue-600 font-medium">
                            Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Placement Info */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                <p className="text-gray-600">
                  Position: ({Math.round(placement.x)}, {Math.round(placement.y)})
                </p>
                <p className="text-gray-600">
                  Size: {Math.round(placement.width)} × {Math.round(placement.height)}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <Button color="light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={handleSave}
            disabled={isLoading || isSaving || !selectedVariantId}
          >
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
