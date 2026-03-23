import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryFormModal } from '@/components/categories/CategoryFormModal';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

describe('CategoryFormModal', () => {
  const mockCategory = {
    id: 1,
    name: 'Lighting',
    sort_order: 1,
    is_active: true,
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders create modal when category is null', async () => {
    render(
      <CategoryFormModal
        category={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Category');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Fill in the details to create a new category.');
  });

  it('renders edit modal with pre-filled data when category is provided', async () => {
    render(
      <CategoryFormModal
        category={mockCategory}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Category');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Update category details below.');

    const nameInput = screen.getByDisplayValue('Lighting');
    expect(nameInput).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    render(
      <CategoryFormModal
        category={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows Update button in edit mode', async () => {
    render(
      <CategoryFormModal
        category={mockCategory}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('shows Create button in create mode', async () => {
    render(
      <CategoryFormModal
        category={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('shows active toggle only in edit mode', async () => {
    const { rerender } = render(
      <CategoryFormModal
        category={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Category');
    }, { timeout: 10000 });

    // In create mode, Active toggle should not be visible
    expect(screen.queryByText('Active')).not.toBeInTheDocument();

    rerender(
      <CategoryFormModal
        category={mockCategory}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });
});
