function dateKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {{ date: string }[]} sessions */
export function computeSessionStreak(sessions) {
  if (!sessions?.length) {
    return 0;
  }

  const keys = new Set(sessions.map((s) => dateKeyLocal(new Date(s.date))));
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);

  if (!keys.has(dateKeyLocal(anchor))) {
    anchor.setDate(anchor.getDate() - 1);
  }

  if (!keys.has(dateKeyLocal(anchor))) {
    return 0;
  }

  let streak = 0;
  while (keys.has(dateKeyLocal(anchor))) {
    streak += 1;
    anchor.setDate(anchor.getDate() - 1);
  }

  return streak;
}

/** @param {{ date: string }[]} sessions */
export function sessionsThisWeek(sessions) {
  if (!sessions?.length) {
    return 0;
  }
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => new Date(s.date).getTime() >= weekAgo).length;
}

/**
 * @param {{ id: string; name: string }[]} templates
 * @param {string | null} lastTemplateId
 */
export function pickNextWorkout(templates, lastTemplateId) {
  if (!templates?.length) {
    return { templateId: null, label: "No saved routine yet", sub: "Create one under Workouts." };
  }
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  if (lastTemplateId) {
    const last = sorted.find((t) => t.id === lastTemplateId);
    if (last) {
      const idx = sorted.findIndex((t) => t.id === lastTemplateId);
      const next = sorted[(idx + 1) % sorted.length];
      return { templateId: next.id, label: next.name, sub: "Rotating through your routines." };
    }
  }
  return { templateId: sorted[0].id, label: sorted[0].name, sub: "Suggested next session." };
}
