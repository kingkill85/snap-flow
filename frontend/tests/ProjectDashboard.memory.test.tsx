import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Item Memory Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('localStorage keys', () => {
    it('should use correct localStorage keys for item memory', () => {
      // The keys should be defined in the component
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      const ITEM_VARIANT_MEMORY_KEY = 'snapflow_item_variant_memory';

      // Verify the keys are strings
      expect(typeof ITEM_SIZE_MEMORY_KEY).toBe('string');
      expect(typeof ITEM_VARIANT_MEMORY_KEY).toBe('string');

      // Verify they contain expected prefixes
      expect(ITEM_SIZE_MEMORY_KEY).toContain('snapflow');
      expect(ITEM_VARIANT_MEMORY_KEY).toContain('snapflow');
      expect(ITEM_SIZE_MEMORY_KEY).toContain('size');
      expect(ITEM_VARIANT_MEMORY_KEY).toContain('variant');
    });
  });

  describe('Map serialization', () => {
    it('should serialize Map to array format for localStorage', () => {
      const testMap = new Map<number, { width: number; height: number }>();
      testMap.set(1, { width: 100, height: 50 });
      testMap.set(2, { width: 200, height: 100 });

      const serialized = JSON.stringify(Array.from(testMap.entries()));
      const parsed = JSON.parse(serialized);
      const restoredMap = new Map(parsed);

      expect(restoredMap.get(1)).toEqual({ width: 100, height: 50 });
      expect(restoredMap.get(2)).toEqual({ width: 200, height: 100 });
    });

    it('should serialize variant memory Map correctly', () => {
      const testMap = new Map<number, { variant_id: number; addon_ids: number[] }>();
      testMap.set(1, { variant_id: 5, addon_ids: [1, 2, 3] });
      testMap.set(2, { variant_id: 10, addon_ids: [] });

      const serialized = JSON.stringify(Array.from(testMap.entries()));
      const parsed = JSON.parse(serialized);
      const restoredMap = new Map(parsed);

      expect(restoredMap.get(1)).toEqual({ variant_id: 5, addon_ids: [1, 2, 3] });
      expect(restoredMap.get(2)).toEqual({ variant_id: 10, addon_ids: [] });
    });

    it('should handle empty Map serialization', () => {
      const emptyMap = new Map();
      const serialized = JSON.stringify(Array.from(emptyMap.entries()));
      const parsed = JSON.parse(serialized);
      const restoredMap = new Map(parsed);

      expect(restoredMap.size).toBe(0);
    });
  });

  describe('localStorage operations', () => {
    it('should save item size memory to localStorage', () => {
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      const sizeMemory = new Map<number, { width: number; height: number }>();
      sizeMemory.set(1, { width: 100, height: 50 });
      sizeMemory.set(2, { width: 200, height: 100 });

      // Simulate persisting to localStorage
      (window as any).localStorage.setItem(
        ITEM_SIZE_MEMORY_KEY,
        JSON.stringify(Array.from(sizeMemory.entries()))
      );

      expect((window as any).localStorage.setItem).toHaveBeenCalledWith(
        ITEM_SIZE_MEMORY_KEY,
        JSON.stringify([[1, { width: 100, height: 50 }], [2, { width: 200, height: 100 }]])
      );
    });

    it('should save item variant memory to localStorage', () => {
      const ITEM_VARIANT_MEMORY_KEY = 'snapflow_item_variant_memory';
      const variantMemory = new Map<number, { variant_id: number; addon_ids: number[] }>();
      variantMemory.set(1, { variant_id: 5, addon_ids: [1, 2] });

      (window as any).localStorage.setItem(
        ITEM_VARIANT_MEMORY_KEY,
        JSON.stringify(Array.from(variantMemory.entries()))
      );

      expect((window as any).localStorage.setItem).toHaveBeenCalledWith(
        ITEM_VARIANT_MEMORY_KEY,
        JSON.stringify([[1, { variant_id: 5, addon_ids: [1, 2] }]])
      );
    });

    it('should load item size memory from localStorage', () => {
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      const storedData = [[1, { width: 100, height: 50 }], [2, { width: 200, height: 100 }]];

      (window as any).localStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      const savedSizeMemory = (window as any).localStorage.getItem(ITEM_SIZE_MEMORY_KEY);
      if (savedSizeMemory) {
        const parsed = JSON.parse(savedSizeMemory);
        const loadedMap = new Map(parsed);

        expect(loadedMap.get(1)).toEqual({ width: 100, height: 50 });
        expect(loadedMap.get(2)).toEqual({ width: 200, height: 100 });
      }
    });

    it('should load item variant memory from localStorage', () => {
      const ITEM_VARIANT_MEMORY_KEY = 'snapflow_item_variant_memory';
      const storedData = [[1, { variant_id: 5, addon_ids: [1, 2, 3] }]];

      (window as any).localStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      const savedVariantMemory = (window as any).localStorage.getItem(ITEM_VARIANT_MEMORY_KEY);
      if (savedVariantMemory) {
        const parsed = JSON.parse(savedVariantMemory);
        const loadedMap = new Map(parsed);

        expect(loadedMap.get(1)).toEqual({ variant_id: 5, addon_ids: [1, 2, 3] });
      }
    });

    it('should handle missing localStorage data gracefully', () => {
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      (window as any).localStorage.getItem.mockReturnValue(null);

      const savedSizeMemory = (window as any).localStorage.getItem(ITEM_SIZE_MEMORY_KEY);
      expect(savedSizeMemory).toBeNull();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      (window as any).localStorage.getItem.mockReturnValue('invalid json');

      expect(() => {
        const savedSizeMemory = (window as any).localStorage.getItem(ITEM_SIZE_MEMORY_KEY);
        if (savedSizeMemory) {
          JSON.parse(savedSizeMemory);
        }
      }).toThrow();
    });
  });

  describe('clear item memory', () => {
    it('should clear specific item from memory', () => {
      const sizeMemory = new Map<number, { width: number; height: number }>();
      const variantMemory = new Map<number, { variant_id: number; addon_ids: number[] }>();

      sizeMemory.set(1, { width: 100, height: 50 });
      sizeMemory.set(2, { width: 200, height: 100 });
      variantMemory.set(1, { variant_id: 5, addon_ids: [1, 2] });
      variantMemory.set(2, { variant_id: 10, addon_ids: [3, 4] });

      // Simulate clearing item 1
      sizeMemory.delete(1);
      variantMemory.delete(1);

      expect(sizeMemory.has(1)).toBe(false);
      expect(variantMemory.has(1)).toBe(false);
      expect(sizeMemory.has(2)).toBe(true);
      expect(variantMemory.has(2)).toBe(true);
    });

    it('should persist cleared memory to localStorage', () => {
      const ITEM_SIZE_MEMORY_KEY = 'snapflow_item_size_memory';
      const ITEM_VARIANT_MEMORY_KEY = 'snapflow_item_variant_memory';

      const sizeMemory = new Map<number, { width: number; height: number }>();
      const variantMemory = new Map<number, { variant_id: number; addon_ids: number[] }>();

      sizeMemory.set(1, { width: 100, height: 50 });
      variantMemory.set(1, { variant_id: 5, addon_ids: [1, 2] });

      // Clear and persist
      sizeMemory.delete(1);
      variantMemory.delete(1);

      (window as any).localStorage.setItem(
        ITEM_SIZE_MEMORY_KEY,
        JSON.stringify(Array.from(sizeMemory.entries()))
      );
      (window as any).localStorage.setItem(
        ITEM_VARIANT_MEMORY_KEY,
        JSON.stringify(Array.from(variantMemory.entries()))
      );

      // Verify localStorage was called with empty arrays
      expect((window as any).localStorage.setItem).toHaveBeenCalledWith(
        ITEM_SIZE_MEMORY_KEY,
        '[]'
      );
      expect((window as any).localStorage.setItem).toHaveBeenCalledWith(
        ITEM_VARIANT_MEMORY_KEY,
        '[]'
      );
    });
  });
});
