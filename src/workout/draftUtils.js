import { db, findExerciseByInput, getPreviousSet } from "../db";

export const EMPTY_DRAFT = [];

export function createDraftSet(index) {
  return {
    id: crypto.randomUUID(),
    weight: "",
    reps: "",
    isCompleted: false,
    setIndex: index,
    previous: null,
  };
}

export function createDraftExercise(exercise) {
  return {
    key: crypto.randomUUID(),
    exerciseId: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    sets: [createDraftSet(0)],
  };
}

export async function hydrateGhostSets(exerciseId, sets) {
  return Promise.all(
    sets.map(async (set, index) => ({
      ...set,
      setIndex: index,
      previous: await getPreviousSet(exerciseId, index),
    })),
  );
}

export async function loadTemplateDraft(template) {
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
  return loadedExercises.filter(Boolean);
}

export { findExerciseByInput };
