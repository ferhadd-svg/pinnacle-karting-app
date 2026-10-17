import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, setToken, type Me } from './api';

interface Auth {
  me: Me | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (b: { email: string; password: string; displayName: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe((await loadToken()) ? await api.me() : null);
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{
        me,
        ready,
        refresh,
        signIn: async (email, password) => {
          await setToken((await api.login(email, password)).token);
          await refresh();
        },
        register: async (b) => {
          await setToken((await api.register(b)).token);
          await refresh();
        },
        signOut: async () => {
          await setToken(null);
          setMe(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
