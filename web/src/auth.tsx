import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, hasToken, setToken, type Me } from './api';

interface Auth {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (b: { email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!hasToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: Auth = {
    me,
    loading,
    refresh,
    login: async (email, password) => {
      setToken((await api.login(email, password)).token);
      await refresh();
    },
    register: async (b) => {
      setToken((await api.register(b)).token);
      await refresh();
    },
    logout: () => {
      setToken(null);
      setMe(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}

export const isStaff = (me: Me | null) => me?.role === 'operator' || me?.role === 'admin';
