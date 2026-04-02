import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dbReady } from "../db";
import { supabase } from "../supabaseClient";
import { syncNow } from "../sync/sync";

const AppAuthContext = createContext(null);

export function AppAuthProvider({ children }) {
  const [dbStatus, setDbStatus] = useState("Opening database...");
  const [storageStatus, setStorageStatus] = useState("Requesting persistent local storage...");
  const [authStatus, setAuthStatus] = useState(
    supabase ? "Checking sign-in..." : "Cloud sync disabled (missing Supabase env vars).",
  );
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState(supabase ? "Not synced yet." : "Cloud sync disabled.");

  useEffect(() => {
    dbReady
      .then(() => setDbStatus("Database ready."))
      .catch(() => setDbStatus("Database error."));
  }, []);

  useEffect(() => {
    if (!navigator.storage?.persist) {
      return undefined;
    }
    navigator.storage.persist().then((granted) => {
      setStorageStatus(
        granted
          ? "Persistent storage granted. Your workout data is less likely to be purged."
          : "Persistent storage was not granted. Data is still local, but iOS may be more aggressive about cleanup.",
      );
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
        if (error) {
          setAuthStatus("Cloud sync unavailable (auth error).");
          setUser(null);
          return;
        }
        setUser(data.session?.user ?? null);
        setAuthStatus(data.session?.user ? "Signed in." : "Not signed in.");
      })
      .catch(() => {
        if (isMounted) {
          setAuthStatus("Cloud sync unavailable (auth error).");
          setUser(null);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthStatus(session?.user ? "Signed in." : "Not signed in.");
    });

    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    if (!user) {
      setSyncStatus("Sign in to enable sync.");
      return undefined;
    }

    let cancelled = false;

    async function run() {
      try {
        setSyncStatus("Syncing...");
        const result = await syncNow(user);
        if (!cancelled) {
          setSyncStatus(result.ok ? `Synced at ${new Date(result.at).toLocaleTimeString()}.` : "Sync unavailable.");
        }
      } catch {
        if (!cancelled) {
          setSyncStatus("Sync failed (will retry when online).");
        }
      }
    }

    run();

    function handleOnline() {
      run();
    }

    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [user?.id]);

  const value = useMemo(
    () => ({
      supabase,
      user,
      authStatus,
      syncStatus,
      setSyncStatus,
      dbStatus,
      storageStatus,
      syncNow: async () => {
        if (!supabase || !user) {
          return { ok: false };
        }
        return syncNow(user);
      },
    }),
    [user, authStatus, syncStatus, dbStatus, storageStatus],
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function useAppAuth() {
  const ctx = useContext(AppAuthContext);
  if (!ctx) {
    throw new Error("useAppAuth must be used within AppAuthProvider");
  }
  return ctx;
}
