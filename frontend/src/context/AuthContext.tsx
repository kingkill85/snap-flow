import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService, type User as AuthUser } from '../services/auth';

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
  updateProfile: (data: UpdateProfileData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await authService.getCurrentUser(controller.signal);
        if (!controller.signal.aborted) {
          setUser(userData);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          localStorage.removeItem('token');
          setUser(null);
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
      const { user: userData, token } = await authService.login(email, password);
      localStorage.setItem('token', token);
      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    authService.logout();
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
