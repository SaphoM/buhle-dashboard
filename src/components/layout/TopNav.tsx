import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { NAV_ITEMS } from "../../auth/permissions";
import buhleWordmark from "../../assets/buhle-wordmark.png";

export function TopNav() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = NAV_ITEMS.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex items-center gap-3 px-4 pt-4 sm:px-6">
      <div className="flex shrink-0 items-center rounded-full border border-ink/10 bg-white px-4 py-2 shadow-sm">
        <img src={buhleWordmark} alt="Buhle Farmers' Academy" className="h-7 w-auto" />
      </div>

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-ink/10 bg-white/80 px-2 py-1.5 shadow-sm">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-ink text-white shadow-sm" : "text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
              }`
            }
          >
            {item.shortLabel}
          </NavLink>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/80 shadow-sm hover:bg-white"
          title="Notifications"
        >
          🔔
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <button
          onClick={logout}
          className="flex h-10 items-center gap-2 rounded-full border border-ink/10 bg-white/80 px-3 shadow-sm hover:bg-white"
          title="Sign out"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-butter text-[11px] font-bold text-ink">
            {user.name.split(" ").map((n) => n[0]).join("")}
          </span>
          <span className="hidden text-sm font-medium text-ink sm:inline">Sign out</span>
        </button>
      </div>
    </div>
  );
}
