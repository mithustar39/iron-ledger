import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold tracking-wide ${
    isActive ? "text-emerald-300" : "text-slate-500"
  }`;

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-6 pt-6 text-slate-100">
      <div className="flex-1 pb-20">
        <Outlet />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800/80 bg-slate-950/95 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-md justify-around">
          <NavLink to="/" end className={linkClass}>
            <span className="text-lg leading-none">◉</span>
            Home
          </NavLink>
          <NavLink to="/workouts" className={linkClass}>
            <span className="text-lg leading-none">◆</span>
            Workouts
          </NavLink>
          <NavLink to="/stats" className={linkClass}>
            <span className="text-lg leading-none">◈</span>
            Stats
          </NavLink>
          <NavLink to="/profile" className={linkClass}>
            <span className="text-lg leading-none">◍</span>
            Profile
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
