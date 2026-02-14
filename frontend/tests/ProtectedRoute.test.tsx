import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../src/components/auth/ProtectedRoute';
import { AuthProvider } from '../src/context/AuthContext';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock the auth service
vi.mock('../src/services/auth', () => ({
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

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to login when not authenticated', async () => {
    const { authService } = await import('../src/services/auth');
    authService.getAccessToken.mockReturnValue(null);
    authService.getRefreshToken.mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows loading spinner when validating token', async () => {
    const { authService } = await import('../src/services/auth');
    authService.getAccessToken.mockReturnValue('valid-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Should show loading spinner
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects non-admin to home when admin required', async () => {
    const mockUser = { id: 1, email: 'user@example.com', role: 'user' };
    
    const { authService } = await import('../src/services/auth');
    authService.getAccessToken.mockReturnValue('user-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div>Home Page</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <div>Admin Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for auth check to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should redirect to home
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders content for authenticated user', async () => {
    const mockUser = { id: 1, email: 'user@example.com', role: 'user' };
    
    const { authService } = await import('../src/services/auth');
    authService.getAccessToken.mockReturnValue('user-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for auth check to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should show protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders content for admin when admin required', async () => {
    const mockUser = { id: 1, email: 'admin@example.com', role: 'admin' };
    
    const { authService } = await import('../src/services/auth');
    authService.getAccessToken.mockReturnValue('admin-token');
    authService.getRefreshToken.mockReturnValue('refresh-token');
    authService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div>Home Page</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <div>Admin Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for auth check to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should show admin content
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
