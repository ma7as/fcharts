'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

interface RegisterData {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // On mount, ask the backend who we are. The httpOnly access cookie is
  // sent automatically by the browser via withCredentials.
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const profile = await authApi.getProfile();
      setUser(profile);
    } catch {
      // Not authenticated — that's fine, user stays null.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    await authApi.login(username, password);
    // Cookies are now set. Fetch profile to populate the user state.
    const profile = await authApi.getProfile();
    setUser(profile);
    router.push('/dashboard');
  };

  const register = async (data: RegisterData) => {
    await authApi.register(data);
    const profile = await authApi.getProfile();
    setUser(profile);
    router.push('/dashboard');
  };

  const logout = async () => {
    try {
      await authApi.logout(); // Backend revokes refresh + clears cookies
    } catch {
      // Even if the call fails, we still clear local state.
    }
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}