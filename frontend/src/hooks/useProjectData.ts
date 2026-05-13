import { useState, useCallback, useRef } from 'react';
import { projectService, type Project } from '@/services/project';
import { floorplanService, type Floorplan } from '@/services/floorplan';
import { itemService, type Item } from '@/services/item';
import { categoryService, type Category } from '@/services/category';
import { bomService } from '@/services/bom';
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
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  showNotFound: boolean;
  setShowNotFound: React.Dispatch<React.SetStateAction<boolean>>;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  visibleCategories: Set<number>;
  setVisibleCategories: React.Dispatch<React.SetStateAction<Set<number>>>;
  floorplanBoms: Map<number, FloorplanBom>;
  setFloorplanBoms: React.Dispatch<React.SetStateAction<Map<number, FloorplanBom>>>;
  fetchProjectData: (signal?: AbortSignal) => Promise<void>;
  fetchFloorplanBom: (floorplanId: number, signal?: AbortSignal) => Promise<void>;
}

export function useProjectData({ projectId }: UseProjectDataProps): UseProjectDataReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [activeFloorplan, setActiveFloorplan] = useState<Floorplan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotFound, setShowNotFound] = useState(false);
  const [error, setError] = useState('');
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(new Set());
  const [floorplanBoms, setFloorplanBoms] = useState<Map<number, FloorplanBom>>(new Map());

  // Use ref to avoid circular dependency
  const activeFloorplanRef = useRef(activeFloorplan);
  activeFloorplanRef.current = activeFloorplan;

  const fetchProjectData = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setShowNotFound(false);
      const [projectData, floorplansData, itemsResult, categoriesData] = await Promise.all([
        projectService.getById(projectId, signal),
        floorplanService.getAll(projectId, signal),
        itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }, signal),
        categoryService.getAll(signal),
      ]);

      // Normalize nested group data for backward compatibility
      if (projectData.group) {
        // @ts-expect-error - backward compat
        projectData.customer_name = projectData.group.customer_name;
        // @ts-expect-error - backward compat
        projectData.customer_email = projectData.group.customer_email;
        // @ts-expect-error - backward compat
        projectData.customer_phone = projectData.group.customer_phone;
        // @ts-expect-error - backward compat
        projectData.customer_address = projectData.group.customer_address;
      }

      setProject(projectData);
      setFloorplans(floorplansData);
      setItems(itemsResult.items);
      setCategories(categoriesData);

      // Initialize visible categories with all category IDs from items
      const categoryIds = new Set(itemsResult.items.map(item => item.category_id));
      setVisibleCategories(categoryIds);

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
      setFloorplanBoms((prev) => new Map(prev).set(floorplanId, bomData));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to load BOM:', err);
      }
    }
  }, []);

  return {
    project,
    setProject,
    floorplans,
    setFloorplans,
    activeFloorplan,
    setActiveFloorplan,
    items,
    setItems,
    categories,
    setCategories,
    isLoading,
    setIsLoading,
    showNotFound,
    setShowNotFound,
    error,
    setError,
    visibleCategories,
    setVisibleCategories,
    floorplanBoms,
    setFloorplanBoms,
    fetchProjectData,
    fetchFloorplanBom,
  };
}
