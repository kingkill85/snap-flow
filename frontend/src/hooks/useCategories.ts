import { useState, useEffect, useCallback } from 'react';
import { categoryService, type Category } from '../services/category';

interface UseCategoriesReturn {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook for fetching and managing categories
 * Automatically fetches categories on mount
 */
export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await categoryService.getAll(signal);
      setCategories(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch categories');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [fetchCategories]);

  return {
    categories,
    isLoading,
    error,
    refetch: () => fetchCategories(),
  };
}

export default useCategories;
