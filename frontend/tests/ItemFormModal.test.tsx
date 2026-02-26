import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemFormModal } from '@/components/items/ItemFormModal';

describe('ItemFormModal', () => {
  const mockCategories = [
    { id: 1, name: 'Lighting', sort_order: 1, is_active: true },
    { id: 2, name: 'Security', sort_order: 2, is_active: true },
  ];

  const mockItem = {
    id: 1,
    category_id: 1,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    description: 'A smart light bulb',
    dimensions: '120x80mm',
    preview_image: null,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create item modal', async () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Dialog renders in a portal, so check document.body
    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Product');
    });
  });

  it('renders edit item modal with pre-filled data', async () => {
    render(
      <ItemFormModal
        item={mockItem}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Product');
    });
  });

  it('shows category dropdown', async () => {
    render(
      <ItemFormModal
        item={null}
        categories={mockCategories}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Category');
    });
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

    // Find the cancel button by its text
    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
