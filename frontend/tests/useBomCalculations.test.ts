import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBomCalculations } from '@/hooks/useBomCalculations';
import type { Floorplan } from '@/services/floorplan';
import type { FloorplanBom, BomGroup } from '@/services/bom';
import type { Item } from '@/services/item';
import type { Category } from '@/services/category';

const makeFloorplan = (id: number, name = `Floorplan ${id}`): Floorplan => ({
  id,
  project_id: 1,
  name,
  image_path: null,
  sort_order: id,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const makeBomEntry = (overrides: Partial<{
  id: number;
  item_id: number;
  item_name: string;
  style_name: string | null;
  unit_price: number;
}> = {}) => ({
  id: overrides.id ?? 1,
  project_id: 1,
  floorplan_id: 1,
  item_id: overrides.item_id ?? 1,
  variant_id: 1,
  parent_bom_id: null,
  item_name: overrides.item_name ?? 'Smart Bulb',
  style_name: overrides.style_name ?? null,
  model_number: 'SB-100',
  unit_price: overrides.unit_price ?? 50,
  picture_path: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  children: [],
  placement_count: 1,
  is_available: true,
});

const makeBomGroup = (mainEntry: ReturnType<typeof makeBomEntry>, children: ReturnType<typeof makeBomEntry>[] = [], quantity = 1): BomGroup => ({
  mainEntry,
  children,
  bomEntryIds: [mainEntry.id],
  quantity,
  totalPrice: mainEntry.unit_price * quantity,
  isAvailable: true,
});

const mockCategories: Category[] = [
  { id: 10, name: 'Lighting', sort_order: 1, is_active: true },
  { id: 20, name: 'Security', sort_order: 2, is_active: true },
];

const mockItems: Item[] = [
  { id: 1, category_id: 10, name: 'Smart Bulb', base_model_number: 'SB-100', description: '', dimensions: '', created_at: '2024-01-01T00:00:00Z', is_active: true },
  { id: 2, category_id: 20, name: 'Security Camera', base_model_number: 'SC-100', description: '', dimensions: '', created_at: '2024-01-01T00:00:00Z', is_active: true },
];

describe('useBomCalculations', () => {
  it('returns empty totals for empty floorplans array', () => {
    const { result } = renderHook(() =>
      useBomCalculations([], new Map(), mockItems, mockCategories)
    );

    expect(result.current.floorplanTotals).toEqual([]);
    expect(result.current.projectTotal).toBe(0);
  });

  it('returns zero total for floorplan with no BOM', () => {
    const floorplans = [makeFloorplan(1)];
    const floorplanBoms = new Map<number, FloorplanBom>();

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    expect(result.current.floorplanTotals).toHaveLength(1);
    expect(result.current.floorplanTotals[0].total).toBe(0);
    expect(result.current.floorplanTotals[0].items).toEqual([]);
    expect(result.current.projectTotal).toBe(0);
  });

  it('aggregates items correctly (name, quantity, total)', () => {
    const floorplans = [makeFloorplan(1)];
    const entry = makeBomEntry({ item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const group = makeBomGroup(entry, [], 2);
    const bom: FloorplanBom = { floorplanId: 1, groups: [group], totalPrice: 100 };
    const floorplanBoms = new Map([[1, bom]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    expect(result.current.floorplanTotals[0].total).toBe(100);
    const items = result.current.floorplanTotals[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Smart Bulb');
    expect(items[0].quantity).toBe(2);
    expect(items[0].unitPrice).toBe(50);
    expect(items[0].total).toBe(100);
  });

  it('calculates project total as sum of all floorplan totals', () => {
    const floorplans = [makeFloorplan(1), makeFloorplan(2)];

    const entry1 = makeBomEntry({ id: 1, item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const bom1: FloorplanBom = { floorplanId: 1, groups: [makeBomGroup(entry1, [], 2)], totalPrice: 100 };

    const entry2 = makeBomEntry({ id: 2, item_id: 2, item_name: 'Security Camera', unit_price: 200 });
    const bom2: FloorplanBom = { floorplanId: 2, groups: [makeBomGroup(entry2, [], 1)], totalPrice: 200 };

    const floorplanBoms = new Map([[1, bom1], [2, bom2]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    expect(result.current.projectTotal).toBe(300);
  });

  it('handles items with addons (children in BomGroup)', () => {
    const floorplans = [makeFloorplan(1)];
    const mainEntry = makeBomEntry({ id: 1, item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const addon = makeBomEntry({ id: 2, item_id: 1, item_name: 'Mounting Bracket', unit_price: 10 });
    const group = makeBomGroup(mainEntry, [addon], 1);
    const bom: FloorplanBom = { floorplanId: 1, groups: [group], totalPrice: 60 };
    const floorplanBoms = new Map([[1, bom]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    const items = result.current.floorplanTotals[0].items;
    // Should have main item + addon
    expect(items).toHaveLength(2);

    const mainItem = items.find(i => !i.isAddon);
    const addonItem = items.find(i => i.isAddon);

    expect(mainItem).toBeDefined();
    expect(mainItem!.name).toBe('Smart Bulb');
    expect(mainItem!.total).toBe(50);

    expect(addonItem).toBeDefined();
    expect(addonItem!.name).toBe('Mounting Bracket');
    expect(addonItem!.isAddon).toBe(true);
    expect(addonItem!.parentItemName).toBe('Smart Bulb');
    expect(addonItem!.total).toBe(10);
  });

  it('enriches items with categoryName and categorySortOrder', () => {
    const floorplans = [makeFloorplan(1)];
    const entry = makeBomEntry({ id: 1, item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const group = makeBomGroup(entry, [], 1);
    const bom: FloorplanBom = { floorplanId: 1, groups: [group], totalPrice: 50 };
    const floorplanBoms = new Map([[1, bom]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    const items = result.current.floorplanTotals[0].items;
    expect(items[0].categoryName).toBe('Lighting');
    expect(items[0].categorySortOrder).toBe(1);
    expect(items[0].categoryId).toBe(10);
  });

  it('uses "Other" as categoryName for items with unknown category', () => {
    const floorplans = [makeFloorplan(1)];
    // item_id 99 is not in mockItems, so no category will be found
    const entry = makeBomEntry({ id: 1, item_id: 99, item_name: 'Unknown Device', unit_price: 25 });
    const group = makeBomGroup(entry, [], 1);
    const bom: FloorplanBom = { floorplanId: 1, groups: [group], totalPrice: 25 };
    const floorplanBoms = new Map([[1, bom]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    const items = result.current.floorplanTotals[0].items;
    expect(items[0].categoryName).toBe('Other');
    expect(items[0].categorySortOrder).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('combines duplicate items across multiple groups', () => {
    const floorplans = [makeFloorplan(1)];
    const entry1 = makeBomEntry({ id: 1, item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const entry2 = makeBomEntry({ id: 2, item_id: 1, item_name: 'Smart Bulb', unit_price: 50 });
    const group1 = makeBomGroup(entry1, [], 1);
    const group2 = makeBomGroup(entry2, [], 1);
    const bom: FloorplanBom = { floorplanId: 1, groups: [group1, group2], totalPrice: 100 };
    const floorplanBoms = new Map([[1, bom]]);

    const { result } = renderHook(() =>
      useBomCalculations(floorplans, floorplanBoms, mockItems, mockCategories)
    );

    const items = result.current.floorplanTotals[0].items;
    // Both groups have 'Smart Bulb' — should be merged into one entry
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Smart Bulb');
    expect(items[0].quantity).toBe(2);
    expect(items[0].total).toBe(100);
  });
});
