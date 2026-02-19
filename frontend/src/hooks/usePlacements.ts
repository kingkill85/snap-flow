import { useState, useEffect, useCallback } from 'react';
import { placementService, type Placement, type CreatePlacementDTO, type UpdatePlacementDTO } from '../services/placement';

interface UsePlacementsReturn {
  placements: Placement[];
  isLoading: boolean;
  error: string | null;
  createPlacement: (data: CreatePlacementDTO) => Promise<Placement | null>;
  updatePlacement: (id: number, data: UpdatePlacementDTO) => Promise<void>;
  deletePlacement: (id: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function usePlacements(floorplanId: number | null): UsePlacementsReturn {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlacements = useCallback(async () => {
    if (!floorplanId) {
      setPlacements([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await placementService.getAll(floorplanId);
      setPlacements(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch placements');
      setPlacements([]);
    } finally {
      setIsLoading(false);
    }
  }, [floorplanId]);

  useEffect(() => {
    fetchPlacements();
  }, [fetchPlacements]);

  const createPlacement = useCallback(async (data: CreatePlacementDTO): Promise<Placement | null> => {
    try {
      const newPlacement = await placementService.create(data);
      setPlacements(prev => [...prev, newPlacement]);
      return newPlacement;
    } catch (err: any) {
      setError(err.message || 'Failed to create placement');
      return null;
    }
  }, []);

  const updatePlacement = useCallback(async (id: number, data: UpdatePlacementDTO) => {
    try {
      await placementService.update(id, data);
      await fetchPlacements();
    } catch (err: any) {
      setError(err.message || 'Failed to update placement');
    }
  }, [fetchPlacements]);

  const deletePlacement = useCallback(async (id: number) => {
    try {
      await placementService.delete(id);
      setPlacements(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete placement');
    }
  }, []);

  return {
    placements,
    isLoading,
    error,
    createPlacement,
    updatePlacement,
    deletePlacement,
    refetch: fetchPlacements,
  };
}
