"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AUTH_STORAGE_KEY, parseAuthSession, type AuthSession } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";
import LoginScreen from "./LoginScreen";

type AuthCtx = {
  loggedIn: boolean;
  user: PublicUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx>({
  loggedIn: false,
  user: null,
  login: async () => false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    try {
      const session = parseAuthSession(localStorage.getItem(AUTH_STORAGE_KEY));
      if (session) setUser(session.user);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) return false;
      const publicUser = data.user as PublicUser;
      const payload: AuthSession = { ok: true, user: publicUser, at: Date.now() };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
      document.cookie = `clinic_auth=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      document.cookie = `clinic_user=${encodeURIComponent(publicUser.username)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      setUser(publicUser);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    document.cookie = "clinic_auth=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "clinic_user=; path=/; max-age=0; SameSite=Lax";
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ loggedIn: !!user, user, login, logout }}>
      {user ? children : <LoginScreen />}
    </AuthContext.Provider>
  );
}
