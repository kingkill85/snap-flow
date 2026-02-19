import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemPalette } from '../../../src/components/configurator/ItemPalette';
import { itemService } from '../../../src/services/item';
import { categoryService } from '../../../src/services/category';
import type { Item } from '../../../src/services/item';
import type { Category } from '../../../src/services/category';

// Mock the services
vi.mock('../../../src/services/item', () => ({
  itemService: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../src/services/category', () => ({
  categoryService: {
    getAll: vi.fn(),
  },
}));

// Mock DndKit
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockCategories: Category[] = [
  { id: 1, name: 'Gateways', sort_order: 1, created_at: '2024-01-01' },
  { id: 2, name: 'Sensors', sort_order: 2, created_at: '2024-01-01' },
];

const mockItems: Item[] = [
  {
    id: 1,
    category_id: 1,
    name: 'Zigbee Gateway',
    description: 'Gateway device',
    base_model_number: 'GW-001',
    dimensions: '100x100',
    created_at: '2024-01-01',
    is_active: true,
    preview_image: 'items/gateway.jpg',
  },
  {
    id: 2,
    category_id: 2,
    name: 'Motion Sensor',
    description: 'Sensor device',
    base_model_number: 'SEN-001',
    dimensions: '50x50',
    created_at: '2024-01-01',
    is_active: true,
    preview_image: 'items/sensor.jpg',
  },
];

describe('ItemPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (categoryService.getAll as any).mockResolvedValue(mockCategories);
    (itemService.getAll as any).mockResolvedValue({ items: mockItems, total: 2 });
  });

  it('renders loading state initially', () => {
    render(<ItemPalette />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders categories and items after loading', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      expect(screen.getByText('Gateways')).toBeInTheDocument();
      expect(screen.getByText('Sensors')).toBeInTheDocument();
    });
  });

  it('fetches items with pagination limit of 1000', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      expect(itemService.getAll).toHaveBeenCalledWith(
        { include_inactive: false },
        { page: 1, limit: 1000 }
      );
    });
  });

  it('expands first category by default', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      // First category should be expanded
      expect(screen.getByText('Zigbee Gateway')).toBeInTheDocument();
      // Second category should be collapsed
      expect(screen.queryByText('Motion Sensor')).not.toBeInTheDocument();
    });
  });

  it('toggles category expansion on click', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      expect(screen.getByText('Gateways')).toBeInTheDocument();
    });

    // Click on second category to expand it
    const sensorsCategory = screen.getByText('Sensors');
    fireEvent.click(sensorsCategory);

    await waitFor(() => {
      expect(screen.getByText('Motion Sensor')).toBeInTheDocument();
    });
  });

  it('renders item with image and details', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      const itemName = screen.getByText('Zigbee Gateway');
      expect(itemName).toBeInTheDocument();
      
      const modelNumber = screen.getByText('GW-001');
      expect(modelNumber).toBeInTheDocument();
      
      const itemImage = screen.getByAltText('Zigbee Gateway');
      expect(itemImage).toBeInTheDocument();
      expect(itemImage).toHaveAttribute('src', '/uploads/items/gateway.jpg');
    });
  });

  it('shows "No img" placeholder when item has no preview_image', async () => {
    const itemsWithoutImage = [
      { ...mockItems[0], preview_image: null },
    ];
    (itemService.getAll as any).mockResolvedValue({ items: itemsWithoutImage, total: 1 });

    render(<ItemPalette />);

    await waitFor(() => {
      expect(screen.getByText('No img')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    (categoryService.getAll as any).mockRejectedValue(new Error('Network error'));

    render(<ItemPalette />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load items')).toBeInTheDocument();
    });
  });

  it('makes items draggable', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      const draggableItem = screen.getByText('Zigbee Gateway').closest('[role="button"]') ||
                           screen.getByText('Zigbee Gateway').parentElement;
      expect(draggableItem).toHaveClass('cursor-grab');
    });
  });
});
