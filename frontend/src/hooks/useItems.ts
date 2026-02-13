import { useState, useEffect, useCallback } from 'react';

interface Item {
  id: number;
  category_id: number;
  name: string;
  description: string;
  model_number: string;
  dimensions: string;
  price: number;
  image_path: string;
  created_at: string;
}

interface Pagination {
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

interface UseItemsOptions {
  categoryId?: number;
  search?: string;
  page?: number;
  limit?: number;
}

interface UseItemsReturn {
  items: Item[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook for fetching and managing items
 * Supports filtering by category, search, and pagination
 */
export function useItems(options: UseItemsOptions = {}): UseItemsReturn {
  const { categoryId, search, page = 1, limit = 20 } = options;
  
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (categoryId) params.append('category_id', categoryId.toString());
      if (search) params.append('search', search);
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/items?${params.toString()}`, { signal });
      
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }
      
      const data = await response.json();
      setItems(data.data);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch items');
      }
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, search, page, limit]);

  useEffect(() => {
    const controller = new AbortController();
    fetchItems(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [fetchItems]);

  return {
    items,
    pagination,
    isLoading,
    error,
    refetch: () => fetchItems(),
  };
}

export default useItems;
