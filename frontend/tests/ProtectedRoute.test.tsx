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
    getCurrentUser: vi.fn(),
  },
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('redirects to login when not authenticated', () => {
    localStorageMock.getItem.mockReturnValue(null);

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

  it('shows loading spinner when validating token', () => {
    localStorageMock.getItem.mockReturnValue('valid-token');

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
    localStorageMock.getItem.mockReturnValue('user-token');
    
    const { authService } = await import('../src/services/auth');
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
    localStorageMock.getItem.mockReturnValue('user-token');
    
    const { authService } = await import('../src/services/auth');
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
    localStorageMock.getItem.mockReturnValue('admin-token');
    
    const { authService } = await import('../src/services/auth');
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
