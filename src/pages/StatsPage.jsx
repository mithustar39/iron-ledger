import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, enqueueOutbox, getUserProfile, setUserProfile } from "../db";
import { useAppAuth } from "../context/AppAuthContext";
import { estimateMifflinBmr, estimateTdee } from "../lib/nutrition";
import { fileToOptimizedBlob, formatDateLabel, formatDateTime } from "../utils";
import { Card, EmptyText, StatPanel, TrendPanel, TrendRow } from "../components/ui";

export default function StatsPage() {
  const { supabase, user } = useAppAuth();
  const sessions = useLiveQuery(() => db.sessions.orderBy("date").reverse().toArray(), []);
  const photos = useLiveQuery(() => db.photos.orderBy("date").reverse().toArray(), []);
  const [photoUrls, setPhotoUrls] = useState({});
  const [profile, setProfile] = useState({
    age: "",
    sex: "male",
    activityLevel: "1.55",
    goalWeight: "",
    goalCalories: "",
  });
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    getUserProfile().then((p) => {
      setProfile({
        age: p.age ?? "",
        sex: p.sex ?? "male",
        activityLevel: p.activityLevel ?? "1.55",
        goalWeight: p.goalWeight ?? "",
        goalCalories: p.goalCalories ?? "",
      });
      setProfileLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!photos) {
      return undefined;
    }

    const nextUrls = {};
    const blobUrls = [];
    const pendingSigned = [];

    photos.forEach((photo) => {
      if (photo.blob) {
        const url = URL.createObjectURL(photo.blob);
        nextUrls[photo.id] = url;
        blobUrls.push(url);
        return;
      }

      if (supabase && user && photo.storagePath) {
        pendingSigned.push(
          supabase.storage
            .from("photos")
            .createSignedUrl(photo.storagePath, 60 * 60)
            .then(({ data }) => {
              if (data?.signedUrl) {
                nextUrls[photo.id] = data.signedUrl;
              }
            })
            .catch(() => {}),
        );
      }
    });

    let cancelled = false;
    Promise.all(pendingSigned).then(() => {
      if (!cancelled) {
        setPhotoUrls({ ...nextUrls });
      }
    });

    setPhotoUrls(nextUrls);

    return () => {
      cancelled = true;
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos, user?.id, supabase]);

  const latestMetrics = sessions?.[0];

  const weightTrend = useMemo(
    () =>
      (sessions || [])
        .filter((session) => session.bodyWeight)
        .slice(0, 8)
        .reverse(),
    [sessions],
  );

  const heightTrend = useMemo(
    () =>
      (sessions || [])
        .filter((session) => session.height)
        .slice(0, 8)
        .reverse(),
    [sessions],
  );

  const bmr = useMemo(() => {
    if (!latestMetrics?.bodyWeight || !latestMetrics?.height) {
      return null;
    }
    return estimateMifflinBmr(latestMetrics.bodyWeight, latestMetrics.height, profile.age, profile.sex);
  }, [latestMetrics, profile.age, profile.sex]);

  const tdee = useMemo(() => {
    if (bmr == null) {
      return null;
    }
    return estimateTdee(bmr, profile.activityLevel);
  }, [bmr, profile.activityLevel]);

  async function persistProfile(next) {
    setProfile(next);
    await setUserProfile(next);
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const blob = await fileToOptimizedBlob(file);
    const photoId = crypto.randomUUID();
    await db.photos.put({
      id: photoId,
      blob,
      date: new Date().toISOString(),
      storagePath: null,
      userId: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await enqueueOutbox({ entity: "photos", entityId: photoId, op: "upsert", userId: user?.id ?? null });
    event.target.value = "";
  }

  return (
    <div className="space-y-5">
      <header className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-5 shadow-glow backdrop-blur">
        <p className="text-xs uppercase tracking-[0.35em] text-sky-400">Stats</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Body & goals</h1>
        <p className="mt-2 text-sm text-slate-400">Weight, height trends, rough calorie estimates, progress photos.</p>
      </header>

      <Card title="Latest measurements" subtitle="Pulled from your most recent saved session.">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatPanel
            label="Weight"
            value={latestMetrics?.bodyWeight ? `${latestMetrics.bodyWeight} lb` : "—"}
          />
          <StatPanel
            label="Height"
            value={latestMetrics?.height ? `${latestMetrics.height} in` : "—"}
          />
        </div>
      </Card>

      <Card title="Goals & estimates" subtitle="Rough TDEE from Mifflin–St Jeor using latest weight/height. Not medical advice.">
        {profileLoaded ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Age</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={profile.age}
                  onChange={(e) => persistProfile({ ...profile, age: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Sex</span>
                <select
                  className="input"
                  value={profile.sex}
                  onChange={(e) => persistProfile({ ...profile, sex: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Activity (multiplier)</span>
              <select
                className="input"
                value={profile.activityLevel}
                onChange={(e) => persistProfile({ ...profile, activityLevel: e.target.value })}
              >
                <option value="1.2">Sedentary (1.2)</option>
                <option value="1.375">Light (1.375)</option>
                <option value="1.55">Moderate (1.55)</option>
                <option value="1.725">Very active (1.725)</option>
                <option value="1.9">Extra active (1.9)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Goal weight (lb, optional)</span>
              <input
                className="input"
                inputMode="decimal"
                value={profile.goalWeight}
                onChange={(e) => persistProfile({ ...profile, goalWeight: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Calorie target (optional override)</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder={tdee ? `e.g. ${Math.round(tdee)} maintenance` : "Log weight & height in a session first"}
                value={profile.goalCalories}
                onChange={(e) => persistProfile({ ...profile, goalCalories: e.target.value })}
              />
            </label>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
              <p>
                Est. BMR:{" "}
                <span className="font-semibold text-emerald-300">{bmr != null ? `${Math.round(bmr)} kcal/day` : "—"}</span>
              </p>
              <p className="mt-2">
                Est. maintenance (TDEE):{" "}
                <span className="font-semibold text-emerald-300">{tdee != null ? `${Math.round(tdee)} kcal/day` : "—"}</span>
              </p>
              {profile.goalCalories ? (
                <p className="mt-2 text-slate-400">Your target: {profile.goalCalories} kcal/day (manual).</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </Card>

      <Card title="Weight trend" subtitle="From logged sessions.">
        <TrendPanel label="History">
          {weightTrend.length ? (
            weightTrend.map((entry) => (
              <TrendRow key={entry.id} left={formatDateLabel(entry.date)} right={`${entry.bodyWeight} lb`} />
            ))
          ) : (
            <EmptyText text="Log body weight when you save a workout." />
          )}
        </TrendPanel>
      </Card>

      <Card title="Height trend" subtitle="From logged sessions.">
        <TrendPanel label="History">
          {heightTrend.length ? (
            heightTrend.map((entry) => (
              <TrendRow key={entry.id} left={formatDateLabel(entry.date)} right={`${entry.height} in`} />
            ))
          ) : (
            <EmptyText text="Log height in a session to see entries here." />
          )}
        </TrendPanel>
      </Card>

      <Card title="Progress photos" subtitle="Compressed WebP on device; syncs when signed in.">
        <label className="button-primary flex cursor-pointer items-center justify-center">
          Add photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {(photos || []).map((photo) => (
            <figure
              key={photo.id}
              className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/60"
            >
              {photoUrls[photo.id] ? (
                <img
                  src={photoUrls[photo.id]}
                  alt={formatDateTime(photo.date)}
                  className="aspect-[3/4] h-full w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center text-xs text-slate-500">
                  {photo.storagePath ? "Sign in to load" : "Loading…"}
                </div>
              )}
              <figcaption className="px-3 py-2 text-xs text-slate-400">{formatDateTime(photo.date)}</figcaption>
            </figure>
          ))}
        </div>
        {photos && !photos.length ? <EmptyText text="No photos yet." /> : null}
      </Card>
    </div>
  );
}
