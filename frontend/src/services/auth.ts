import api from './api';

interface LoginResponse {
  user: {
    id: number;
    email: string;
    full_name: string | null;
    role: 'admin' | 'user';
  };
  accessToken: string;
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
}

interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at?: string;
}

interface UpdateProfileDTO {
  full_name?: string;
  email?: string;
  password?: string;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export const authService = {
  // Token management
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  // API calls
  async login(email: string, password: string, signal?: AbortSignal): Promise<LoginResponse> {
    const response = await api.post('/auth/login', { email, password }, { signal });
    const { user, accessToken, refreshToken } = response.data.data;
    
    // Store tokens
    this.setTokens(accessToken, refreshToken);
    
    return { user, accessToken, refreshToken };
  },

  async logout(signal?: AbortSignal): Promise<void> {
    try {
      await api.post('/auth/logout', {}, { signal });
    } catch {
      // Ignore errors on logout
    } finally {
      this.clearTokens();
    }
  },

  async logoutAll(signal?: AbortSignal): Promise<void> {
    try {
      await api.post('/auth/logout-all', {}, { signal });
    } catch {
      // Ignore errors on logout
    } finally {
      this.clearTokens();
    }
  },

  async refreshAccessToken(signal?: AbortSignal): Promise<string> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post('/auth/refresh', { refreshToken }, { signal });
    const { accessToken } = response.data.data;
    
    // Update stored access token
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    
    return accessToken;
  },

  async getCurrentUser(signal?: AbortSignal): Promise<User> {
    const response = await api.get('/auth/me', { signal });
    return response.data.data;
  },

  async updateProfile(data: UpdateProfileDTO, signal?: AbortSignal): Promise<User> {
    const response = await api.put('/auth/me', data, { signal });
    return response.data.data;
  },
};

export type { User, UpdateProfileDTO, LoginResponse, RefreshResponse };
