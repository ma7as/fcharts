import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8101';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// ── JWT interceptor ────────────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── Auth API ───────────────────────────────────────────────────────
export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await apiClient.post('/api/v1/auth/login', { username, password });
    return data as { access_token: string; user: any };
  },

  register: async (payload: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const { data } = await apiClient.post('/api/v1/auth/register', payload);
    return data as { access_token: string; user: any };
  },

  getProfile: async () => {
    const { data } = await apiClient.get('/api/v1/auth/profile');
    return data;
  },
};

// ── Market API ─────────────────────────────────────────────────────
export const marketApi = {
  getOhlc: async (params: {
    symbol: string;
    interval: string;
    limit?: number;
  }) => {
    const { data } = await apiClient.get('/api/v1/market/ohlc', { params });
    return data;
  },

  getIndicators: async (params: {
    symbol: string;
    interval: string;
    ma?: string;
  }) => {
    const { data } = await apiClient.get('/api/v1/market/indicators', { params });
    return data;
  },

  getCcl: async (cedear: string) => {
    const { data } = await apiClient.get(`/api/v1/market/ccl/${cedear}`);
    return data;
  },
};

// ── Symbols API ────────────────────────────────────────────────────
export const symbolsApi = {
  getAll: async () => {
    const { data } = await apiClient.get('/api/v1/symbols');
    return data;
  },

  getOne: async (symbol: string) => {
    const { data } = await apiClient.get(`/api/v1/symbols/${symbol}`);
    return data;
  },
};

// ── Portfolios API (requires auth) ────────────────────────────────
export const portfoliosApi = {
  getAll: async () => {
    const { data } = await apiClient.get('/api/v1/portfolios');
    return data;
  },

  getOne: async (id: string) => {
    const { data } = await apiClient.get(`/api/v1/portfolios/${id}`);
    return data;
  },

  create: async (payload: { name: string; description?: string; currency?: string }) => {
    const { data } = await apiClient.post('/api/v1/portfolios', payload);
    return data;
  },

  update: async (id: string, payload: { name?: string; description?: string }) => {
    const { data } = await apiClient.patch(`/api/v1/portfolios/${id}`, payload);
    return data;
  },

  remove: async (id: string) => {
    const { data } = await apiClient.delete(`/api/v1/portfolios/${id}`);
    return data;
  },

  getPositions: async (id: string) => {
    const { data } = await apiClient.get(`/api/v1/portfolios/${id}/positions`);
    return data;
  },

  getTransactions: async (id: string) => {
    const { data } = await apiClient.get(`/api/v1/portfolios/${id}/transactions`);
    return data;
  },

  createTransaction: async (
    id: string,
    payload: { symbolId: string; type: string; quantity: number; price: number; fees?: number },
  ) => {
    const { data } = await apiClient.post(`/api/v1/portfolios/${id}/transactions`, payload);
    return data;
  },

  getPerformance: async (id: string) => {
    const { data } = await apiClient.get(`/api/v1/portfolios/${id}/performance`);
    return data;
  },
};
