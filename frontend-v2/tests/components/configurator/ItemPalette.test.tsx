import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ItemPalette } from '@/components/configurator/ItemPalette';
import { itemService } from '@/services/item';
import { categoryService } from '@/services/category';
import type { Item } from '@/services/item';
import type { Category } from '@/services/category';

// Mock the services
vi.mock('@/services/item', () => ({
  itemService: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/services/category', () => ({
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
  { id: 1, name: 'Gateways', sort_order: 1, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'Sensors', sort_order: 2, is_active: true, created_at: '2024-01-01T00:00:00Z' },
];

const mockItems: Item[] = [
  {
    id: 1,
    category_id: 1,
    name: 'Zigbee Gateway',
    description: 'Gateway device',
    base_model_number: 'GW-001',
    dimensions: '100x100',
    created_at: '2024-01-01T00:00:00Z',
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
    created_at: '2024-01-01T00:00:00Z',
    is_active: true,
    preview_image: 'items/sensor.jpg',
  },
];

describe('ItemPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (categoryService.getAll as any).mockResolvedValue(mockCategories);
    (itemService.getAll as any).mockResolvedValue({ items: mockItems, total: 2, totalPages: 1 });
  });

  it('renders loading state initially', () => {
    render(<ItemPalette />);
    // Loader2 renders as an SVG with animate-spin class
    const loader = document.querySelector('.animate-spin');
    expect(loader).toBeInTheDocument();
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

  it('renders item with image and details', async () => {
    render(<ItemPalette />);

    await waitFor(() => {
      const itemName = screen.getByText('Zigbee Gateway');
      expect(itemName).toBeInTheDocument();
      
      const itemImage = screen.getByAltText('Zigbee Gateway');
      expect(itemImage).toBeInTheDocument();
      expect(itemImage).toHaveAttribute('src', '/uploads/items/gateway.jpg');
    });
  });

  it('shows "No Image" placeholder when item has no preview_image', async () => {
    const itemsWithoutImage = [
      { ...mockItems[0], preview_image: null },
    ];
    (itemService.getAll as any).mockResolvedValue({ items: itemsWithoutImage, total: 1, totalPages: 1 });

    render(<ItemPalette />);

    await waitFor(() => {
      expect(screen.getByText('No Image')).toBeInTheDocument();
    });
  });
});
