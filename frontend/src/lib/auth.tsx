import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser } from '@/types';
import { api, orgStore, refreshSession, request, tokenStore } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  switchOrganisation: (id: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadProfile = useCallback(async () => {
    const me = await api.get<SessionUser>('/auth/me');
    setUser(me);
    return me;
  }, []);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await refreshSession()) await loadProfile();
      } catch {
        tokenStore.set(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    tokenStore.onExpired(() => {
      tokenStore.set(null);
      setUser(null);
      qc.clear();
    });
    return () => {
      cancelled = true;
    };
  }, [loadProfile, qc]);

  const login = useCallback(async (identifier: string, password: string) => {
    orgStore.set(null);
    const res = await api.post<{ accessToken: string; user: SessionUser }>('/auth/login', { identifier, password });
    tokenStore.set(res.data.accessToken);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await request('/auth/logout', { method: 'POST', csrf: true });
    } catch {
      /* already signed out */
    }
    tokenStore.set(null);
    orgStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const switchOrganisation = useCallback(
    async (id: string | null) => {
      orgStore.set(id && id !== user?.homeOrganisationId ? id : null);
      qc.clear();
      await loadProfile();
    },
    [qc, loadProfile, user?.homeOrganisationId],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      reload: async () => {
        await loadProfile();
      },
      can: (...perms) => Boolean(user && perms.some((p) => user.permissions.includes(p))),
      switchOrganisation,
    }),
    [user, loading, login, logout, loadProfile, switchOrganisation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
