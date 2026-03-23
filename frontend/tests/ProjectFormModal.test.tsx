import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

describe('ProjectFormModal', () => {
  const mockProject = {
    id: 1,
    name: 'Home Automation',
    status: 'active' as const,
    customer_name: 'John Doe',
    customer_email: 'john@example.com',
    customer_phone: '+1 234 567 8900',
    customer_address: '123 Main St',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders create modal when project is null', async () => {
    render(
      <ProjectFormModal
        project={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Project');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Fill in the details to create a new project.');
  });

  it('renders edit modal with pre-filled data when project is provided', async () => {
    render(
      <ProjectFormModal
        project={mockProject}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Project');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Update project details below.');

    const nameInput = screen.getByDisplayValue('Home Automation');
    expect(nameInput).toBeInTheDocument();

    const customerNameInput = screen.getByDisplayValue('John Doe');
    expect(customerNameInput).toBeInTheDocument();

    const emailInput = screen.getByDisplayValue('john@example.com');
    expect(emailInput).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    render(
      <ProjectFormModal
        project={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows required field labels for name and customer_name', async () => {
    render(
      <ProjectFormModal
        project={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Project Name *');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Customer Name *');
  });

  it('renders Update button in edit mode', async () => {
    render(
      <ProjectFormModal
        project={mockProject}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('renders Create button in create mode', async () => {
    render(
      <ProjectFormModal
        project={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
    }, { timeout: 10000 });
  });
});
