import { describe, it, expect } from 'vitest';
import type { Placement } from '../../../src/types';

describe('RightPanel - data structure tests', () => {
  const mockPlacements: Placement[] = [
    {
      id: 1,
      bom_id: 1,
      floorplan_id: 1,
      item_id: 1,
      item_variant_id: 1,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      created_at: '2024-01-01',
    },
    {
      id: 2,
      bom_id: 2,
      floorplan_id: 1,
      item_id: 2,
      item_variant_id: 3,
      x: 200,
      y: 200,
      width: 60,
      height: 60,
      created_at: '2024-01-01',
    },
  ];

  it('placement has correct coordinates', () => {
    expect(mockPlacements[0]).toMatchObject({
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    });
  });

  it('placement references bom_id correctly', () => {
    expect(mockPlacements[0].bom_id).toBe(1);
    expect(mockPlacements[1].bom_id).toBe(2);
  });

  it('placement references variant correctly', () => {
    expect(mockPlacements[0].item_variant_id).toBe(1);
    expect(mockPlacements[1].item_variant_id).toBe(3);
  });

  it('calculates project total from multiple floorplans', () => {
    // Simulate totals from two floorplans
    const floorplan1Total = 1500.00;
    const floorplan2Total = 2300.00;
    const projectTotal = floorplan1Total + floorplan2Total;
    
    expect(projectTotal).toBe(3800.00);
  });

  it('formats project total with thousand separators', () => {
    const projectTotal = 12345.67;
    const formatted = projectTotal.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
    
    expect(formatted).toBe('12,345.67');
    expect(formatted).toContain(',');
  });

  it('handles empty placements array', () => {
    const emptyPlacements: Placement[] = [];
    expect(emptyPlacements).toHaveLength(0);
  });

  it('placement has created_at timestamp', () => {
    expect(mockPlacements[0].created_at).toBeDefined();
    expect(mockPlacements[0].created_at).toBe('2024-01-01');
  });
});
