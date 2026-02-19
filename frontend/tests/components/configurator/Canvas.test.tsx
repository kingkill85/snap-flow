import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Canvas } from '../../../src/components/configurator/Canvas';
import type { Floorplan } from '../../../src/services/floorplan';
import type { Placement } from '../../../src/services/placement';
import type { Item } from '../../../src/services/item';

// Mock DndKit
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));

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

describe('Canvas', () => {
  it('renders floorplan image', () => {
    render(
      <Canvas
        floorplan={mockFloorplan}
        placements={[]}
        items={mockItems}
        onPlacementDelete={vi.fn()}
        onPlacementUpdate={vi.fn()}
      />
    );

    const img = screen.getByAltText('Ground Floor');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/uploads/floorplans/test.jpg');
  });

  it('shows "No floorplan image" when image_path is missing', () => {
    const floorplanWithoutImage = { ...mockFloorplan, image_path: '' };
    render(
      <Canvas
        floorplan={floorplanWithoutImage}
        placements={[]}
        items={mockItems}
        onPlacementDelete={vi.fn()}
        onPlacementUpdate={vi.fn()}
      />
    );

    expect(screen.getByText('No floorplan image')).toBeInTheDocument();
    expect(screen.getByText('Upload a floorplan to start configuring')).toBeInTheDocument();
  });

  it('renders placements with item images', () => {
    render(
      <Canvas
        floorplan={mockFloorplan}
        placements={mockPlacements}
        items={mockItems}
        onPlacementDelete={vi.fn()}
        onPlacementUpdate={vi.fn()}
      />
    );

    // Should render placement with item image
    const placementImg = screen.getByAltText('Test Item');
    expect(placementImg).toBeInTheDocument();
  });

  it('calls onPlacementDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    render(
      <Canvas
        floorplan={mockFloorplan}
        placements={mockPlacements}
        items={mockItems}
        onPlacementDelete={onDelete}
        onPlacementUpdate={vi.fn()}
      />
    );

    // Click on placement to select it first
    const placement = screen.getByTitle('Test Item');
    fireEvent.click(placement);

    // Then click delete button
    const deleteButton = screen.getByTitle('Delete placement');
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('shows controls hint', () => {
    render(
      <Canvas
        floorplan={mockFloorplan}
        placements={[]}
        items={mockItems}
        onPlacementDelete={vi.fn()}
        onPlacementUpdate={vi.fn()}
      />
    );

    expect(screen.getByText(/Click item to select/)).toBeInTheDocument();
    expect(screen.getByText(/Drag corners to resize/)).toBeInTheDocument();
  });
});
