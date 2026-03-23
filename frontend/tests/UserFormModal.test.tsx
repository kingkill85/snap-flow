import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFormModal } from '@/components/users/UserFormModal';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

describe('UserFormModal', () => {
  const mockUser = {
    id: 2,
    email: 'jane@example.com',
    full_name: 'Jane Smith',
    role: 'user' as const,
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders create modal when user is null', async () => {
    render(
      <UserFormModal
        user={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Create User');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Fill in the details to create a new user.');
  });

  it('renders edit modal with pre-filled data when user is provided', async () => {
    render(
      <UserFormModal
        user={mockUser}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit User');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Update user details below.');

    const nameInput = screen.getByDisplayValue('Jane Smith');
    expect(nameInput).toBeInTheDocument();

    const emailInput = screen.getByDisplayValue('jane@example.com');
    expect(emailInput).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    render(
      <UserFormModal
        user={null}
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
      <UserFormModal
        user={mockUser}
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
      <UserFormModal
        user={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('shows password hint text in edit mode', async () => {
    render(
      <UserFormModal
        user={mockUser}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('New Password (leave blank to keep current)');
    }, { timeout: 10000 });
  });
});
