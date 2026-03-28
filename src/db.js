import Dexie from "dexie";

export const db = new Dexie("iron-ledger");

db.version(1).stores({
  exercises: "++id, &name, slug",
  templates: "++id, name",
  sessions: "++id, date, bodyWeight, height",
  sets: "++id, sessionId, exerciseId, weight, reps, setIndex, isCompleted",
  photos: "++id, blob, date",
});

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

  const id = await db.exercises.add({
    name: normalizedName,
    slug,
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
