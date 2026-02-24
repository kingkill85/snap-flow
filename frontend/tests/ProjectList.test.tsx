import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ProjectList from '@/pages/projects/ProjectList';
import { projectService } from '@/services/project';

vi.mock('@/services/project', () => ({
  projectService: {
    getAll: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('ProjectList', () => {
  const mockProjects = [
    {
      id: 1,
      customer_name: 'John Doe',
      customer_address: '123 Main St',
      customer_email: 'john@example.com',
      customer_phone: '555-0123',
      status: 'active',
      total_value: 15000,
      created_at: '2024-01-15T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    (projectService.getAll as any).mockResolvedValue(mockProjects);

    render(
      <BrowserRouter>
        <ProjectList />
      </BrowserRouter>
    );
  });
});
