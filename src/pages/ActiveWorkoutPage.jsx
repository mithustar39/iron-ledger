import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  enqueueOutbox,
  findExerciseByInput,
  getPreviousSet,
  setLastTemplateId,
} from "../db";
import { useAppAuth } from "../context/AppAuthContext";
import { clampTimer, generateSessionName } from "../utils";
import { Card, LabeledField, formatClock } from "../components/ui";
import {
  createDraftExercise,
  createDraftSet,
  hydrateGhostSets,
  loadTemplateDraft,
} from "../workout/draftUtils";

export default function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppAuth();

  const exercises = useLiveQuery(() => db.exercises.orderBy("name").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.orderBy("date").reverse().toArray(), []);

  const [exerciseInput, setExerciseInput] = useState("");
  const [bodyWeight, setBodyWeight] = useState("");
  const [height, setHeight] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDuration, setTimerDuration] = useState(90);
  const [sessionDraft, setSessionDraft] = useState([]);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [feedback, setFeedback] = useState("");
  const timerRef = useRef(null);
  const initKeyRef = useRef(null);

  const latestMetrics = sessions?.[0];

  useEffect(() => {
    const key = `${location.key}-${location.state?.templateId ?? ""}-${location.state?.mode ?? ""}`;
    if (initKeyRef.current === key) {
      return;
    }
    initKeyRef.current = key;

    async function init() {
      const state = location.state;
      if (state?.templateId) {
        const template = await db.templates.get(state.templateId);
        if (template) {
          await setLastTemplateId(template.id);
          const draft = await loadTemplateDraft(template);
          setSessionDraft(draft);
          setFeedback(`Loaded ${template.name}.`);
        }
        return;
      }
      if (state?.mode === "empty") {
        setSessionDraft([]);
        setFeedback("Empty session — add exercises below.");
      }
    }

    init();
  }, [location.key, location.state]);

  useEffect(() => {
    if (!timerSeconds) {
      return undefined;
    }

    timerRef.current = window.setInterval(() => {
      setTimerSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerRef.current);
  }, [timerSeconds > 0]);

  const suggestions = useMemo(() => {
    if (!exerciseInput.trim() || !exercises) {
      return [];
    }

    const search = exerciseInput.trim().toLowerCase();
    return exercises.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(search) || exercise.slug.toLowerCase().includes(search),
    );
  }, [exerciseInput, exercises]);

  async function handleAddExercise(name = exerciseInput) {
    const exercise = await findExerciseByInput(name);
    if (!exercise) {
      return;
    }

    const draft = createDraftExercise(exercise);
    draft.sets = await hydrateGhostSets(exercise.id, draft.sets);

    setSessionDraft((current) => [...current, draft]);
    setExerciseInput("");
  }

  function updateExerciseSet(exerciseKey, setId, field, value) {
    setSessionDraft((current) =>
      current.map((exercise) =>
        exercise.key === exerciseKey
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
            }
          : exercise,
      ),
    );
  }

  async function addSet(exerciseKey) {
    const exercise = sessionDraft.find((item) => item.key === exerciseKey);
    if (!exercise) {
      return;
    }

    const nextIndex = exercise.sets.length;
    const previous = await getPreviousSet(exercise.exerciseId, nextIndex);

    setSessionDraft((current) =>
      current.map((item) =>
        item.key === exerciseKey
          ? {
              ...item,
              sets: [...item.sets, { ...createDraftSet(nextIndex), previous }],
            }
          : item,
      ),
    );
  }

  async function removeSet(exerciseKey, setId) {
    const exercise = sessionDraft.find((item) => item.key === exerciseKey);
    if (!exercise || exercise.sets.length === 1) {
      return;
    }

    const reindexed = exercise.sets
      .filter((set) => set.id !== setId)
      .map((set, index) => ({ ...set, setIndex: index }));

    const hydrated = await hydrateGhostSets(exercise.exerciseId, reindexed);

    setSessionDraft((current) =>
      current.map((item) =>
        item.key === exerciseKey
          ? {
              ...item,
              sets: hydrated,
            }
          : item,
      ),
    );
  }

  function removeExercise(exerciseKey) {
    setSessionDraft((current) => current.filter((exercise) => exercise.key !== exerciseKey));
  }

  function handleCompletedToggle(exerciseKey, setId, checked) {
    updateExerciseSet(exerciseKey, setId, "isCompleted", checked);
    if (checked) {
      setTimerSeconds(timerDuration);
    }
  }

  async function saveSession() {
    if (!sessionDraft.length) {
      setFeedback("Add at least one exercise before saving the session.");
      return;
    }

    const sessionId = crypto.randomUUID();
    await db.sessions.put({
      id: sessionId,
      date: new Date().toISOString(),
      bodyWeight: bodyWeight ? Number(bodyWeight) : null,
      height: height ? Number(height) : null,
      userId: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const rows = sessionDraft.flatMap((exercise) =>
      exercise.sets.map((set, index) => ({
        id: crypto.randomUUID(),
        sessionId: sessionId,
        exerciseId: exercise.exerciseId,
        weight: set.weight ? Number(set.weight) : null,
        reps: set.reps ? Number(set.reps) : null,
        setIndex: index,
        isCompleted: Boolean(set.isCompleted),
        userId: null,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      })),
    );

    if (rows.length) {
      await db.sets.bulkAdd(rows);
    }

    await enqueueOutbox({ entity: "sessions", entityId: sessionId, op: "upsert", userId: user?.id ?? null });
    if (rows.length) {
      await Promise.all(
        rows.map((row) => enqueueOutbox({ entity: "sets", entityId: row.id, op: "upsert", userId: user?.id ?? null })),
      );
    }

    setFeedback("Session saved.");
    setSessionDraft([]);
    setBodyWeight("");
    setHeight("");
    setTimerSeconds(0);
    navigate("/", { replace: true });
  }

  async function saveTemplate() {
    if (!saveTemplateName.trim() || !sessionDraft.length) {
      setFeedback("Give the template a name and add at least one exercise.");
      return;
    }

    const templateId = crypto.randomUUID();
    await db.templates.put({
      id: templateId,
      name: saveTemplateName.trim(),
      exerciseSlugs: sessionDraft.map((exercise) => exercise.slug),
      userId: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await enqueueOutbox({ entity: "templates", entityId: templateId, op: "upsert", userId: user?.id ?? null });

    setSaveTemplateName("");
    setFeedback("Template saved for future sessions.");
  }

  async function loadTemplate(template) {
    const loaded = await loadTemplateDraft(template);
    setSessionDraft(loaded);
    await setLastTemplateId(template.id);
    setFeedback(`Loaded ${template.name}.`);
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-24 pt-6">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Live workout</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Session</h1>
            <p className="mt-2 text-sm text-slate-400">{new Date().toLocaleDateString()}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-300">Rest</p>
            <p className="font-display text-2xl">{formatClock(timerSeconds)}</p>
          </div>
        </div>
        <Link to="/workouts" className="mt-4 inline-block text-sm text-emerald-400/90 hover:text-emerald-300">
          ← Back to routines
        </Link>
      </header>

      {feedback ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {feedback}
        </div>
      ) : null}

      <Card title="Session setup" subtitle="Optional body metrics for this log.">
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="Body weight">
            <input
              className="input"
              inputMode="decimal"
              placeholder={latestMetrics?.bodyWeight ? `${latestMetrics.bodyWeight}` : "e.g. 182.4"}
              value={bodyWeight}
              onChange={(event) => setBodyWeight(event.target.value)}
            />
          </LabeledField>
          <LabeledField label="Height">
            <input
              className="input"
              inputMode="decimal"
              placeholder={latestMetrics?.height ? `${latestMetrics.height}` : "e.g. 71"}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
          </LabeledField>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <LabeledField label="Rest timer (seconds)">
            <input
              className="input"
              inputMode="numeric"
              value={timerDuration}
              onChange={(event) => setTimerDuration(clampTimer(event.target.value))}
            />
          </LabeledField>
          <button
            type="button"
            className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100"
            onClick={() => setTimerSeconds(timerDuration)}
          >
            Start
          </button>
        </div>
      </Card>

      <Card title="Quick load" subtitle="Swap in a saved routine mid-session if needed.">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100"
            onClick={() => {
              setSessionDraft([]);
              setFeedback("Cleared — empty session.");
            }}
          >
            Clear
          </button>
          {(templates || []).map((template) => (
            <button
              key={template.id}
              type="button"
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100"
              onClick={() => loadTemplate(template)}
            >
              {template.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <input
            className="input"
            placeholder={generateSessionName()}
            value={saveTemplateName}
            onChange={(event) => setSaveTemplateName(event.target.value)}
          />
          <button type="button" className="button-secondary" onClick={saveTemplate}>
            Save template
          </button>
        </div>
      </Card>

      <Card title="Add exercises" subtitle="Type a lift name; new ones are created automatically.">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <input
            className="input"
            placeholder="Bench press, RDL, pull-up..."
            value={exerciseInput}
            onChange={(event) => setExerciseInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleAddExercise();
              }
            }}
          />
          <button type="button" className="button-primary" onClick={() => handleAddExercise()}>
            Add
          </button>
        </div>

        {!!suggestions?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
                onClick={() => handleAddExercise(exercise.name)}
              >
                {exercise.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {sessionDraft.map((exercise) => (
          <article
            key={exercise.key}
            className="rounded-[2rem] border border-slate-800/80 bg-slate-900/70 p-4 shadow-glow"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl">{exercise.name}</h3>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{exercise.slug}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200"
                onClick={() => removeExercise(exercise.key)}
              >
                Remove
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {exercise.sets.map((set, index) => (
                <div key={set.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-200">Set {index + 1}</p>
                    <button type="button" className="text-xs text-slate-500" onClick={() => removeSet(exercise.key, set.id)}>
                      Remove set
                    </button>
                  </div>

                  <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder={set.previous?.weight ? `${set.previous.weight} lb` : "Weight"}
                      value={set.weight}
                      onChange={(event) => updateExerciseSet(exercise.key, set.id, "weight", event.target.value)}
                    />
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder={set.previous?.reps ? `${set.previous.reps} reps` : "Reps"}
                      value={set.reps}
                      onChange={(event) => updateExerciseSet(exercise.key, set.id, "reps", event.target.value)}
                    />
                    <label className="flex min-h-[52px] items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3">
                      <input
                        type="checkbox"
                        checked={set.isCompleted}
                        onChange={(event) => handleCompletedToggle(exercise.key, set.id, event.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="button-secondary mt-4 w-full" onClick={() => addSet(exercise.key)}>
              Add set
            </button>
          </article>
        ))}
      </div>

      <button type="button" className="button-primary w-full py-4 text-base" onClick={saveSession}>
        Save session
      </button>
    </div>
  );
}
