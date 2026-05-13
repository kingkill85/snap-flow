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
    version_name: 'v1',
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
      expect(document.body.textContent).toContain('Edit Version');
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Update version details below.');

    // In edit mode, should show version_name pre-filled
    const versionNameInput = screen.getByDisplayValue('v1');
    expect(versionNameInput).toBeInTheDocument();

    // In edit mode, customer fields should NOT be present
    expect(document.body.textContent).not.toContain('Customer Name');
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

  it('shows required customer_name field label in create mode', async () => {
    render(
      <ProjectFormModal
        project={null}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Customer Name *');
    }, { timeout: 10000 });

    // Version Name should NOT be present in create mode (auto-set to 'v1')
    expect(document.body.textContent).not.toContain('Version Name');
  });

  it('shows required version_name label in edit mode', async () => {
    render(
      <ProjectFormModal
        project={mockProject}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Version Name *');
    }, { timeout: 10000 });
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
