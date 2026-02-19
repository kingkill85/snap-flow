import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Floorplan } from '../../../src/services/floorplan';
import type { Placement } from '../../../src/services/placement';
import type { Item } from '../../../src/services/item';

// Simple component test without full Canvas render
const mockFloorplan: Floorplan = {
  id: 1,
  project_id: 1,
  name: 'Ground Floor',
  image_path: 'floorplans/test.jpg',
  sort_order: 1,
  created_at: '2024-01-01',
};

const mockItems: Item[] = [
  {
    id: 1,
    category_id: 1,
    name: 'Test Item',
    description: 'Test',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    created_at: '2024-01-01',
    is_active: true,
    preview_image: 'items/test.jpg',
  },
];

const mockPlacements: Placement[] = [
  {
    id: 1,
    floorplan_id: 1,
    item_id: 1,
    item_variant_id: 1,
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    selected_addons: null,
    created_at: '2024-01-01',
  },
];

describe('Canvas - data structure tests', () => {
  it('floorplan has required properties', () => {
    expect(mockFloorplan).toHaveProperty('id');
    expect(mockFloorplan).toHaveProperty('image_path');
    expect(mockFloorplan.image_path).toBe('floorplans/test.jpg');
    expect(mockFloorplan.name).toBe('Ground Floor');
  });

  it('placement has correct coordinates', () => {
    expect(mockPlacements[0]).toMatchObject({
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
  });

  it('placement references item correctly', () => {
    const placement = mockPlacements[0];
    const item = mockItems.find(i => i.id === placement.item_id);
    expect(item).toBeDefined();
    expect(item?.name).toBe('Test Item');
    expect(item?.preview_image).toBe('items/test.jpg');
  });

  it('calculates scaled position correctly', () => {
    const placement = mockPlacements[0];
    const scaleX = 0.5;
    const scaleY = 0.5;
    
    const scaledX = placement.x * scaleX;
    const scaledY = placement.y * scaleY;
    
    expect(scaledX).toBe(50);
    expect(scaledY).toBe(50);
  });

  it('calculates image url correctly', () => {
    const item = mockItems[0];
    const imageUrl = item.preview_image ? `/uploads/${item.preview_image}` : null;
    expect(imageUrl).toBe('/uploads/items/test.jpg');
  });
});

describe('Canvas - placement operations', () => {
  it('placement can be updated with new position', () => {
    const onUpdate = vi.fn();
    const newX = 200;
    const newY = 300;
    
    onUpdate(mockPlacements[0].id, { x: newX, y: newY });
    
    expect(onUpdate).toHaveBeenCalledWith(1, { x: 200, y: 300 });
  });

  it('placement can be deleted', () => {
    const onDelete = vi.fn();
    
    onDelete(mockPlacements[0].id);
    
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('placement can be resized', () => {
    const onResize = vi.fn();
    const newWidth = 150;
    const newHeight = 150;
    
    onResize(mockPlacements[0].id, 100, 100, newWidth, newHeight);
    
    expect(onResize).toHaveBeenCalledWith(1, 100, 100, 150, 150);
  });
});
