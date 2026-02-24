import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariantFormModal } from '@/components/items/VariantFormModal';

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('VariantFormModal', () => {
  const mockVariant = {
    id: 1,
    item_id: 1,
    style_name: 'White',
    price: 29.99,
    image_path: 'items/bulb-white.jpg',
    sort_order: 1,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create variant modal', () => {
    render(
      <VariantFormModal
        itemId={1}
        variant={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Create Variant')).toBeInTheDocument();
    expect(screen.getByLabelText(/style name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it('renders edit variant modal with data', () => {
    render(
      <VariantFormModal
        itemId={1}
        variant={mockVariant}
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
        variant={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    // Leave fields empty and try to submit
    const submitButton = screen.getByRole('button', { name: /create/i });
    await userEvent.click(submitButton);

    // HTML5 validation should prevent submission
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('closes modal when cancel clicked', async () => {
    render(
      <VariantFormModal
        itemId={1}
        variant={null}
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
