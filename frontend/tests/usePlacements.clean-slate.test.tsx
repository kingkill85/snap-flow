import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlacements } from '@/hooks/usePlacements';
import { placementService, type Placement } from '@/services/placement';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

vi.mock('@/services/placement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/placement')>();
  return {
    ...actual,
    placementService: {
      ...actual.placementService,
      clearFloorplan: vi.fn(),
    },
  };
});

const floorplan = {
  id: 42,
  project_id: 7,
  name: 'Ground Floor',
  image_path: 'floorplans/ground.png',
  sort_order: 1,
  created_at: '2026-01-01',
};

const placement: Placement = {
  id: 9,
  type: 'item',
  bom_id: 12,
  area_id: 4,
  floorplan_id: 42,
  item_id: 3,
  item_variant_id: 5,
  x: 1,
  y: 2,
  width: 30,
  height: 30,
  rotation: 0,
  created_at: '2026-01-01',
};

function renderPlacements() {
  const setPlacementsVersion = vi.fn();
  const onPlacementChanged = vi.fn();
  const result = renderHook(() => usePlacements({
    activeFloorplan: floorplan,
    itemSizeMemory: { current: new Map() },
    itemVariantMemory: { current: new Map() },
    persistSizeMemory: vi.fn(),
    persistVariantMemory: vi.fn(),
    setPlacementsVersion,
    onPlacementChanged,
  }));
  return { ...result, setPlacementsVersion, onPlacementChanged };
}

describe('usePlacements Clean Slate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits for success, clears placement/add-on state, and refreshes dependents once', async () => {
    let resolveRequest!: (count: number) => void;
    vi.mocked(placementService.clearFloorplan).mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const hook = renderPlacements();
    act(() => {
      hook.result.current.setPlacements([placement]);
      hook.result.current.placementAddons.current.set(placement.id, [8]);
    });

    let request!: Promise<number>;
    act(() => { request = hook.result.current.handleCleanSlate(); });
    expect(hook.result.current.placements).toHaveLength(1);

    await act(async () => resolveRequest(1));
    await expect(request).resolves.toBe(1);
    expect(hook.result.current.placements).toEqual([]);
    expect(hook.result.current.placementAddons.current.size).toBe(0);
    expect(hook.setPlacementsVersion).toHaveBeenCalledTimes(1);
    expect(hook.onPlacementChanged).toHaveBeenCalledTimes(1);
  });

  it('preserves local state when cleanup fails', async () => {
    vi.mocked(placementService.clearFloorplan).mockRejectedValue(new Error('network failed'));
    const hook = renderPlacements();
    act(() => hook.result.current.setPlacements([placement]));

    await expect(hook.result.current.handleCleanSlate()).rejects.toThrow('network failed');
    expect(hook.result.current.placements).toEqual([placement]);
    expect(hook.setPlacementsVersion).not.toHaveBeenCalled();
    expect(hook.onPlacementChanged).not.toHaveBeenCalled();
  });
});
