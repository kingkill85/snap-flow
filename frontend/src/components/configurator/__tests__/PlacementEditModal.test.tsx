import { describe, it, expect } from 'vitest';

describe('PlacementEditModal - Addon Logic', () => {
  it('should filter required addons correctly', () => {
    const addons = [
      { id: 1, is_required: true, addon_variant: { id: 101 } },
      { id: 2, is_required: false, addon_variant: { id: 102 } },
      { id: 3, is_required: true, addon_variant: { id: 103 } },
    ];

    const requiredAddons = addons.filter(a => a.is_required).map(a => a.addon_variant.id);
    
    expect(requiredAddons).toEqual([101, 103]);
    expect(requiredAddons).not.toContain(102);
  });

  it('should use addon_variant.id for checkbox state', () => {
    const selectedAddons = new Set<number>([201]);
    const addon = {
      id: 101, // This is the variant_addon record ID
      addon_variant: {
        id: 201, // This is the variant ID used in checkbox
      },
    };

    // Checkbox should check addon_variant.id, not addon.id
    const isChecked = selectedAddons.has(addon.addon_variant.id);
    expect(isChecked).toBe(true);

    const isWronglyChecked = selectedAddons.has(addon.id);
    expect(isWronglyChecked).toBe(false);
  });
});
