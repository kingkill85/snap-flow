import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { authService } from '../src/services/auth';

// Mock the auth service
vi.mock('../src/services/auth', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
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

// Test component that uses auth
function TestComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'Loading' : 'Not Loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'Yes' : 'No'}</div>
      <div data-testid="user">{user?.email || 'No User'}</div>
      <button onClick={() => login('test@example.com', 'password')}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('initializes with no user when no token exists', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('No');
    expect(screen.getByTestId('user')).toHaveTextContent('No User');
  });

  it('login updates user state', async () => {
    const mockUser = { id: 1, email: 'test@example.com', role: 'user' };
    const mockToken = 'mock-token-123';
    
    authService.login.mockResolvedValueOnce({
      user: mockUser,
      token: mockToken,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>
    );

    const loginButton = screen.getByText('Login');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Yes');
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith('token', mockToken);
  });

  it('logout clears user state', async () => {
    const mockUser = { id: 1, email: 'test@example.com', role: 'user' };
    const mockToken = 'mock-token-123';
    
    authService.login.mockResolvedValueOnce({
      user: mockUser,
      token: mockToken,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>
    );

    // Login first
    const loginButton = screen.getByText('Login');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Yes');
    });

    // Then logout
    const logoutButton = screen.getByText('Logout');
    await userEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('No');
      expect(screen.getByTestId('user')).toHaveTextContent('No User');
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
  });

  it('loads user from token on mount', async () => {
    const mockUser = { id: 1, email: 'loaded@example.com', role: 'user' };
    localStorageMock.getItem.mockReturnValue('existing-token');
    authService.getCurrentUser.mockResolvedValueOnce(mockUser);

    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>
    );

    // Should show loading initially when token exists
    expect(screen.getByTestId('loading')).toHaveTextContent('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Yes');
      expect(screen.getByTestId('user')).toHaveTextContent('loaded@example.com');
    });
  });

  it('clears token on invalid user fetch', async () => {
    localStorageMock.getItem.mockReturnValue('invalid-token');
    authService.getCurrentUser.mockRejectedValueOnce(new Error('Invalid token'));

    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('No');
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
  });
});
