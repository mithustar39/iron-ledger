import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getLastTemplateId } from "../db";
import { computeSessionStreak, pickNextWorkout, sessionsThisWeek } from "../lib/appStats";
import { formatDateLabel, formatDateTime } from "../utils";
import { Card } from "../components/ui";

export default function DashboardPage() {
  const navigate = useNavigate();
  const sessions = useLiveQuery(() => db.sessions.orderBy("date").reverse().toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const [lastTemplateId, setLastTemplateIdState] = useState(null);

  useEffect(() => {
    getLastTemplateId().then(setLastTemplateIdState);
  }, []);

  const streak = sessions ? computeSessionStreak(sessions) : 0;
  const weekCount = sessions ? sessionsThisWeek(sessions) : 0;
  const next = templates ? pickNextWorkout(templates, lastTemplateId) : { templateId: null, label: "…", sub: "" };

  const latest = sessions?.[0];
  const previous = sessions?.[1];
  const weightDelta =
    latest?.bodyWeight != null && previous?.bodyWeight != null
      ? (Number(latest.bodyWeight) - Number(previous.bodyWeight)).toFixed(1)
      : null;

  return (
    <div className="space-y-5">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Dashboard</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Iron Ledger</h1>
        <p className="mt-2 text-sm text-slate-400">Your streak, momentum, and what to hit next.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Streak</p>
          <p className="mt-2 font-display text-4xl font-bold">{streak}</p>
          <p className="mt-1 text-xs text-emerald-200/80">days in a row</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">This week</p>
          <p className="mt-2 font-display text-4xl font-bold">{weekCount}</p>
          <p className="mt-1 text-xs text-slate-400">sessions logged</p>
        </div>
      </div>

      <Card title="Next workout" subtitle={next.sub}>
        <p className="font-display text-2xl text-slate-100">{next.label}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {next.templateId ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => navigate("/workout", { state: { templateId: next.templateId } })}
            >
              Start
            </button>
          ) : null}
          <Link to="/workouts" className="button-secondary inline-flex items-center justify-center">
            Manage routines
          </Link>
          <button
            type="button"
            className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100"
            onClick={() => navigate("/workout", { state: { mode: "empty" } })}
          >
            Empty session
          </button>
        </div>
      </Card>

      <Card title="Growth snapshot" subtitle="Last session vs the one before (when weight is logged).">
        {weightDelta != null ? (
          <p className="text-lg text-slate-200">
            Weight change:{" "}
            <span className="font-semibold text-emerald-300">
              {Number(weightDelta) > 0 ? "+" : ""}
              {weightDelta} lb
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Log body weight on two sessions to see a delta.</p>
        )}
      </Card>

      <Card title="Recent activity" subtitle="Latest sessions">
        <div className="space-y-2">
          {(sessions || []).slice(0, 5).map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-slate-100">{formatDateTime(session.date)}</p>
                <p className="text-xs text-slate-500">
                  {session.bodyWeight ? `${session.bodyWeight} lb` : "No weight"} ·{" "}
                  {formatDateLabel(session.date)}
                </p>
              </div>
            </div>
          ))}
          {!sessions?.length ? <p className="text-sm text-slate-500">No sessions yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}
