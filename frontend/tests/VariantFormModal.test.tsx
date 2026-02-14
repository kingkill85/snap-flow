import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariantFormModal } from '../src/components/items/VariantFormModal';
import { itemService } from '../src/services/item';

// Mock the item service
vi.mock('../src/services/item', () => ({
  itemService: {
    getImageUrl: vi.fn((path) => path ? `/uploads/${path}` : null),
    getVariantAddons: vi.fn(),
    addVariantAddon: vi.fn(),
    removeVariantAddon: vi.fn(),
  },
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('VariantFormModal', () => {
  const mockItem = {
    id: 1,
    category_id: 1,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    description: 'A smart light bulb',
    dimensions: '120x80mm',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockVariant = {
    id: 1,
    item_id: 1,
    style_name: 'White',
    price: 29.99,
    image_path: 'items/bulb-white.jpg',
    sort_order: 1,
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockAvailableVariants = [
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

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create variant modal', () => {
    render(
      <VariantFormModal
        itemId={1}
        item={mockItem}
        variant={null}
        availableVariants={mockAvailableVariants}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Add Variant')).toBeInTheDocument();
    expect(screen.getByLabelText(/style name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it('renders edit variant modal with data', () => {
    render(
      <VariantFormModal
        itemId={1}
        item={mockItem}
        variant={mockVariant}
        availableVariants={mockAvailableVariants}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Edit Variant')).toBeInTheDocument();
    expect(screen.getByDisplayValue('White')).toBeInTheDocument();
    expect(screen.getByDisplayValue('29.99')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(
      <VariantFormModal
        itemId={1}
        item={mockItem}
        variant={null}
        availableVariants={mockAvailableVariants}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByRole('button', { name: /create/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/style name and price are required/i)).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('closes modal when cancel clicked', async () => {
    render(
      <VariantFormModal
        itemId={1}
        item={mockItem}
        variant={null}
        availableVariants={mockAvailableVariants}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
