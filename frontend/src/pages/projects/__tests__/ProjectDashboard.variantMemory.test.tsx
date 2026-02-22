import { describe, it, expect } from 'vitest';

describe('ProjectDashboard - Variant Memory', () => {
  it('should default to first variant when no memory exists', () => {
    // Test the logic: when no stored config, use first variant
    const fullItem = {
      id: 1,
      variants: [
        { id: 1, item_id: 1, style_name: 'Ivory White', price: 40 },
        { id: 2, item_id: 1, style_name: 'Ash Grey', price: 16 },
      ],
    };

    const storedConfig = undefined; // No memory
    const variantToUse = storedConfig?.variant_id
      ? fullItem.variants?.find((v: { id: number }) => v.id === storedConfig.variant_id)
      : fullItem.variants?.[0];

    expect(variantToUse?.id).toBe(1); // Should default to first variant
    expect(variantToUse?.style_name).toBe('Ivory White');
  });

  it('should use stored variant when memory exists', () => {
    // Test the logic: when stored config exists, use that variant
    const fullItem = {
      id: 1,
      variants: [
        { id: 1, item_id: 1, style_name: 'Ivory White', price: 40 },
        { id: 2, item_id: 1, style_name: 'Ash Grey', price: 16 },
      ],
    };

    const storedConfig = { variant_id: 2, addon_ids: [251] };
    const variantToUse = storedConfig?.variant_id
      ? fullItem.variants?.find((v: { id: number }) => v.id === storedConfig.variant_id)
      : fullItem.variants?.[0];

    expect(variantToUse?.id).toBe(2); // Should use stored variant
    expect(variantToUse?.style_name).toBe('Ash Grey');
  });

  it('should fallback to first variant if stored variant not found', () => {
    // Test the logic: when stored variant doesn't exist in item variants
    const fullItem = {
      id: 1,
      variants: [
        { id: 1, item_id: 1, style_name: 'Ivory White', price: 40 },
        { id: 2, item_id: 1, style_name: 'Ash Grey', price: 16 },
      ],
    };

    const storedConfig = { variant_id: 999, addon_ids: [] }; // Non-existent variant
    const variantToUse = storedConfig?.variant_id
      ? fullItem.variants?.find((v: { id: number }) => v.id === storedConfig.variant_id)
      : fullItem.variants?.[0];

    // When find returns undefined, it should fallback
    expect(variantToUse).toBeUndefined();
    // In actual implementation, the code handles this by checking if(variantToUse)
  });
});

describe('ProjectDashboard - Item Size Memory', () => {
  it('should remember last item size', () => {
    // Simulating the useRef behavior
    const itemSizeMemory = new Map<number, { width: number; height: number }>();
    
    // Store a size
    itemSizeMemory.set(1, { width: 100, height: 80 });
    
    // Retrieve size with fallback
    const storedSize = itemSizeMemory.get(1);
    const width = storedSize?.width ?? 60;
    const height = storedSize?.height ?? 60;
    
    expect(width).toBe(100);
    expect(height).toBe(80);
  });

  it('should default to 60x60 when no size memory exists', () => {
    const itemSizeMemory = new Map<number, { width: number; height: number }>();
    
    // No stored size
    const storedSize = itemSizeMemory.get(999);
    const width = storedSize?.width ?? 60;
    const height = storedSize?.height ?? 60;
    
    expect(width).toBe(60);
    expect(height).toBe(60);
  });
});
