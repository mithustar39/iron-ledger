import { supabase } from "../supabaseClient";
import { db, getLastSyncAt, setLastSyncAt } from "../db";

const TABLES = ["exercises", "templates", "sessions", "sets", "photos"];

function toRemoteRow(entity, local, userId) {
  if (!local) {
    return null;
  }

  if (entity === "photos") {
    return {
      id: local.id,
      user_id: userId,
      date: local.date,
      storage_path: local.storagePath ?? null,
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt ?? null,
    };
  }

  if (entity === "templates") {
    return {
      id: local.id,
      user_id: userId,
      name: local.name,
      exercise_slugs: local.exerciseSlugs ?? [],
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt ?? null,
    };
  }

  if (entity === "exercises") {
    return {
      id: local.id,
      user_id: userId,
      name: local.name,
      slug: local.slug,
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt ?? null,
    };
  }

  if (entity === "sessions") {
    return {
      id: local.id,
      user_id: userId,
      date: local.date,
      body_weight: local.bodyWeight ?? null,
      height: local.height ?? null,
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt ?? null,
    };
  }

  if (entity === "sets") {
    return {
      id: local.id,
      user_id: userId,
      session_id: local.sessionId,
      exercise_id: local.exerciseId,
      weight: local.weight ?? null,
      reps: local.reps ?? null,
      set_index: local.setIndex ?? 0,
      is_completed: Boolean(local.isCompleted),
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt ?? null,
    };
  }

  return null;
}

function fromRemoteRow(entity, row) {
  if (!row) {
    return null;
  }

  if (entity === "photos") {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      blob: null,
      date: row.date,
      storagePath: row.storage_path ?? null,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  if (entity === "templates") {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      name: row.name,
      exerciseSlugs: row.exercise_slugs ?? [],
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  if (entity === "exercises") {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      name: row.name,
      slug: row.slug,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  if (entity === "sessions") {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      date: row.date,
      bodyWeight: row.body_weight ?? null,
      height: row.height ?? null,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  if (entity === "sets") {
    return {
      id: row.id,
      userId: row.user_id ?? null,
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      weight: row.weight ?? null,
      reps: row.reps ?? null,
      setIndex: row.set_index ?? 0,
      isCompleted: Boolean(row.is_completed),
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  return null;
}

async function upsertRemote(entity, payload) {
  return await supabase.from(entity).upsert(payload, { onConflict: "id" });
}

async function ensurePhotoUploaded(localPhoto, userId) {
  if (!localPhoto?.blob || localPhoto.storagePath) {
    return localPhoto?.storagePath ?? null;
  }

  const path = `${userId}/${localPhoto.id}.webp`;
  const { error } = await supabase.storage.from("photos").upload(path, localPhoto.blob, {
    upsert: true,
    contentType: "image/webp",
  });
  if (error) {
    throw error;
  }

  await db.photos.update(localPhoto.id, { storagePath: path, updatedAt: new Date().toISOString() });
  return path;
}

async function pullEntity(entity, userId, since) {
  const query = supabase
    .from(entity)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  const { data, error } = since ? await query.gt("updated_at", since) : await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function syncNow(user) {
  if (!supabase || !user) {
    return { ok: false, reason: "missing_supabase_or_user" };
  }

  const userId = user.id;
  const startedAt = new Date().toISOString();
  const since = await getLastSyncAt();

  const pending = await db.outbox.orderBy("id").toArray();
  for (const entry of pending) {
    const entity = entry.entity;
    if (!TABLES.includes(entity)) {
      await db.outbox.delete(entry.id);
      continue;
    }

    const local = await db.table(entity).get(entry.entityId);
    if (entity === "photos" && local) {
      const storagePath = await ensurePhotoUploaded(local, userId);
      local.storagePath = storagePath;
    }

    const payload = toRemoteRow(entity, local, userId);
    if (!payload) {
      await db.outbox.delete(entry.id);
      continue;
    }

    const { error } = await upsertRemote(entity, payload);
    if (error) {
      throw error;
    }

    await db.outbox.delete(entry.id);
  }

  await db.transaction("rw", db.exercises, db.templates, db.sessions, db.sets, db.photos, async () => {
    for (const entity of TABLES) {
      const rows = await pullEntity(entity, userId, since);
      if (!rows.length) {
        continue;
      }

      const mapped = rows.map((row) => fromRemoteRow(entity, row)).filter(Boolean);
      if (!mapped.length) {
        continue;
      }

      if (entity === "photos") {
        const existing = await db.photos.bulkGet(mapped.map((item) => item.id));
        const merged = mapped.map((remotePhoto, index) => ({
          ...remotePhoto,
          blob: existing[index]?.blob ?? null,
        }));
        await db.photos.bulkPut(merged);
      } else {
        await db.table(entity).bulkPut(mapped);
      }
    }
  });

  await setLastSyncAt(startedAt);
  return { ok: true, since, at: startedAt };
}

