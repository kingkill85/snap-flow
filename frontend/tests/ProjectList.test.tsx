import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ProjectList from '@/pages/projects/ProjectList';
import { projectGroupService } from '@/services/projectGroup';

vi.mock('@/services/projectGroup', () => ({
  projectGroupService: {
    getAll: vi.fn(),
  },
}));

// Mock auth hooks to avoid context issues
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, email: 'test@example.com', role: 'tenant_admin', tenantId: 1 },
    isAuthenticated: true,
  })),
}));

vi.mock('@/services/tenants', () => ({
  tenantService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

describe('ProjectList', () => {
  const mockGroups = [
    {
      id: 1,
      customer_name: 'John Doe',
      customer_address: '123 Main St',
      customer_email: 'john@example.com',
      customer_phone: '555-0123',
      tenant_id: 1,
      created_at: '2024-01-15T10:00:00Z',
      status: 'active',
      versions: [
        {
          id: 1,
          version_name: 'v1.0',
          created_at: '2024-01-15T10:00:00Z',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (projectGroupService.getAll as any).mockResolvedValue(mockGroups);

    const { container } = render(
      <BrowserRouter>
        <ProjectList />
      </BrowserRouter>
    );

    // Wait for async operations to complete
    await waitFor(() => {
      expect(projectGroupService.getAll).toHaveBeenCalled();
    });

    expect(container.querySelector('h1')?.textContent).toContain('Projects');
  });
});
