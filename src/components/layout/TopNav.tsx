import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { NAV_ITEMS } from "../../auth/permissions";
import { useDataStore } from "../../data/DataStoreContext";
import buhleWordmark from "../../assets/buhle-wordmark.png";

export function TopNav() {
  const { user, logout } = useAuth();
  const { risks } = useDataStore();
  const scrollerRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Roles with many nav items (e.g. admin sees all 12) overflow this pill
  // bar. It's still horizontally scrollable, but with no affordance a user
  // has no way to know tabs beyond the visible ones exist — these fades +
  // arrow buttons make the overflow discoverable instead of silently hidden.
  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    window.addEventListener("resize", updateScrollState);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [user?.role]);

  function scrollByAmount(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (!user) return null;
  const items = NAV_ITEMS.filter((n) => n.roles.includes(user.role));
  const activeRiskCount = risks.filter((r) => r.status !== "Resolved").length;

  return (
    <div className="flex items-center gap-3 px-4 pt-4 sm:px-6">
      <div className="flex shrink-0 items-center rounded-full border border-ink/10 bg-white px-4 py-2 shadow-sm">
        <img src={buhleWordmark} alt="Buhle Farmers' Academy" className="h-7 w-auto" />
      </div>

      <div className="relative min-w-0 flex-1">
        <nav
          ref={scrollerRef}
          onScroll={updateScrollState}
          className="flex items-center gap-1 overflow-x-auto rounded-full border border-ink/10 bg-white/80 px-2 py-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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

        {canScrollLeft && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-full bg-gradient-to-r from-white to-transparent" />
            <button
              type="button"
              onClick={() => scrollByAmount(-160)}
              aria-label="Scroll tabs left"
              className="absolute inset-y-0 left-0 flex w-7 items-center justify-center text-ink-soft/60 hover:text-ink"
            >
              ‹
            </button>
          </>
        )}
        {canScrollRight && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-full bg-gradient-to-l from-white to-transparent" />
            <button
              type="button"
              onClick={() => scrollByAmount(160)}
              aria-label="Scroll tabs right"
              className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-ink-soft/60 hover:text-ink"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NavLink
          to="/risk-centre"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/80 shadow-sm hover:bg-white"
          title={`${activeRiskCount} active risk${activeRiskCount === 1 ? "" : "s"}`}
        >
          🔔
          {activeRiskCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {activeRiskCount}
            </span>
          )}
        </NavLink>
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
