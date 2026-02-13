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
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post('/auth/login', { email, password });
    return response.data.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    }
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data.data;
  },
};
