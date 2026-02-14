import axios, { AxiosInstance, AxiosError } from 'axios';
import { authService } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
});

// Add request interceptor for auth token and Content-Type
api.interceptors.request.use(
  (config) => {
    const token = authService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Set Content-Type based on data type
    // For FormData, let axios set the multipart boundary automatically
    // For other requests, use application/json
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else {
      config.headers['Content-Type'] = 'application/json';
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Skip token refresh for login endpoint
    if (originalRequest.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }

    // Handle 401 errors - attempt to refresh token
    if (error.response?.status === 401) {
      const refreshToken = authService.getRefreshToken();

      // If no refresh token, redirect to login
      if (!refreshToken) {
        authService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // If already refreshing, wait for the new token
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      // Try to refresh the token
      isRefreshing = true;

      try {
        const newAccessToken = await authService.refreshAccessToken();
        isRefreshing = false;
        onTokenRefreshed(newAccessToken);

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];

        // Refresh failed - clear tokens and redirect to login
        authService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
