import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getLastTemplateId, setLastTemplateId } from "../db";
import { Card } from "../components/ui";

export default function WorkoutsPage() {
  const navigate = useNavigate();
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const [feedback, setFeedback] = useState("");

  async function removeTemplate(template) {
    if (!window.confirm(`Delete template “${template.name}”?`)) {
      return;
    }
    await db.templates.delete(template.id);
    const lastId = await getLastTemplateId();
    if (lastId === template.id) {
      await setLastTemplateId(null);
    }
    setFeedback("Template removed.");
  }

  return (
    <div className="space-y-5">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-400">Workouts</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Routines</h1>
        <p className="mt-2 text-sm text-slate-400">Pick a saved split or start fresh, then log sets on the next screen.</p>
      </header>

      {feedback ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {feedback}
        </div>
      ) : null}

      <Card title="Start" subtitle="Jump into a live session.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100"
            onClick={() => {
              navigate("/workout", { state: { mode: "empty" } });
            }}
          >
            Empty session
          </button>
        </div>
      </Card>

      <Card title="Saved routines" subtitle="Tap to start. Long-press delete is not available — use delete.">
        <div className="space-y-2">
          {(templates || []).map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-100">{template.name}</p>
                <p className="text-xs text-slate-500">{(template.exerciseSlugs || []).length} exercises</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="button-primary px-3 py-2 text-xs"
                  onClick={async () => {
                    await setLastTemplateId(template.id);
                    navigate("/workout", { state: { templateId: template.id } });
                  }}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200"
                  onClick={() => removeTemplate(template)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {templates && !templates.length ? (
            <p className="text-sm text-slate-500">No templates yet. Save one from an active workout.</p>
          ) : null}
        </div>
      </Card>

      <Card title="Save a new routine" subtitle="Name it — you’ll build exercises in the live workout screen, then save.">
        <p className="text-sm text-slate-500">
          Open <span className="text-slate-300">Workout</span>, add exercises, then use “Save template” there.
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="button-secondary w-full" onClick={() => navigate("/workout", { state: { mode: "empty" } })}>
            Go to live workout
          </button>
        </div>
      </Card>
    </div>
  );
}
