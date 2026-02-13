import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useItems } from '../src/hooks/useItems';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useItems());
    
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.pagination).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches items with default options', async () => {
    const mockResponse = {
      data: [
        { id: 1, name: 'Smart Bulb', price: 29.99, category_id: 1 },
        { id: 2, name: 'Smart Switch', price: 49.99, category_id: 1 },
      ],
      pagination: {
        total: 2,
        page: 1,
        totalPages: 1,
        limit: 20,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useItems());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toEqual(mockResponse.data);
    expect(result.current.pagination).toEqual(mockResponse.pagination);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('/api/items?page=1&limit=20', expect.any(Object));
  });

  it('fetches items with category filter', async () => {
    const mockResponse = {
      data: [{ id: 1, name: 'Smart Bulb', price: 29.99, category_id: 1 }],
      pagination: { total: 1, page: 1, totalPages: 1, limit: 20 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useItems({ categoryId: 1 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/items?category_id=1&page=1&limit=20',
      expect.any(Object)
    );
  });

  it('fetches items with search filter', async () => {
    const mockResponse = {
      data: [{ id: 1, name: 'Smart Bulb', price: 29.99, category_id: 1 }],
      pagination: { total: 1, page: 1, totalPages: 1, limit: 20 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useItems({ search: 'bulb' }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/items?search=bulb&page=1&limit=20',
      expect.any(Object)
    );
  });

  it('fetches items with pagination options', async () => {
    const mockResponse = {
      data: [],
      pagination: { total: 50, page: 2, totalPages: 5, limit: 10 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useItems({ page: 2, limit: 10 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/items?page=2&limit=10', expect.any(Object));
    expect(result.current.pagination?.page).toBe(2);
    expect(result.current.pagination?.limit).toBe(10);
  });

  it('handles combined filters', async () => {
    const mockResponse = {
      data: [],
      pagination: { total: 0, page: 1, totalPages: 0, limit: 20 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    renderHook(() => useItems({ categoryId: 1, search: 'smart', page: 1, limit: 10 }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('category_id=1');
    expect(url).toContain('search=smart');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
  });

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useItems());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to fetch items');
    expect(result.current.items).toEqual([]);
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failed'));

    const { result } = renderHook(() => useItems());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network failed');
  });

  it('handles AbortError silently', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useItems());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it('refetch reloads items', async () => {
    const firstResponse = {
      data: [{ id: 1, name: 'Item 1', price: 10 }],
      pagination: { total: 1, page: 1, totalPages: 1, limit: 20 },
    };

    const secondResponse = {
      data: [
        { id: 1, name: 'Item 1', price: 10 },
        { id: 2, name: 'Item 2', price: 20 },
      ],
      pagination: { total: 2, page: 1, totalPages: 1, limit: 20 },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondResponse) });

    const { result } = renderHook(() => useItems());

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    // Trigger refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('refetches when options change', async () => {
    const mockResponse = {
      data: [],
      pagination: { total: 0, page: 1, totalPages: 0, limit: 20 },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result, rerender } = renderHook(
      ({ categoryId }) => useItems({ categoryId }),
      { initialProps: { categoryId: 1 } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/items?category_id=1&page=1&limit=20', expect.any(Object));

    // Change category
    rerender({ categoryId: 2 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/items?category_id=2&page=1&limit=20', expect.any(Object));
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts fetch on unmount', async () => {
    mockFetch.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ data: [], pagination: null }) }), 1000);
      });
    });

    const { result, unmount } = renderHook(() => useItems());

    expect(result.current.isLoading).toBe(true);

    unmount();

    // Should not throw or error after unmount
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('passes abort signal to fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: null }),
    });

    renderHook(() => useItems());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal');
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
  });
});
