import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService } from '../services/auth';

interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
}

interface UpdateProfileData {
  full_name?: string;
  email?: string;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  logoutAll: () => void;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const checkAuth = async () => {
      const accessToken = authService.getAccessToken();
      const refreshToken = authService.getRefreshToken();

      if (!accessToken && !refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        // If we have a refresh token but no access token, try to refresh
        if (!accessToken && refreshToken) {
          await authService.refreshAccessToken(controller.signal);
        }

        const userData = await authService.getCurrentUser(controller.signal);
        if (!controller.signal.aborted) {
          setUser(userData);
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          // Only clear tokens on 401 errors (auth failures)
          // Don't clear on network errors (server restarting) or other errors
          if (error.response?.status === 401) {
            console.log('[AuthContext] Authentication failed (401), clearing tokens');
            authService.clearTokens();
            setUser(null);
          } else {
            console.log('[AuthContext] Auth check failed but not due to invalid token:', error.message || 'Unknown error');
            // Keep existing tokens for retry on network errors
            setUser(null);
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      controller.abort();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { user: userData } = await authService.login(email, password);
      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const logoutAll = () => {
    authService.logoutAll();
    setUser(null);
  };

  const updateProfile = async (data: UpdateProfileData) => {
    const controller = new AbortController();
    try {
      const updatedUser = await authService.updateProfile(data, controller.signal);
      setUser(updatedUser);
    } finally {
      controller.abort();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        logoutAll,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export type { User, UpdateProfileData };
