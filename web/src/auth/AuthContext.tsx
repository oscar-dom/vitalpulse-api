import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import type { Session, User } from "../api/auth";
import { ApiError } from "../api/client";

const STORAGE_KEY = "vitalpulse.session";

export interface AuthState {
  user: User | null;
  token: string | null;
  // True while a saved session is being checked against the API.
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

// The session lives in sessionStorage: it survives a reload but not closing the tab,
// a sensible default for a shared clinical workstation.
const readSaved = (): Session | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
};

const save = (session: Session | null): void => {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session just lasts until the page is reloaded.
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(readSaved);
  const [checking, setChecking] = useState(() => readSaved() !== null);

  const start = useCallback((next: Session | null) => {
    save(next);
    setSession(next);
  }, []);

  // A saved token may have expired, or the user may have been removed: ask the API
  // once on load. The role also comes fresh from it.
  useEffect(() => {
    const saved = readSaved();
    if (!saved) return;
    authApi
      .currentUser(saved.token)
      .then((user) => start({ token: saved.token, user }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) start(null);
      })
      .finally(() => setChecking(false));
  }, [start]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      checking,
      login: async (email, password) => start(await authApi.login(email, password)),
      register: async (name, email, password) =>
        start(await authApi.register(name, email, password)),
      logout: () => start(null),
    }),
    [session, checking, start],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
