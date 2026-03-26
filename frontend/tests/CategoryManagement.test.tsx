import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import CategoryManagement from '@/pages/catalog/CategoryManagement';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', tenantId: 1, tenantName: 'Admin' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('@/services/category', () => ({
  categoryService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
}));

import { categoryService } from '@/services/category';

describe('CategoryManagement', () => {
  const mockCategories = [
    { id: 1, name: 'Lighting', sort_order: 1, is_active: true },
    { id: 2, name: 'Security', sort_order: 2, is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (categoryService.getAll as any).mockResolvedValue(mockCategories);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', async () => {
    render(
      <BrowserRouter>
        <CategoryManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Category Management')).toBeInTheDocument();
    }, { timeout: 10000 });

    expect(screen.getByText('Organize product categories and arrange their display order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (categoryService.getAll as any).mockImplementation(() => new Promise(() => {}));

    render(
      <BrowserRouter>
        <CategoryManagement />
      </BrowserRouter>
    );

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('fetches and displays categories', async () => {
    render(
      <BrowserRouter>
        <CategoryManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Lighting')).toBeInTheDocument();
    });

    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('opens create modal when add category clicked', async () => {
    render(
      <BrowserRouter>
        <CategoryManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Category Management')).toBeInTheDocument();
    }, { timeout: 10000 });

    const addButton = screen.getByRole('button', { name: /add category/i });
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
    }, { timeout: 10000 });

    expect(document.body.textContent).toContain('Create Category');
  });

  it('shows error state when fetching categories fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (categoryService.getAll as any).mockRejectedValue({ response: { data: { error: 'Failed to fetch categories' } } });

    render(
      <BrowserRouter>
        <CategoryManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch categories/i)).toBeInTheDocument();
    });
  });
});
