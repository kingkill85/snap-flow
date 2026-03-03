import { useState, useCallback, useRef } from 'react';
import { projectService, type Project } from '@/services/project';
import { floorplanService, type Floorplan } from '@/services/floorplan';
import { itemService, type Item } from '@/services/item';
import { bomService } from '@/services/bom';
import type { InvoiceSettings } from '@/services/invoice-settings';
import type { FloorplanBom } from '@/services/bom';
import { extractErrorMessage } from '@/utils';

interface UseProjectDataProps {
  projectId: number;
}

interface UseProjectDataReturn {
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  floorplans: Floorplan[];
  setFloorplans: React.Dispatch<React.SetStateAction<Floorplan[]>>;
  activeFloorplan: Floorplan | null;
  setActiveFloorplan: React.Dispatch<React.SetStateAction<Floorplan | null>>;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  showNotFound: boolean;
  setShowNotFound: React.Dispatch<React.SetStateAction<boolean>>;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  visibleCategories: Set<number>;
  setVisibleCategories: React.Dispatch<React.SetStateAction<Set<number>>>;
  invoiceSettings: InvoiceSettings | null;
  setInvoiceSettings: React.Dispatch<React.SetStateAction<InvoiceSettings | null>>;
  floorplanBoms: Map<number, FloorplanBom>;
  setFloorplanBom: (floorplanId: number, bom: FloorplanBom) => void;
  fetchProjectData: (signal?: AbortSignal) => Promise<void>;
  fetchFloorplanBom: (floorplanId: number, signal?: AbortSignal) => Promise<void>;
}

export function useProjectData({ projectId }: UseProjectDataProps): UseProjectDataReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [activeFloorplan, setActiveFloorplan] = useState<Floorplan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotFound, setShowNotFound] = useState(false);
  const [error, setError] = useState('');
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(new Set());
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings | null>(null);
  const [floorplanBoms, setFloorplanBoms] = useState<Map<number, FloorplanBom>>(new Map());

  const setFloorplanBom = useCallback((floorplanId: number, bom: FloorplanBom) => {
    setFloorplanBoms((prev) => new Map(prev).set(floorplanId, bom));
  }, []);

  // Use ref to avoid circular dependency
  const activeFloorplanRef = useRef(activeFloorplan);
  activeFloorplanRef.current = activeFloorplan;

  const fetchProjectData = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setShowNotFound(false);
      const [projectData, floorplansData, itemsResult] = await Promise.all([
        projectService.getById(projectId, signal),
        floorplanService.getAll(projectId, signal),
        itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }),
      ]);

      setProject(projectData);
      setFloorplans(floorplansData);
      setItems(itemsResult.items);

      // Initialize visible categories with all category IDs from items
      const categoryIds = new Set(itemsResult.items.map(item => item.category_id));
      setVisibleCategories(categoryIds);
      
      // Extract invoice settings from project data
      setInvoiceSettings({
        discount_percentage: projectData.discount_percentage,
        discount_usd: projectData.discount_usd,
        services_percentage: projectData.services_percentage,
        services_usd: projectData.services_usd,
        local_currency_code: projectData.local_currency_code,
        exchange_rate: projectData.exchange_rate,
      });
      
      if (floorplansData.length > 0) {
        // Use ref to get current value without dependency
        const currentActive = activeFloorplanRef.current;
        if (!currentActive) {
          setActiveFloorplan(floorplansData[0]);
        } else {
          // Update active floorplan with fresh data from API
          const updatedFloorplan = floorplansData.find(fp => fp.id === currentActive.id);
          if (updatedFloorplan) {
            setActiveFloorplan(updatedFloorplan);
          } else {
            // Previously active floorplan no longer exists (was deleted)
            setActiveFloorplan(floorplansData[0]);
          }
        }
      } else {
        // No floorplans left, clear active floorplan
        setActiveFloorplan(null);
      }

      setError('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(extractErrorMessage(err, 'Failed to load project data'));
        // Only show "not found" if we get a 404
        if ((err as { response?: { status?: number } }).response?.status === 404) {
          setShowNotFound(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const fetchFloorplanBom = useCallback(async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const bomData = await bomService.getBomForFloorplan(floorplanId, signal);
      setFloorplanBom(floorplanId, bomData);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to load BOM:', err);
      }
    }
  }, [setFloorplanBom]);

  return {
    project,
    setProject,
    floorplans,
    setFloorplans,
    activeFloorplan,
    setActiveFloorplan,
    items,
    setItems,
    isLoading,
    setIsLoading,
    showNotFound,
    setShowNotFound,
    error,
    setError,
    visibleCategories,
    setVisibleCategories,
    invoiceSettings,
    setInvoiceSettings,
    floorplanBoms,
    setFloorplanBom,
    fetchProjectData,
    fetchFloorplanBom,
  };
}
