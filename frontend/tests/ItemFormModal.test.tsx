import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemFormModal } from '../src/components/items/ItemFormModal';

describe('ItemFormModal', () => {
  const mockCategories = [
    { id: 1, name: 'Lighting', sort_order: 1 },
    { id: 2, name: 'Security', sort_order: 2 },
  ];

  const mockItem = {
    id: 1,
    category_id: 1,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    description: 'A smart light bulb',
    dimensions: '120x80mm',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create item modal', () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Add Item')).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('renders edit item modal with pre-filled data', () => {
    render(
      <ItemFormModal
        item={mockItem}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Edit Item')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Smart Bulb')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SB-100')).toBeInTheDocument();
  });

  it('shows category dropdown in create mode', () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const categorySelect = screen.getByLabelText(/category/i);
    expect(categorySelect).toBeInTheDocument();
  });

  it('does not show category dropdown in edit mode', () => {
    render(
      <ItemFormModal
        item={mockItem}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.queryByLabelText(/category/i)).not.toBeInTheDocument();
  });

  it('validates required fields in create mode', async () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByRole('button', { name: /create item/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/category is required/i)).toBeInTheDocument();
  });

  it('closes modal when cancel clicked', async () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
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
