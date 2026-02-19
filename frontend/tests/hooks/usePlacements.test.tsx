import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlacements } from '../../src/hooks/usePlacements';

// Mock the placement service
vi.mock('../../src/services/placement', () => ({
  placementService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { placementService } from '../../src/services/placement';

describe('usePlacements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with empty placements', () => {
    const { result } = renderHook(() => usePlacements(1));
    
    expect(result.current.placements).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches placements for floorplan', async () => {
    const mockPlacements = [
      { id: 1, floorplan_id: 1, item_id: 1, item_variant_id: 1, x: 100, y: 100, width: 50, height: 50 },
      { id: 2, floorplan_id: 1, item_id: 2, item_variant_id: 2, x: 200, y: 200, width: 100, height: 100 },
    ];

    (placementService.getAll as any).mockResolvedValueOnce(mockPlacements);

    const { result } = renderHook(() => usePlacements(1));

    await waitFor(() => {
      expect(result.current.placements).toHaveLength(2);
    });

    expect(result.current.placements[0]).toMatchObject({
      id: 1,
      x: 100,
      y: 100,
    });
  });

  it('creates placement successfully', async () => {
    const mockPlacement = { 
      id: 1, 
      floorplan_id: 1, 
      item_variant_id: 1, 
      x: 100, 
      y: 100, 
      width: 100, 
      height: 100 
    };
    
    (placementService.create as any).mockResolvedValueOnce(mockPlacement);

    const { result } = renderHook(() => usePlacements(1));

    const newPlacement = await result.current.createPlacement({
      floorplan_id: 1,
      item_variant_id: 1,
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    expect(newPlacement).toMatchObject({
      id: 1,
      x: 100,
      y: 100,
    });
    expect(placementService.create).toHaveBeenCalled();
  });

  it('updates placement successfully', async () => {
    const mockPlacement = { 
      id: 1, 
      floorplan_id: 1, 
      item_variant_id: 1, 
      x: 150, 
      y: 150, 
      width: 100, 
      height: 100 
    };

    (placementService.update as any).mockResolvedValueOnce(mockPlacement);
    (placementService.getAll as any).mockResolvedValueOnce([mockPlacement]);

    const { result } = renderHook(() => usePlacements(1));

    await result.current.updatePlacement(1, { x: 150, y: 150 });

    expect(placementService.update).toHaveBeenCalledWith(1, { x: 150, y: 150 });
  });

  it('deletes placement successfully', async () => {
    (placementService.delete as any).mockResolvedValueOnce(undefined);
    (placementService.getAll as any).mockResolvedValueOnce([]);

    const { result } = renderHook(() => usePlacements(1));

    await result.current.deletePlacement(1);

    expect(placementService.delete).toHaveBeenCalledWith(1);
  });

  it('handles error when fetching placements', async () => {
    (placementService.getAll as any).mockRejectedValueOnce(new Error('Failed to fetch'));

    const { result } = renderHook(() => usePlacements(1));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch');
    });
  });

  it('refetches placements when floorplanId changes', async () => {
    const mockPlacements1 = [{ id: 1, floorplan_id: 1 }];
    const mockPlacements2 = [{ id: 2, floorplan_id: 2 }];

    (placementService.getAll as any)
      .mockResolvedValueOnce(mockPlacements1)
      .mockResolvedValueOnce(mockPlacements2);

    const { result, rerender } = renderHook(
      ({ floorplanId }) => usePlacements(floorplanId),
      { initialProps: { floorplanId: 1 } }
    );

    await waitFor(() => {
      expect(result.current.placements).toHaveLength(1);
    });

    rerender({ floorplanId: 2 });

    await waitFor(() => {
      expect(placementService.getAll).toHaveBeenCalledTimes(2);
    });
  });
});
