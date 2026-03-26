import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Header from '@/components/layout/Header';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock the auth service
vi.mock('@/services/auth', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    getCurrentUser: vi.fn(),
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SnapFlow brand', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });
    
    expect(screen.getByText('SnapFlow')).toBeInTheDocument();
  });

  it('renders navigation links', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders login button when not authenticated', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });
    
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('renders user dropdown when authenticated', async () => {
    const mockUser = { id: 1, email: 'test@example.com', full_name: 'Test User', role: 'user' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    // Wait for auth to load
    await waitFor(() => {
      expect(screen.queryByText('Login')).not.toBeInTheDocument();
    });

    // Should show user avatar with first letter
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('displays user full name when available', async () => {
    const mockUser = { id: 1, email: 'test@example.com', full_name: 'John Doe', role: 'user' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('displays email prefix when full_name is not available', async () => {
    const mockUser = { id: 1, email: 'jane@example.com', full_name: null, role: 'user' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('jane')).toBeInTheDocument();
    });
  });

  it('displays user role in dropdown', async () => {
    const mockUser = { id: 1, email: 'admin@example.com', full_name: 'Admin User', role: 'tenant_admin' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('admin-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Tenant Admin')).toBeInTheDocument();
    });
  });

  it('shows admin menu items for admin users', async () => {
    const mockUser = { id: 1, email: 'admin@example.com', full_name: 'Admin User', role: 'tenant_admin' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('admin-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // Check that Catalog and Settings menu items are visible in top nav
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not show admin menu items for regular users', async () => {
    const mockUser = { id: 1, email: 'user@example.com', full_name: 'Regular User', role: 'user' };
    localStorageMock.getItem.mockReturnValue('user-token');
    
    const { authService } = await import('@/services/auth');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    // Catalog is visible to all authenticated users (read-only for non-admins)
    expect(screen.queryByText('Catalog')).toBeInTheDocument();
    // Settings should not be present for regular users
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('calls logout when sign out is clicked', async () => {
    const mockUser = { id: 1, email: 'test@example.com', full_name: 'Test User', role: 'user' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);
    authService.logout.mockResolvedValue(undefined);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click on user dropdown (avatar area)
    const userDropdown = screen.getByText('Test User');
    await userEvent.click(userDropdown);

    // Click sign out
    await waitFor(() => {
      const signOutButton = screen.getByText('Sign out');
      expect(signOutButton).toBeInTheDocument();
    });

    const signOutButton = screen.getByText('Sign out');
    await userEvent.click(signOutButton);

    // Verify logout was called
    expect(authService.logout).toHaveBeenCalled();
  });

  it('has working navigation links', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Header />
        </AuthProvider>
      </BrowserRouter>
    );

    const homeLink = screen.getByText('Home');
    expect(homeLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('has working login link', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Header />
        </AuthProvider>
      </BrowserRouter>
    );

    const loginButton = screen.getByText('Login');
    expect(loginButton.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders profile link in dropdown for authenticated users', async () => {
    const mockUser = { id: 1, email: 'test@example.com', full_name: 'Test User', role: 'user' };
    const { authService } = await import('@/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    await act(async () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Click on user dropdown
    const userDropdown = screen.getByText('Test User');
    await userEvent.click(userDropdown);

    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    const profileLink = screen.getByText('Profile');
    expect(profileLink.closest('a')).toHaveAttribute('href', '/profile');
  });
});
