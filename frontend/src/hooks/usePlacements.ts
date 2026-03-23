import { useState, useCallback, useRef, useEffect } from 'react';
import type { Placement, CreatePlacementDTO } from '@/services/placement';
import { placementService } from '@/services/placement';
import type { Floorplan } from '@/services/floorplan';

interface UsePlacementsProps {
  activeFloorplan: Floorplan | null;
  itemSizeMemory: React.MutableRefObject<Map<number, { width: number; height: number }>>;
  itemVariantMemory: React.MutableRefObject<Map<number, { variant_id: number; addon_ids: number[] }>>;
  persistSizeMemory: () => void;
  persistVariantMemory: () => void;
  setPlacementsVersion: React.Dispatch<React.SetStateAction<number>>;
}

interface UsePlacementsReturn {
  placements: Placement[];
  setPlacements: React.Dispatch<React.SetStateAction<Placement[]>>;
  handlePlacementCreate: (placement: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    item_id: number;
    item_variant_id: number;
    addon_ids?: number[];
    ignoreDefaults?: boolean;
  }) => Promise<void>;
  handlePlacementUpdate: (id: number, placement: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    item_variant_id?: number;
    addon_ids?: number[];
    rotation?: number;
  }, isFinal?: boolean) => Promise<void>;
  handlePlacementDelete: (id: number) => Promise<void>;
  fetchPlacements: (floorplanId: number, signal?: AbortSignal) => Promise<void>;
  placementAddons: React.MutableRefObject<Map<number, number[]>>;
}

export function usePlacements({
  activeFloorplan,
  itemSizeMemory,
  itemVariantMemory,
  persistSizeMemory,
  persistVariantMemory,
  setPlacementsVersion,
}: UsePlacementsProps): UsePlacementsReturn {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const placementsRef = useRef(placements);
  useEffect(() => { placementsRef.current = placements; }, [placements]);
  const placementAddons = useRef<Map<number, number[]>>(new Map());

  const fetchPlacements = useCallback(async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const placementsData = await placementService.getAll(floorplanId, signal);
      setPlacements(placementsData);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to load placements:', err);
      }
    }
  }, []);

  const handlePlacementCreate = useCallback(async (placement: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    item_id: number;
    item_variant_id: number;
    addon_ids?: number[];
    ignoreDefaults?: boolean;
  }) => {
    if (!activeFloorplan) return;

    const width = placement.width ?? 60;
    const height = placement.height ?? 60;

    const createData: CreatePlacementDTO = {
      floorplan_id: activeFloorplan.id,
      item_variant_id: placement.item_variant_id,
      x: placement.x,
      y: placement.y,
      width,
      height,
    };

    const newPlacement = await placementService.create(createData);

    if (placement.addon_ids !== undefined) {
      await placementService.updateBom(newPlacement.id, placement.item_variant_id, placement.addon_ids);
    }

    if (!placement.ignoreDefaults) {
      itemSizeMemory.current.set(placement.item_id, { width, height });
      persistSizeMemory();

      itemVariantMemory.current.set(placement.item_id, {
        variant_id: placement.item_variant_id,
        addon_ids: placement.addon_ids || [],
      });
      persistVariantMemory();
    }

    placementAddons.current.set(newPlacement.id, placement.addon_ids || []);
    setPlacements(prev => [...prev, newPlacement]);
    setPlacementsVersion(prev => prev + 1);
  }, [activeFloorplan, itemSizeMemory, itemVariantMemory, persistSizeMemory, persistVariantMemory, setPlacementsVersion]);

  const handlePlacementUpdate = useCallback(async (id: number, placement: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    item_variant_id?: number;
    addon_ids?: number[];
    rotation?: number;
  }, isFinal?: boolean) => {
    setPlacements(prev => prev.map(p => 
      p.id === id ? { ...p, ...placement } : p
    ));
    
    if (placement.item_variant_id !== undefined) {
      try {
        const result = await placementService.updateBom(id, placement.item_variant_id, placement.addon_ids || []);

        setPlacements(prev => prev.map(p =>
          p.id === id ? result.placement : p
        ));

        itemVariantMemory.current.set(result.placement.item_id, {
          variant_id: placement.item_variant_id,
          addon_ids: placement.addon_ids || [],
        });
        persistVariantMemory();

        placementAddons.current.set(id, placement.addon_ids || []);
        setPlacementsVersion(prev => prev + 1);
        return;
      } catch (err) {
        console.error('Failed to update BOM:', err);
        throw err;
      }
    }
    
    if (placement.width !== undefined || placement.height !== undefined) {
      const updatedPlacement = placementsRef.current.find(p => p.id === id);
      if (updatedPlacement) {
        const newWidth = placement.width ?? updatedPlacement.width;
        const newHeight = placement.height ?? updatedPlacement.height;
        itemSizeMemory.current.set(updatedPlacement.item_id, {
          width: newWidth,
          height: newHeight,
        });
        persistSizeMemory();
      }
    }
    
    if (isFinal !== false) {
      await placementService.update(id, placement);
    }
  }, [itemSizeMemory, itemVariantMemory, persistSizeMemory, persistVariantMemory, setPlacementsVersion]);

  const handlePlacementDelete = useCallback(async (id: number) => {
    placementAddons.current.delete(id);
    await placementService.delete(id);
    if (activeFloorplan) {
      await fetchPlacements(activeFloorplan.id);
    }
    setPlacementsVersion(prev => prev + 1);
  }, [activeFloorplan, fetchPlacements, setPlacementsVersion]);

  return {
    placements,
    setPlacements,
    handlePlacementCreate,
    handlePlacementUpdate,
    handlePlacementDelete,
    fetchPlacements,
    placementAddons,
  };
}
