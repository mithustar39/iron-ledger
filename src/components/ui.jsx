export function Card({ title, subtitle, children }) {
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

export function LabeledField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function StatPanel({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

export function TrendPanel({ label, children }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

export function TrendRow({ left, right }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 px-3 py-2 text-sm">
      <span className="text-slate-400">{left}</span>
      <span className="font-semibold text-slate-100">{right}</span>
    </div>
  );
}

export function EmptyText({ text }) {
  return <p className="rounded-2xl border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-500">{text}</p>;
}

export function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}
