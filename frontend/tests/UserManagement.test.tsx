import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import UserManagement from '../src/pages/admin/UserManagement';
import { useAuth } from '../src/context/AuthContext';

// Mock the auth context
vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UserManagement', () => {
  const mockCurrentUser = {
    id: 1,
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
  };

  const mockUsers = [
    {
      id: 1,
      email: 'admin@example.com',
      full_name: 'Admin User',
      role: 'admin',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      email: 'user@example.com',
      full_name: 'Regular User',
      role: 'user',
      created_at: '2024-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-token');
    (useAuth as any).mockReturnValue({ user: mockCurrentUser });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders user management page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Manage system users and permissions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fetches and displays users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('displays role badges', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      const adminBadge = screen.getByText('admin');
      const userBadge = screen.getByText('user');
      expect(adminBadge).toBeInTheDocument();
      expect(userBadge).toBeInTheDocument();
    });
  });

  it('displays creation dates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Dates should be formatted
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });
  });

  it('shows edit and delete buttons for each user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  it('hides delete button for current user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // Should have delete button for other user but not for self
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons.length).toBe(1); // Only for user@example.com, not admin
  });

  it('shows create user modal when add user clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add user/i });
    await userEvent.click(addButton);

    expect(screen.getByText('Create New User')).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('creates new user successfully', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockUsers }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 3, email: 'new@example.com', full_name: 'New User', role: 'user' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [...mockUsers, { id: 3, email: 'new@example.com', full_name: 'New User', role: 'user', created_at: '2024-01-03T00:00:00Z' }] }),
      });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add user/i });
    await userEvent.click(addButton);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /create user/i });

    await userEvent.type(emailInput, 'new@example.com');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('new@example.com'),
        })
      );
    });
  });

  it('shows error message on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('includes auth token in requests', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockUsers }),
    });

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });
  });

  it('can dismiss error alert', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Test error'));

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(dismissButton);

    expect(screen.queryByText('Test error')).not.toBeInTheDocument();
  });
});
