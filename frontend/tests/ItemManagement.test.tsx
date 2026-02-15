import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ItemManagement from '../src/pages/catalog/ItemManagement';
import { categoryService } from '../src/services/category';
import { itemService } from '../src/services/item';

// Mock the services
vi.mock('../src/services/category', () => ({
  categoryService: {
    getAll: vi.fn(),
  },
}));

vi.mock('../src/services/item', () => ({
  itemService: {
    getAll: vi.fn(),
    getVariants: vi.fn(),
    getImageUrl: vi.fn((path) => path ? `/uploads/${path}` : null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
    deleteVariant: vi.fn(),
  },
}));

describe('ItemManagement', () => {
  const mockCategories = [
    { id: 1, name: 'Lighting', sort_order: 1 },
    { id: 2, name: 'Security', sort_order: 2 },
  ];

  const mockItems = [
    {
      id: 1,
      category_id: 1,
      name: 'Smart Bulb',
      base_model_number: 'SB-100',
      description: 'A smart light bulb',
      dimensions: '120x80mm',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      category_id: 2,
      name: 'Security Camera',
      base_model_number: 'SC-100',
      description: 'HD security camera',
      dimensions: null,
      created_at: '2024-01-02T00:00:00Z',
    },
  ];

  const mockVariants = [
    {
      id: 1,
      item_id: 1,
      style_name: 'White',
      price: 29.99,
      image_path: 'items/bulb-white.jpg',
      sort_order: 1,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      item_id: 1,
      style_name: 'Black',
      price: 29.99,
      image_path: null,
      sort_order: 2,
      created_at: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (categoryService.getAll as any).mockResolvedValue(mockCategories);
    (itemService.getAll as any).mockResolvedValue({
      items: mockItems,
      totalPages: 1,
    });
    (itemService.getVariants as any).mockResolvedValue(mockVariants);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders item management page', async () => {
    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Item Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Manage products and their details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('fetches and displays items', async () => {
    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Smart Bulb')).toBeInTheDocument();
    });

    expect(screen.getByText('Security Camera')).toBeInTheDocument();
    expect(screen.getByText('SB-100')).toBeInTheDocument();
    expect(screen.getByText('SC-100')).toBeInTheDocument();
  });

  it('expands item to show variants when clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    // Wait for items to load
    await waitFor(() => {
      expect(screen.getByText('Smart Bulb')).toBeInTheDocument();
    });

    // Click expand button on first item
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    await user.click(expandButtons[0]);

    // Verify that getVariants was called after expanding
    await waitFor(() => {
      expect(itemService.getVariants).toHaveBeenCalled();
    });
  });

  it('opens create item modal when add item clicked', async () => {
    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('Item Management')).toBeInTheDocument();
    });

    // Find and click the Add Item button
    const addButton = screen.getByRole('button', { name: /add item/i });
    await userEvent.click(addButton);

    // Modal should open - check for any modal content
    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
    });
  });

  it('shows empty state when no items', async () => {
    (itemService.getAll as any).mockResolvedValue({
      items: [],
      totalPages: 1,
    });

    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no items found/i)).toBeInTheDocument();
    });
  });

  it('handles error when fetching items fails', async () => {
    (itemService.getAll as any).mockRejectedValue(new Error('Failed to fetch items'));

    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch items/i)).toBeInTheDocument();
    });
  });

  it('shows add variant button in expanded view', async () => {
    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <ItemManagement />
      </BrowserRouter>
    );

    // Wait for items to load
    await waitFor(() => {
      expect(screen.getByText('Smart Bulb')).toBeInTheDocument();
    });

    // Click expand button on first item
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    await user.click(expandButtons[0]);

    // Wait for variants to load and check for "Add Variant" button
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const hasAddVariant = buttons.some(btn => btn.textContent?.toLowerCase().includes('add variant'));
      expect(hasAddVariant).toBe(true);
    });
  });
});
