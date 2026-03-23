import { useRef, useEffect, useCallback } from 'react';

export interface ItemSize {
  width: number;
  height: number;
}

export interface VariantConfig {
  variant_id: number;
  addon_ids: number[];
}

/**
 * Hook to manage item size and variant configuration memory with localStorage persistence
 */
export function useItemMemory(projectId: number) {
  const getSizeMemoryKey = (projId: number) => `snapflow_item_size_memory_${projId}`;
  const getVariantMemoryKey = (projId: number) => `snapflow_item_variant_memory_${projId}`;

  const itemSizeMemory = useRef<Map<number, ItemSize>>(new Map());
  const itemVariantMemory = useRef<Map<number, VariantConfig>>(new Map());

  // Load persisted memory from localStorage when project changes
  useEffect(() => {
    if (!projectId) return;

    try {
      const savedSizeMemory = localStorage.getItem(getSizeMemoryKey(projectId));
      if (savedSizeMemory) {
        const parsed = JSON.parse(savedSizeMemory);
        itemSizeMemory.current = new Map(parsed);
      } else {
        itemSizeMemory.current = new Map();
      }

      const savedVariantMemory = localStorage.getItem(getVariantMemoryKey(projectId));
      if (savedVariantMemory) {
        const parsed = JSON.parse(savedVariantMemory);
        itemVariantMemory.current = new Map(parsed);
      } else {
        itemVariantMemory.current = new Map();
      }
    } catch (err) {
      console.error('Failed to load item memory from localStorage:', err);
    }
  }, [projectId]);

  // Persist size memory to localStorage
  const persistSizeMemory = useCallback(() => {
    try {
      localStorage.setItem(getSizeMemoryKey(projectId), JSON.stringify(Array.from(itemSizeMemory.current.entries())));
    } catch (err) {
      console.error('Failed to persist size memory:', err);
    }
  }, [projectId]);

  // Persist variant memory to localStorage
  const persistVariantMemory = useCallback(() => {
    try {
      localStorage.setItem(getVariantMemoryKey(projectId), JSON.stringify(Array.from(itemVariantMemory.current.entries())));
    } catch (err) {
      console.error('Failed to persist variant memory:', err);
    }
  }, [projectId]);

  // Clear memory for a specific item (used with Ctrl+drag)
  const clearItemMemory = (itemId: number) => {
    itemSizeMemory.current.delete(itemId);
    itemVariantMemory.current.delete(itemId);
    persistSizeMemory();
    persistVariantMemory();
  };

  return {
    itemSizeMemory,
    itemVariantMemory,
    persistSizeMemory,
    persistVariantMemory,
    clearItemMemory,
  };
}
