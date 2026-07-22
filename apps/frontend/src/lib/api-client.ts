import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8101';

/**
 * Single axios instance for the whole app.
 *
 * `withCredentials: true` is mandatory — the auth tokens live in
 * httpOnly cookies that the browser only sends with credentialed
 * cross-origin requests. Without this flag, login would succeed but
 * every subsequent request would be anonymous.
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

// ── 401 interceptor ────────────────────────────────────────────────
// When the access token expires (15 min) the backend returns 401.
// We silently call /refresh, retry the original request once, and only
// surface the error if refresh also fails (which means the session is
// dead and the user must re-login).
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as {
      _retry?: boolean;
      url?: string;
    } & typeof error.config;

    // Don't try to refresh if the failing call *was* the refresh itself,
    // or if it's a login/register (anonymous by definition).
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/refresh');
    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      await apiClient.post('/api/v1/auth/refresh');
      return apiClient(originalRequest);
    } catch {
      // Refresh failed — session dead. Let the caller handle it.
      return Promise.reject(error);
    }
  },
);

// ── Auth API ───────────────────────────────────────────────────────
export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await apiClient.post('/api/v1/auth/login', {
      username,
      password,
    });
    return data as { ok: true };
  },

  register: async (payload: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const { data } = await apiClient.post('/api/v1/auth/register', payload);
    return data as { user: any };
  },

  logout: async () => {
    const { data } = await apiClient.post('/api/v1/auth/logout');
    return data as { ok: true };
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