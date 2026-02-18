import axios, { AxiosInstance, AxiosError } from 'axios';
import { authService } from './auth';

// Use relative URL for API when served from backend (production/Docker)
// Use full URL for development when running frontend separately
const API_URL = import.meta.env.VITE_API_URL || '/api';

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

// Log all requests for debugging
console.log('[API] Initialized with baseURL:', API_URL);

// Add request interceptor for auth token and Content-Type
api.interceptors.request.use(
  (config) => {
    console.log('[API] Request:', config.method?.toUpperCase(), config.url, 'baseURL:', config.baseURL);
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
  (response) => {
    console.log('[API] Response:', response.status, response.config.url);
    return response;
  },
  async (error: AxiosError) => {
    console.log('[API] Error:', error.response?.status, error.config?.url, error.message);
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Skip token refresh for auth endpoints (login and refresh)
    if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // Handle network errors (no response) - don't redirect, just reject
    // This happens when backend is restarting or network is down
    if (!error.response) {
      console.log('[Auth] Network error, backend may be restarting');
      return Promise.reject(error);
    }

    // Handle 401 errors - attempt to refresh token
    if (error.response?.status === 401) {
      const refreshToken = authService.getRefreshToken();

      // If no refresh token, redirect to login
      if (!refreshToken) {
        console.log('[Auth] No refresh token available, redirecting to login');
        authService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // If already refreshing, wait for the new token
      if (isRefreshing) {
        console.log('[Auth] Token refresh already in progress, waiting...');
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      // Try to refresh the token
      console.log('[Auth] Access token expired, attempting refresh...');
      isRefreshing = true;

      try {
        const newAccessToken = await authService.refreshAccessToken();
        console.log('[Auth] Token refreshed successfully');
        isRefreshing = false;
        onTokenRefreshed(newAccessToken);

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError: any) {
        console.error('[Auth] Token refresh failed:', refreshError);
        isRefreshing = false;
        refreshSubscribers = [];

        // Only redirect on 401 from refresh endpoint
        // Don't redirect on network errors
        if (refreshError.response?.status === 401) {
          console.log('[Auth] Refresh token invalid, redirecting to login');
          authService.clearTokens();
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
