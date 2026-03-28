import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, findExerciseByInput, getPreviousSet } from "./db";
import {
  clampTimer,
  fileToOptimizedBlob,
  formatDateLabel,
  formatDateTime,
  generateSessionName,
  requestPersistentStorage,
} from "./utils";

const EMPTY_DRAFT = [];

function createDraftSet(index) {
  return {
    id: crypto.randomUUID(),
    weight: "",
    reps: "",
    isCompleted: false,
    setIndex: index,
    previous: null,
  };
}

function createDraftExercise(exercise) {
  return {
    key: crypto.randomUUID(),
    exerciseId: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    sets: [createDraftSet(0)],
  };
}

async function hydrateGhostSets(exerciseId, sets) {
  return Promise.all(
    sets.map(async (set, index) => ({
      ...set,
      setIndex: index,
      previous: await getPreviousSet(exerciseId, index),
    })),
  );
}

export default function App() {
  const exercises = useLiveQuery(() => db.exercises.orderBy("name").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.orderBy("date").reverse().toArray(), []);
  const photos = useLiveQuery(() => db.photos.orderBy("date").reverse().toArray(), []);

  const [activeTab, setActiveTab] = useState("workout");
  const [exerciseInput, setExerciseInput] = useState("");
  const [bodyWeight, setBodyWeight] = useState("");
  const [height, setHeight] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDuration, setTimerDuration] = useState(90);
  const [storageStatus, setStorageStatus] = useState("Requesting persistent local storage...");
  const [sessionDraft, setSessionDraft] = useState(EMPTY_DRAFT);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [photoUrls, setPhotoUrls] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    requestPersistentStorage().then((granted) => {
      setStorageStatus(
        granted
          ? "Persistent storage granted. Your workout data is less likely to be purged."
          : "Persistent storage was not granted. Data is still local, but iOS may be more aggressive about cleanup.",
      );
    });
  }, []);

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

  useEffect(() => {
    if (!photos) {
      return undefined;
    }

    const nextUrls = {};
    photos.forEach((photo) => {
      nextUrls[photo.id] = URL.createObjectURL(photo.blob);
    });
    setPhotoUrls(nextUrls);

    return () => {
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const latestMetrics = sessions?.[0];
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

  const weightTrend = useMemo(
    () =>
      (sessions || [])
        .filter((session) => session.bodyWeight)
        .slice(0, 6)
        .reverse(),
    [sessions],
  );

  const heightTrend = useMemo(
    () =>
      (sessions || [])
        .filter((session) => session.height)
        .slice(0, 6)
        .reverse(),
    [sessions],
  );

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

    const sessionId = await db.sessions.add({
      date: new Date().toISOString(),
      bodyWeight: bodyWeight ? Number(bodyWeight) : null,
      height: height ? Number(height) : null,
    });

    const rows = sessionDraft.flatMap((exercise) =>
      exercise.sets.map((set, index) => ({
        sessionId,
        exerciseId: exercise.exerciseId,
        weight: set.weight ? Number(set.weight) : null,
        reps: set.reps ? Number(set.reps) : null,
        setIndex: index,
        isCompleted: Boolean(set.isCompleted),
      })),
    );

    if (rows.length) {
      await db.sets.bulkAdd(rows);
    }

    setFeedback("Session saved locally.");
    setSessionDraft([]);
    setBodyWeight("");
    setHeight("");
    setTimerSeconds(0);
  }

  async function saveTemplate() {
    if (!saveTemplateName.trim() || !sessionDraft.length) {
      setFeedback("Give the template a name and add at least one exercise.");
      return;
    }

    await db.templates.add({
      name: saveTemplateName.trim(),
      exerciseSlugs: sessionDraft.map((exercise) => exercise.slug),
    });

    setSaveTemplateName("");
    setFeedback("Template saved for future sessions.");
  }

  async function loadTemplate(template) {
    const loadedExercises = await Promise.all(
      (template.exerciseSlugs || []).map(async (slug) => {
        const exercise = await db.exercises.where("slug").equals(slug).first();
        if (!exercise) {
          return null;
        }
        const draft = createDraftExercise(exercise);
        draft.sets = await hydrateGhostSets(exercise.id, draft.sets);
        return draft;
      }),
    );

    setSessionDraft(loadedExercises.filter(Boolean));
    setFeedback(`Loaded ${template.name}.`);
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const blob = await fileToOptimizedBlob(file);
    await db.photos.add({
      blob,
      date: new Date().toISOString(),
    });

    setFeedback("Photo compressed to WebP and saved locally.");
    event.target.value = "";
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6 text-slate-100">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Local-first PWA</p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Iron Ledger</h1>
            <p className="mt-2 max-w-xs text-sm text-slate-400">
              Fast logging, ghost sets, rest timing, and progress media stored on-device.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-300">Rest</p>
            <p className="font-display text-2xl">{formatClock(timerSeconds)}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">{storageStatus}</p>
      </header>

      <nav className="mt-5 grid grid-cols-2 gap-3 rounded-3xl border border-slate-800/80 bg-slate-900/60 p-2 shadow-glow">
        <TabButton active={activeTab === "workout"} label="Live Workout" onClick={() => setActiveTab("workout")} />
        <TabButton active={activeTab === "dashboard"} label="Dashboard" onClick={() => setActiveTab("dashboard")} />
      </nav>

      {feedback ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {feedback}
        </div>
      ) : null}

      {activeTab === "workout" ? (
        <section className="mt-5 space-y-5">
          <Card title="Session Setup" subtitle={new Date().toLocaleDateString()}>
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
                className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100"
                onClick={() => setTimerSeconds(timerDuration)}
              >
                Start
              </button>
            </div>
          </Card>

          <Card title="Template Launcher" subtitle="Jump in from a saved split or start empty.">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100"
                onClick={() => {
                  setSessionDraft([]);
                  setFeedback("Started an empty session.");
                }}
              >
                Empty Session
              </button>
              {(templates || []).map((template) => (
                <button
                  key={template.id}
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
              <button className="button-secondary" onClick={saveTemplate}>
                Save Template
              </button>
            </div>
          </Card>

          <Card title="Exercise Search" subtitle="Type anything. New lifts are normalized and auto-created.">
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
              <button className="button-primary" onClick={() => handleAddExercise()}>
                Add
              </button>
            </div>

            {!!suggestions?.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.slice(0, 6).map((exercise) => (
                  <button
                    key={exercise.id}
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
                        <button className="text-xs text-slate-500" onClick={() => removeSet(exercise.key, set.id)}>
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
                            onChange={(event) =>
                              handleCompletedToggle(exercise.key, set.id, event.target.checked)
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <button className="button-secondary mt-4 w-full" onClick={() => addSet(exercise.key)}>
                  Add Set
                </button>
              </article>
            ))}
          </div>

          <button className="button-primary w-full py-4 text-base" onClick={saveSession}>
            Save Session to Device
          </button>
        </section>
      ) : (
        <section className="mt-5 space-y-5">
          <Card title="Biometrics Trend" subtitle="Your last few measurements, stored locally.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatPanel
                label="Current weight"
                value={latestMetrics?.bodyWeight ? `${latestMetrics.bodyWeight} lb` : "No entries"}
              />
              <StatPanel
                label="Current height"
                value={latestMetrics?.height ? `${latestMetrics.height} in` : "No entries"}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TrendPanel label="Weight">
                {weightTrend.length ? (
                  weightTrend.map((entry) => (
                    <TrendRow key={entry.id} left={formatDateLabel(entry.date)} right={`${entry.bodyWeight} lb`} />
                  ))
                ) : (
                  <EmptyText text="Log body weight in a session to build a trend." />
                )}
              </TrendPanel>

              <TrendPanel label="Height">
                {heightTrend.length ? (
                  heightTrend.map((entry) => (
                    <TrendRow key={entry.id} left={formatDateLabel(entry.date)} right={`${entry.height} in`} />
                  ))
                ) : (
                  <EmptyText text="Height entries will appear here." />
                )}
              </TrendPanel>
            </div>
          </Card>

          <Card title="Progress Photos" subtitle="Downscaled to 1080p WebP before saving.">
            <label className="button-primary flex cursor-pointer items-center justify-center">
              Add Progress Photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {(photos || []).map((photo) => (
                <figure
                  key={photo.id}
                  className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/60"
                >
                  <img
                    src={photoUrls[photo.id]}
                    alt={formatDateTime(photo.date)}
                    className="aspect-[3/4] h-full w-full object-cover"
                  />
                  <figcaption className="px-3 py-2 text-xs text-slate-400">{formatDateTime(photo.date)}</figcaption>
                </figure>
              ))}
            </div>
            {photos && !photos.length ? <EmptyText text="No photos yet. Add one after a session." /> : null}
          </Card>

          <Card title="Recent Sessions" subtitle="Quick glance at your latest training history.">
            <div className="space-y-3">
              {(sessions || []).slice(0, 8).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{formatDateTime(session.date)}</p>
                    <p className="text-xs text-slate-500">
                      {session.bodyWeight ? `${session.bodyWeight} lb` : "No weight"} /{" "}
                      {session.height ? `${session.height} in` : "No height"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/70 p-4 shadow-glow backdrop-blur">
      <div className="mb-4">
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function TabButton({ active, label, onClick }) {
  return (
    <button
      className={`rounded-[1.25rem] px-4 py-3 text-sm font-semibold transition ${
        active
          ? "bg-slate-100 text-slate-950"
          : "bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function LabeledField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StatPanel({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function TrendPanel({ label, children }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function TrendRow({ left, right }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 px-3 py-2 text-sm">
      <span className="text-slate-400">{left}</span>
      <span className="font-semibold text-slate-100">{right}</span>
    </div>
  );
}

function EmptyText({ text }) {
  return <p className="rounded-2xl border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-500">{text}</p>;
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}
