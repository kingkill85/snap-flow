import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

// Create mock functions that will be shared
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockLogoutAll = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockGetAccessToken = vi.fn();
const mockGetRefreshToken = vi.fn();
const mockSetTokens = vi.fn();
const mockClearTokens = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockUpdateProfile = vi.fn();

// Mock the auth service
vi.mock('../src/services/auth', () => ({
  authService: {
    get login() { return mockLogin; },
    get logout() { return mockLogout; },
    get logoutAll() { return mockLogoutAll; },
    get getCurrentUser() { return mockGetCurrentUser; },
    get getAccessToken() { return mockGetAccessToken; },
    get getRefreshToken() { return mockGetRefreshToken; },
    get setTokens() { return mockSetTokens; },
    get clearTokens() { return mockClearTokens; },
    get refreshAccessToken() { return mockRefreshAccessToken; },
    get updateProfile() { return mockUpdateProfile; },
  },
}));

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
    mockGetAccessToken.mockReturnValue(null);
    mockGetRefreshToken.mockReturnValue(null);
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
    const mockAccessToken = 'mock-access-token-123';
    const mockRefreshToken = 'mock-refresh-token-123';
    
    mockLogin.mockResolvedValueOnce({
      user: mockUser,
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
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

    // Verify login was called
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('logout clears user state', async () => {
    const mockUser = { id: 1, email: 'test@example.com', role: 'user' };
    const mockAccessToken = 'mock-access-token-123';
    const mockRefreshToken = 'mock-refresh-token-123';
    
    mockLogin.mockResolvedValueOnce({
      user: mockUser,
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
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

    expect(mockLogout).toHaveBeenCalled();
  });

  it('loads user from token on mount', async () => {
    const mockUser = { id: 1, email: 'loaded@example.com', role: 'user' };
    mockGetAccessToken.mockReturnValue('existing-access-token');
    mockGetRefreshToken.mockReturnValue('existing-refresh-token');
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);

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

  it('clears token on 401 unauthorized user fetch', async () => {
    mockGetAccessToken.mockReturnValue('invalid-token');
    mockGetRefreshToken.mockReturnValue('invalid-refresh-token');
    const error = new Error('Invalid token') as any;
    error.response = { status: 401 };
    mockGetCurrentUser.mockRejectedValueOnce(error);

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

    expect(mockClearTokens).toHaveBeenCalled();
  });
});
