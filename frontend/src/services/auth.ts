import api from './api';

interface LoginResponse {
  user: {
    id: number;
    email: string;
    full_name: string | null;
    role: 'admin' | 'user';
  };
  token: string;
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

  async updateProfile(data: UpdateProfileDTO, signal?: AbortSignal): Promise<User> {
    const response = await api.put('/auth/me', data, { signal });
    return response.data.data;
  },
};

export type { User, UpdateProfileDTO };
