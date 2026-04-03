import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ItemPalette } from '@/components/configurator/ItemPalette';
import { itemService } from '@/services/item';
import { categoryService } from '@/services/category';
import type { Item } from '@/services/item';
import type { Category } from '@/services/category';

// Mock the services
vi.mock('@/services/item', () => ({
  itemService: {
    getAll: vi.fn(),
    getImageUrl: vi.fn((path: string) => `/uploads/${path}`),
  },
}));

vi.mock('@/services/category', () => ({
  categoryService: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/services/item-type', () => ({
  itemTypeService: {
    getAll: vi.fn().mockResolvedValue([]),
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
    type_id: 1,
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
    type_id: 1,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (categoryService.getAll as any).mockResolvedValue(mockCategories);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemService.getAll as any).mockResolvedValue({ items: mockItems, total: 2, totalPages: 1 });
  });

  it('renders loading state initially', () => {
    render(<ItemPalette />);
    // Loader2 renders as an SVG with animate-spin class
    const loader = document.querySelector('.animate-spin');
    expect(loader).toBeInTheDocument();
  });

  it('renders categories and items after loading', async () => {
    await act(async () => {
      render(<ItemPalette />);
    });

    await waitFor(() => {
      expect(screen.getByText('Gateways')).toBeInTheDocument();
      expect(screen.getByText('Sensors')).toBeInTheDocument();
    });
  });

  it('fetches items with pagination limit of 1000', async () => {
    await act(async () => {
      render(<ItemPalette />);
    });

    await waitFor(() => {
      expect(itemService.getAll).toHaveBeenCalledWith(
        { include_inactive: false },
        { page: 1, limit: 1000 }
      );
    });
  });

  it('renders item with image and details', async () => {
    await act(async () => {
      render(<ItemPalette />);
    });

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (itemService.getAll as any).mockResolvedValue({ items: itemsWithoutImage, total: 1, totalPages: 1 });

    await act(async () => {
      render(<ItemPalette />);
    });

    await waitFor(() => {
      expect(screen.getByText('No Image')).toBeInTheDocument();
    });
  });

  describe('Layer Visibility Toggles', () => {
    it('renders category toggle buttons when onToggleCategory is provided', async () => {
      const onToggleCategory = vi.fn();
      await act(async () => {
        render(<ItemPalette onToggleCategory={onToggleCategory} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Gateways')).toBeInTheDocument();
      });

      // Should have toggle buttons (eye icons)
      const toggleButtons = document.querySelectorAll('button[title="Hide layer"], button[title="Show layer"]');
      expect(toggleButtons.length).toBe(2); // One for each category
    });

    it('displays item count badges next to category names', async () => {
      const categoryCounts = new Map([
        [1, 3],
        [2, 5],
      ]);

      await act(async () => {
        render(<ItemPalette categoryCounts={categoryCounts} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Gateways')).toBeInTheDocument();
      });

      // Check for count badges
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('shows hidden state for categories not in visibleCategories', async () => {
      const onToggleCategory = vi.fn();
      const visibleCategories = new Set([1]); // Only Gateways visible

      await act(async () => {
        render(
          <ItemPalette
            onToggleCategory={onToggleCategory}
            visibleCategories={visibleCategories}
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Gateways')).toBeInTheDocument();
        expect(screen.getByText('Sensors')).toBeInTheDocument();
      });

      // Should have one "Hide layer" button (for visible category)
      // and one "Show layer" button (for hidden category)
      const hideButton = screen.getByTitle('Hide layer');
      const showButton = screen.getByTitle('Show layer');

      expect(hideButton).toBeInTheDocument();
      expect(showButton).toBeInTheDocument();
    });

    it('calls onToggleCategory when toggle button is clicked', async () => {
      const onToggleCategory = vi.fn();
      await act(async () => {
        render(<ItemPalette onToggleCategory={onToggleCategory} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Gateways')).toBeInTheDocument();
      });

      const toggleButtons = screen.getAllByTitle('Hide layer');
      fireEvent.click(toggleButtons[0]);

      expect(onToggleCategory).toHaveBeenCalledWith(1);
    });

    it('shows all categories as visible by default', async () => {
      const onToggleCategory = vi.fn();
      await act(async () => {
        render(<ItemPalette onToggleCategory={onToggleCategory} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Gateways')).toBeInTheDocument();
      });

      // Both categories should show "Hide layer" (visible by default)
      const hideButtons = screen.getAllByTitle('Hide layer');
      expect(hideButtons.length).toBe(2);
    });
  });
});
