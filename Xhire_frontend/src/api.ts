import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
});

export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const endInterview = (sessionId: string) => {
  return apiClient.post(`/interviews/${sessionId}/end-interview`);
};

// Automatically attach auth token from localStorage if present
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && !config.headers['Authorization']) {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle expired or invalid session tokens gracefully
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthUrl = url.includes('/auth/token') || url.includes('/candidate-auth/login');
      if (!isAuthUrl) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        delete apiClient.defaults.headers.common['Authorization'];
        if (window.location.pathname.startsWith('/recruiter') || window.location.pathname.startsWith('/hm')) {
          window.location.href = '/login?session_expired=1';
        }
      }
    }
    return Promise.reject(error);
  }
);
