import { useState, useCallback, useEffect } from 'react';
import type { Area, CreateAreaDTO, UpdateAreaDTO } from '@/services/area';
import { areaService } from '@/services/area';

interface UseAreasProps {
  activeFloorplanId: number | null;
}

interface UseAreasReturn {
  areas: Area[];
  isLoading: boolean;
  selectedAreaId: number | null;
  fetchAreas: (floorplanId: number, signal?: AbortSignal) => Promise<void>;
  createArea: (data: CreateAreaDTO) => Promise<Area>;
  updateArea: (id: number, data: UpdateAreaDTO) => Promise<void>;
  updateVertices: (id: number, vertices: { x: number; y: number }[]) => Promise<void>;
  deleteArea: (id: number) => Promise<void>;
  setSelectedAreaId: (id: number | null) => void;
}

export function useAreas({ activeFloorplanId }: UseAreasProps): UseAreasReturn {
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);

  const fetchAreas = useCallback(async (floorplanId: number, signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const data = await areaService.getByFloorplan(floorplanId, signal);
      setAreas(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to load areas:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createArea = useCallback(async (data: CreateAreaDTO): Promise<Area> => {
    const newArea = await areaService.create(data);
    setAreas(prev => [...prev, newArea]);
    return newArea;
  }, []);

  const updateArea = useCallback(async (id: number, data: UpdateAreaDTO): Promise<void> => {
    const updated = await areaService.update(id, data);
    setAreas(prev => prev.map(a => a.id === id ? updated : a));
  }, []);

  const updateVertices = useCallback(async (id: number, vertices: { x: number; y: number }[]): Promise<void> => {
    const updated = await areaService.updateVertices(id, vertices);
    setAreas(prev => prev.map(a => a.id === id ? updated : a));
  }, []);

  const deleteArea = useCallback(async (id: number): Promise<void> => {
    await areaService.delete(id);
    setAreas(prev => prev.filter(a => a.id !== id));
    setSelectedAreaId(prev => prev === id ? null : prev);
  }, []);

  useEffect(() => {
    if (activeFloorplanId === null) {
      setAreas([]);
      return;
    }

    const controller = new AbortController();
    fetchAreas(activeFloorplanId, controller.signal);

    return () => {
      controller.abort();
    };
  }, [activeFloorplanId, fetchAreas]);

  return {
    areas,
    isLoading,
    selectedAreaId,
    fetchAreas,
    createArea,
    updateArea,
    updateVertices,
    deleteArea,
    setSelectedAreaId,
  };
}
