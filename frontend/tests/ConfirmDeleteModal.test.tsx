import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

describe('ConfirmDeleteModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConfirm.mockResolvedValue(undefined);
  });

  it('renders with the provided title', async () => {
    render(
      <ConfirmDeleteModal
        title="Delete Category"
        itemName="Lighting"
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Delete Category');
    }, { timeout: 10000 });
  });

  it('renders with the provided warning text', async () => {
    render(
      <ConfirmDeleteModal
        title="Delete Category"
        itemName="Lighting"
        warningText="Note: You cannot delete a category that has items assigned to it."
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Note: You cannot delete a category that has items assigned to it.')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('calls onConfirm when Delete button is clicked', async () => {
    render(
      <ConfirmDeleteModal
        title="Delete Item"
        itemName="Smart Bulb"
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const deleteButton = await screen.findByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    render(
      <ConfirmDeleteModal
        title="Delete Item"
        itemName="Smart Bulb"
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose after successful confirmation', async () => {
    render(
      <ConfirmDeleteModal
        title="Delete Item"
        itemName="Smart Bulb"
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const deleteButton = await screen.findByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('disables the Delete button when disabled prop is true', async () => {
    render(
      <ConfirmDeleteModal
        title="Cannot Delete"
        itemName="Lighting"
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        disabled={true}
        disabledMessage="This category has items assigned to it."
      />
    );

    await waitFor(() => {
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeDisabled();
    }, { timeout: 10000 });
  });
});
