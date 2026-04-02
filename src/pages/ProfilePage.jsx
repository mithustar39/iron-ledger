import { useAppAuth } from "../context/AppAuthContext";
import { missingSupabaseEnvVars } from "../supabaseClient";
import { Card } from "../components/ui";

export default function ProfilePage() {
  const { supabase, user, authStatus, syncStatus, dbStatus, storageStatus, setSyncStatus, syncNow } = useAppAuth();

  return (
    <div className="space-y-5">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-violet-400">Profile</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Account & sync</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in for cloud backup, manual sync, and photo restore.</p>
      </header>

      <Card title="Cloud" subtitle="Google sign-in via Supabase.">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Status: <span className="text-slate-100">{user?.email ?? authStatus}</span>
          </p>
          <p className="text-xs text-slate-500">{syncStatus}</p>
          <div className="flex flex-wrap gap-2">
            {supabase && user ? (
              <button
                type="button"
                className="button-secondary"
                onClick={async () => {
                  try {
                    setSyncStatus("Syncing...");
                    const result = await syncNow();
                    setSyncStatus(
                      result.ok ? `Synced at ${new Date(result.at).toLocaleTimeString()}.` : "Sync unavailable.",
                    );
                  } catch {
                    setSyncStatus("Sync failed (will retry when online).");
                  }
                }}
              >
                Sync now
              </button>
            ) : null}
            {supabase ? (
              user ? (
                <button type="button" className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold" onClick={() => supabase.auth.signOut()}>
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() =>
                    supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: window.location.origin },
                    })
                  }
                >
                  Sign in with Google
                </button>
              )
            ) : (
              <div className="space-y-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100/95">
                <p className="font-semibold text-amber-50">Supabase env not loaded in the app</p>
                {missingSupabaseEnvVars.length ? (
                  <p>
                    Missing: <span className="font-mono text-amber-200">{missingSupabaseEnvVars.join(", ")}</span>
                  </p>
                ) : null}
                <ul className="list-inside list-disc space-y-1 text-amber-100/80">
                  <li>
                    Create a file named <span className="font-mono">.env</span> in the same folder as{" "}
                    <span className="font-mono">package.json</span> (not inside <span className="font-mono">src</span>).
                  </li>
                  <li>
                    Use exactly: <span className="font-mono">VITE_SUPABASE_URL=</span> and{" "}
                    <span className="font-mono">VITE_SUPABASE_ANON_KEY=</span> (must start with{" "}
                    <span className="font-mono">VITE_</span>).
                  </li>
                  <li>Stop and restart <span className="font-mono">npm run dev</span> after saving .env.</li>
                  <li>
                    For <span className="font-mono">npm run preview</span>, env is baked at <span className="font-mono">npm run build</span> time — add .env, then build again.
                  </li>
                  <li>On Windows, ensure the file is not named <span className="font-mono">.env.txt</span> (show file extensions).</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="On-device" subtitle="Local database + storage hints.">
        <p className="text-sm text-slate-400">
          {dbStatus} <span className="text-slate-600">·</span> {storageStatus}
        </p>
      </Card>
    </div>
  );
}
