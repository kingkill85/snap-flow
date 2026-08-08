import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/services/api';
import { placementService } from '@/services/placement';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

vi.mock('@/services/api', () => ({
  default: { delete: vi.fn() },
}));

describe('placementService.clearFloorplan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes every placement for one floorplan and returns the server count', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { deleted_count: 3 } } });

    await expect(placementService.clearFloorplan(42)).resolves.toBe(3);
    expect(api.delete).toHaveBeenCalledWith('/placements/floorplan/42', { signal: undefined });
  });
});
