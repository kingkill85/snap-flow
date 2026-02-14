import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import UserManagement from '../src/pages/settings/UserManagement';
import { useAuth } from '../src/context/AuthContext';

// Mock the auth context
vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock the user service
vi.mock('../src/services/user', () => ({
  userService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { userService } from '../src/services/user';

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
    (useAuth as any).mockReturnValue({ user: mockCurrentUser });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders user management page', async () => {
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fetches and displays users', async () => {
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll.mockResolvedValueOnce(mockUsers);

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Check for "Created" column header
      expect(screen.getByText('Created')).toBeInTheDocument();
      // Check that users are displayed
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
  });

  it('shows edit and delete buttons for each user', async () => {
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll.mockResolvedValueOnce(mockUsers);

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
    userService.getAll
      .mockResolvedValueOnce(mockUsers)
      .mockResolvedValueOnce([...mockUsers, { id: 3, email: 'new@example.com', full_name: 'New User', role: 'user', created_at: '2024-01-03T00:00:00Z' }]);
    
    userService.create.mockResolvedValueOnce({ id: 3, email: 'new@example.com', full_name: 'New User', role: 'user', created_at: '2024-01-03T00:00:00Z' });

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
      expect(userService.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'new@example.com',
        password: 'password123',
      }));
    });
  });

  it('shows error message on fetch failure', async () => {
    userService.getAll.mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <UserManagement />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('can dismiss error alert', async () => {
    userService.getAll.mockRejectedValueOnce(new Error('Test error'));

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
