import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCategories } from '../src/hooks/useCategories';
import { categoryService } from '../src/services/category';

// Mock the category service
vi.mock('../src/services/category', () => ({
  categoryService: {
    getAll: vi.fn(),
  },
}));

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useCategories());
    
    expect(result.current.isLoading).toBe(true);
    expect(result.current.categories).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches categories on mount', async () => {
    const mockCategories = [
      { id: 1, name: 'Lighting', sort_order: 1 },
      { id: 2, name: 'Security', sort_order: 2 },
    ];
    
    categoryService.getAll.mockResolvedValueOnce(mockCategories);

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.error).toBeNull();
    expect(categoryService.getAll).toHaveBeenCalledTimes(1);
  });

  it('handles fetch error', async () => {
    const errorMessage = 'Network error';
    categoryService.getAll.mockRejectedValueOnce(new Error(errorMessage));

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.categories).toEqual([]);
  });

  it('handles AbortError silently', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    categoryService.getAll.mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it('refetch reloads categories', async () => {
    const initialCategories = [{ id: 1, name: 'Lighting', sort_order: 1 }];
    const updatedCategories = [
      { id: 1, name: 'Lighting', sort_order: 1 },
      { id: 2, name: 'Security', sort_order: 2 },
    ];

    categoryService.getAll
      .mockResolvedValueOnce(initialCategories)
      .mockResolvedValueOnce(updatedCategories);

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.categories).toEqual(initialCategories);
    });

    // Trigger refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.categories).toEqual(updatedCategories);
    });

    expect(categoryService.getAll).toHaveBeenCalledTimes(2);
  });

  it('aborts fetch on unmount', async () => {
    categoryService.getAll.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve([]), 1000);
      });
    });

    const { result, unmount } = renderHook(() => useCategories());

    expect(result.current.isLoading).toBe(true);

    unmount();

    // Should not throw or error after unmount
    await waitFor(() => {
      expect(categoryService.getAll).toHaveBeenCalled();
    });
  });

  it('passes abort signal to service', async () => {
    categoryService.getAll.mockResolvedValueOnce([]);

    renderHook(() => useCategories());

    await waitFor(() => {
      expect(categoryService.getAll).toHaveBeenCalled();
    });

    // Verify signal was passed
    const callArgs = categoryService.getAll.mock.calls[0];
    expect(callArgs[0]).toBeInstanceOf(AbortSignal);
  });
});
