import { describe, it, expect, vi, beforeEach } from 'vitest';
import { itemTypeService } from '@/services/item-type';
import api from '@/services/api';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('itemTypeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('calls GET /item-types', async () => {
      const mockData = [{ id: 1, name: 'Zigbee' }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.get as any).mockResolvedValue({ data: { data: mockData } });

      const result = await itemTypeService.getAll();

      expect(api.get).toHaveBeenCalledWith('/item-types', { params: undefined, signal: undefined });
      expect(result).toEqual(mockData);
    });

    it('passes include_inactive query param when includeInactive is true', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.get as any).mockResolvedValue({ data: { data: [] } });

      await itemTypeService.getAll(undefined, true);

      expect(api.get).toHaveBeenCalledWith('/item-types', {
        params: { include_inactive: 'true' },
        signal: undefined,
      });
    });
  });

  describe('create', () => {
    it('sends POST /item-types with data', async () => {
      const createData = { name: 'Zigbee', abbreviation: 'ZB', color: '#3b82f6' };
      const mockResponse = { id: 1, ...createData };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.post as any).mockResolvedValue({ data: { data: mockResponse } });

      const result = await itemTypeService.create(createData);

      expect(api.post).toHaveBeenCalledWith('/item-types', createData, { signal: undefined });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('update', () => {
    it('sends PUT /item-types/:id with data', async () => {
      const updateData = { name: 'Updated Zigbee' };
      const mockResponse = { id: 1, name: 'Updated Zigbee' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.put as any).mockResolvedValue({ data: { data: mockResponse } });

      const result = await itemTypeService.update(1, updateData);

      expect(api.put).toHaveBeenCalledWith('/item-types/1', updateData, { signal: undefined });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('delete', () => {
    it('sends DELETE /item-types/:id', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.delete as any).mockResolvedValue({});

      await itemTypeService.delete(5);

      expect(api.delete).toHaveBeenCalledWith('/item-types/5', { signal: undefined });
    });
  });

  describe('reorder', () => {
    it('sends PATCH /item-types/reorder with ids', async () => {
      const ids = [3, 1, 2];
      const mockResponse = [{ id: 3 }, { id: 1 }, { id: 2 }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.patch as any).mockResolvedValue({ data: { data: mockResponse } });

      const result = await itemTypeService.reorder(ids);

      expect(api.patch).toHaveBeenCalledWith('/item-types/reorder', { ids });
      expect(result).toEqual(mockResponse);
    });
  });
});
