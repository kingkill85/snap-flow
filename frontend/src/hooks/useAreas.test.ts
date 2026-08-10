import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Area } from '@/services/area';
import { areaService } from '@/services/area';
import { useAreas } from './useAreas';

vi.mock('@/services/area', () => ({
  areaService: {
    getByFloorplan: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateVertices: vi.fn(),
    delete: vi.fn(),
  },
}));

const makeArea = (revision: number, value: number): Area => ({
  id: 7,
  floorplan_id: 3,
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  name: revision === 1 ? 'Stale Area' : 'Winning Area',
  color: '#3b82f6',
  opacity: 0.2,
  revision,
  device_count: 0,
  created_at: '',
  updated_at: '',
  vertices: [],
  zoning_groups: [{
    item_type: { id: 1, name: 'Lighting', abbreviation: 'LGT', color: '#f00', sort_order: 0 },
    parameters: [{ id: 10, name: 'Zones', sort_order: 0, value }],
  }],
});

describe('useAreas canonical reload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches once, replaces canonical state, and returns the exact replacement object', async () => {
    const stale = makeArea(1, 1);
    const fresh = makeArea(2, 4);
    vi.mocked(areaService.getByFloorplan).mockResolvedValue([stale]);
    vi.mocked(areaService.getById).mockResolvedValue(fresh);
    const { result } = renderHook(() => useAreas({ activeFloorplanId: 3 }));
    await waitFor(() => expect(result.current.areas).toEqual([stale]));

    let returned: Area | undefined;
    await act(async () => { returned = await result.current.reloadArea(fresh.id); });
    expect(areaService.getById).toHaveBeenCalledTimes(1);
    expect(returned).toBe(fresh);
    expect(result.current.areas[0]).toBe(returned);
    expect(result.current.areas[0]).toMatchObject({ name: 'Winning Area', revision: 2 });
    expect(result.current.areas[0].zoning_groups[0].parameters[0].value).toBe(4);
  });
});
