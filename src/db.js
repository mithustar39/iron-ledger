import Dexie from "dexie";

const LEGACY_DB_NAME = "iron-ledger";
const DB_NAME = "iron-ledger-v2";

const legacyDb = new Dexie(LEGACY_DB_NAME);
legacyDb.version(1).stores({
  exercises: "++id, &name, slug",
  templates: "++id, name",
  sessions: "++id, date, bodyWeight, height",
  sets: "++id, sessionId, exerciseId, weight, reps, setIndex, isCompleted",
  photos: "++id, blob, date",
});

export const db = new Dexie(DB_NAME);

db.version(1).stores({
  meta: "&key",
  outbox: "++id, userId, entity, entityId, op, updatedAt",
  exercises: "id, &slug, name, userId, updatedAt, deletedAt",
  templates: "id, name, userId, updatedAt, deletedAt",
  sessions: "id, date, userId, updatedAt, deletedAt",
  sets: "id, sessionId, exerciseId, setIndex, userId, updatedAt, deletedAt",
  photos: "id, date, userId, updatedAt, deletedAt",
});

function nowIso() {
  return new Date().toISOString();
}

async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

async function getMeta(key) {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function getLastSyncAt() {
  return (await getMeta("lastSyncAt")) ?? null;
}

export async function setLastSyncAt(value) {
  await setMeta("lastSyncAt", value);
}

const DEFAULT_USER_PROFILE = {
  age: "",
  sex: "male",
  activityLevel: "1.55",
  goalWeight: "",
  goalCalories: "",
};

export async function getUserProfile() {
  const stored = await getMeta("userProfile");
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_USER_PROFILE };
  }
  return { ...DEFAULT_USER_PROFILE, ...stored };
}

export async function setUserProfile(profile) {
  await setMeta("userProfile", { ...(await getUserProfile()), ...profile });
}

export async function getLastTemplateId() {
  return (await getMeta("lastTemplateId")) ?? null;
}

export async function setLastTemplateId(id) {
  await setMeta("lastTemplateId", id ?? null);
}

async function migrateLegacyIfNeeded() {
  await db.open();

  const migrated = await getMeta("migratedFromLegacyV1");
  if (migrated) {
    return;
  }

  try {
    await legacyDb.open();
  } catch {
    await setMeta("migratedFromLegacyV1", true);
    return;
  }

  const [legacyExercises, legacyTemplates, legacySessions, legacySets, legacyPhotos] = await Promise.all([
    legacyDb.exercises.toArray(),
    legacyDb.templates.toArray(),
    legacyDb.sessions.toArray(),
    legacyDb.sets.toArray(),
    legacyDb.photos.toArray(),
  ]);

  if (
    !legacyExercises.length &&
    !legacyTemplates.length &&
    !legacySessions.length &&
    !legacySets.length &&
    !legacyPhotos.length
  ) {
    await setMeta("migratedFromLegacyV1", true);
    return;
  }

  const exerciseIdMap = new Map();
  const sessionIdMap = new Map();
  const migratedAt = nowIso();

  const nextExercises = legacyExercises.map((exercise) => {
    const id = crypto.randomUUID();
    exerciseIdMap.set(exercise.id, id);
    return {
      id,
      name: exercise.name,
      slug: exercise.slug,
      userId: null,
      updatedAt: migratedAt,
      deletedAt: null,
    };
  });

  const nextSessions = legacySessions.map((session) => {
    const id = crypto.randomUUID();
    sessionIdMap.set(session.id, id);
    return {
      id,
      date: session.date,
      bodyWeight: session.bodyWeight ?? null,
      height: session.height ?? null,
      userId: null,
      updatedAt: migratedAt,
      deletedAt: null,
    };
  });

  const nextSets = legacySets
    .map((set) => {
      const sessionId = sessionIdMap.get(set.sessionId);
      const exerciseId = exerciseIdMap.get(set.exerciseId);
      if (!sessionId || !exerciseId) {
        return null;
      }
      return {
        id: crypto.randomUUID(),
        sessionId,
        exerciseId,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        setIndex: set.setIndex ?? 0,
        isCompleted: Boolean(set.isCompleted),
        userId: null,
        updatedAt: migratedAt,
        deletedAt: null,
      };
    })
    .filter(Boolean);

  const nextTemplates = legacyTemplates.map((template) => ({
    id: crypto.randomUUID(),
    name: template.name,
    exerciseSlugs: template.exerciseSlugs ?? [],
    userId: null,
    updatedAt: migratedAt,
    deletedAt: null,
  }));

  const nextPhotos = legacyPhotos.map((photo) => ({
    id: crypto.randomUUID(),
    blob: photo.blob,
    date: photo.date,
    storagePath: null,
    userId: null,
    updatedAt: migratedAt,
    deletedAt: null,
  }));

  await db.transaction(
    "rw",
    db.exercises,
    db.sessions,
    db.sets,
    db.templates,
    db.photos,
    async () => {
      if (nextExercises.length) {
        await db.exercises.bulkPut(nextExercises);
      }
      if (nextSessions.length) {
        await db.sessions.bulkPut(nextSessions);
      }
      if (nextSets.length) {
        await db.sets.bulkPut(nextSets);
      }
      if (nextTemplates.length) {
        await db.templates.bulkPut(nextTemplates);
      }
      if (nextPhotos.length) {
        await db.photos.bulkPut(nextPhotos);
      }
    },
  );

  await setMeta("migratedFromLegacyV1", true);
}

export const dbReady = migrateLegacyIfNeeded();

export function slugifyExerciseName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function titleCaseExerciseName(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function findExerciseByInput(value) {
  const normalizedName = titleCaseExerciseName(value);
  const slug = slugifyExerciseName(value);

  if (!slug) {
    return null;
  }

  const existingBySlug = await db.exercises.where("slug").equals(slug).first();
  if (existingBySlug) {
    return existingBySlug;
  }

  const existingByName = await db.exercises.where("name").equals(normalizedName).first();
  if (existingByName) {
    return existingByName;
  }

  const id = crypto.randomUUID();
  await db.exercises.put({
    id,
    name: normalizedName,
    slug,
    userId: null,
    updatedAt: nowIso(),
    deletedAt: null,
  });

  return { id, name: normalizedName, slug };
}

export async function getPreviousSet(exerciseId, setIndex) {
  const matchingSets = await db.sets.where("exerciseId").equals(exerciseId).toArray();

  if (!matchingSets.length) {
    return null;
  }

  const sessionIds = [...new Set(matchingSets.map((set) => set.sessionId))];
  const sessions = await db.sessions.bulkGet(sessionIds);

  const orderedSessionIds = sessions
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((session) => session.id);

  const previousSessionId = orderedSessionIds.find((sessionId) =>
    matchingSets.some((set) => set.sessionId === sessionId && set.setIndex === setIndex),
  );

  if (!previousSessionId) {
    return null;
  }

  const set = matchingSets.find(
    (entry) => entry.sessionId === previousSessionId && entry.setIndex === setIndex,
  );

  if (!set) {
    return null;
  }

  return {
    weight: set.weight,
    reps: set.reps,
  };
}

export async function enqueueOutbox(entry) {
  await db.outbox.add({
    ...entry,
    updatedAt: entry.updatedAt ?? nowIso(),
  });
}
