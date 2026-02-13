import api from './api';

interface LoginResponse {
  user: {
    id: number;
    email: string;
    role: 'admin' | 'user';
  };
  token: string;
}

interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  created_at?: string;
}

export const authService = {
  async login(email: string, password: string, signal?: AbortSignal): Promise<LoginResponse> {
    const response = await api.post('/auth/login', { email, password }, { signal });
    return response.data.data;
  },

  async logout(signal?: AbortSignal): Promise<void> {
    try {
      await api.post('/auth/logout', {}, { signal });
    } catch {
      // Ignore errors on logout
    }
  },

  async getCurrentUser(signal?: AbortSignal): Promise<User> {
    const response = await api.get('/auth/me', { signal });
    return response.data.data;
  },
};
