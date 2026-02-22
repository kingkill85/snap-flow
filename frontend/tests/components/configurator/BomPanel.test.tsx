import { describe, it, expect } from 'vitest';
import type { FloorplanBom, BomGroup, BomEntry } from '../../../src/services/bom';

describe('BomPanel - data structure tests', () => {
  const mockMainEntry: BomEntry = {
    id: 1,
    project_id: 1,
    floorplan_id: 1,
    item_id: 1,
    variant_id: 1,
    parent_bom_id: null,
    item_name: 'Smart Panel',
    style_name: 'White',
    model_number: 'SP-001-WH',
    unit_price: 500.00,
    picture_path: 'items/panel.jpg',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  const mockChildEntry: BomEntry = {
    id: 2,
    project_id: 1,
    floorplan_id: 1,
    item_id: 2,
    variant_id: 2,
    parent_bom_id: 1,
    item_name: 'Wall Mount',
    style_name: 'Standard',
    model_number: 'WM-001',
    unit_price: 50.00,
    picture_path: 'items/mount.jpg',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  it('BOM entry has all required properties', () => {
    expect(mockMainEntry).toHaveProperty('id');
    expect(mockMainEntry).toHaveProperty('item_name');
    expect(mockMainEntry).toHaveProperty('unit_price');
    expect(mockMainEntry.item_name).toBe('Smart Panel');
    expect(mockMainEntry.unit_price).toBe(500.00);
  });

  it('child entry references parent correctly', () => {
    expect(mockChildEntry.parent_bom_id).toBe(mockMainEntry.id);
    expect(mockChildEntry.unit_price).toBe(50.00);
  });

  it('calculates group total correctly', () => {
    const group: BomGroup = {
      mainEntry: mockMainEntry,
      children: [mockChildEntry],
      quantity: 2,
      totalPrice: 1100.00, // (500 + 50) * 2
    };

    // Verify calculation
    const addonTotal = group.children.reduce((sum, child) => sum + child.unit_price, 0);
    const calculatedTotal = (group.mainEntry.unit_price + addonTotal) * group.quantity;
    
    expect(calculatedTotal).toBe(1100.00);
    expect(group.totalPrice).toBe(1100.00);
  });

  it('calculates floorplan total from groups', () => {
    const mockBom: FloorplanBom = {
      floorplanId: 1,
      groups: [
        {
          mainEntry: mockMainEntry,
          children: [mockChildEntry],
          quantity: 2,
          totalPrice: 1100.00,
        },
        {
          mainEntry: {
            ...mockMainEntry,
            id: 3,
            item_name: 'Light Switch',
            unit_price: 100.00,
          },
          children: [],
          quantity: 5,
          totalPrice: 500.00,
        },
      ],
      totalPrice: 1600.00, // 1100 + 500
    };

    const calculatedTotal = mockBom.groups.reduce((sum, group) => sum + group.totalPrice, 0);
    expect(calculatedTotal).toBe(1600.00);
    expect(mockBom.totalPrice).toBe(1600.00);
  });

  it('formats currency with thousand separators', () => {
    const price = 1234567.89;
    const formatted = price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    
    expect(formatted).toBe('1,234,567.89');
    expect(formatted).toContain(',');
  });

  it('handles empty BOM correctly', () => {
    const emptyBom: FloorplanBom = {
      floorplanId: 1,
      groups: [],
      totalPrice: 0,
    };

    expect(emptyBom.groups).toHaveLength(0);
    expect(emptyBom.totalPrice).toBe(0);
  });

  it('entry includes style name when present', () => {
    expect(mockMainEntry.style_name).toBe('White');
    expect(mockChildEntry.style_name).toBe('Standard');
  });
});
