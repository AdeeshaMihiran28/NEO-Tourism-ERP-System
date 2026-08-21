"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  clearToken,
  getStoredToken,
  storeToken,
} from "@/lib/api/client";
import type { AuthUser, LoginResponse } from "@/types/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleExpiredSession = () => setUser(null);
    window.addEventListener("neo-auth-expired", handleExpiredSession);

    Promise.resolve(getStoredToken())
      .then((token) =>
        token ? apiFetch<AuthUser>("/auth/me", { token }) : null,
      )
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    return () =>
      window.removeEventListener("neo-auth-expired", handleExpiredSession);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const response = await apiFetch<LoginResponse>("/auth/login", {
          method: "POST",
          token: null,
          body: JSON.stringify({ email, password }),
        });
        storeToken(response.accessToken);
        setUser(response.user);
      },
      logout: () => {
        clearToken();
        setUser(null);
      },
      hasPermission: (permission) =>
        user?.permissions.includes(permission) ?? false,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
