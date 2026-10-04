import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { NAV_ITEMS } from "../../auth/permissions";

/**
 * The mobile navigation drawer.
 *
 * WHY THIS EXISTS
 *
 * The desktop nav is a horizontal pill bar that scrolls sideways when a role has
 * more items than fit. That is a reasonable trade on a wide screen and a poor
 * one on a phone: twelve departments become a strip two tabs wide with a row of
 * arrows to discover, and on a touch screen there is nowhere for the cursor to
 * rest so the hover auto-scroll never fires. A user on a phone could not
 * reliably reach Human Resources.
 *
 * So below `md` the pill bar is replaced by a hamburger that opens a full-height
 * drawer with every destination stacked and labelled in full rather than
 * abbreviated. `label` is used rather than `shortLabel` here, because the whole
 * point of the drawer is that a destination which does not fit on one line is
 * still legible.
 *
 * BEHAVIOUR, and the reasoning for each part:
 *
 *  - Closes on navigation. A drawer left open over the page the user just chose
 *    hides that page, so leaving it open is a bug rather than a preference.
 *
 *  - Locks body scroll while open. Without this, a touch drag inside the drawer
 *    scrolls the page behind it on iOS, which reads as the menu being broken.
 *
 *  - Escape closes it, because a drawer with no keyboard exit traps anyone
 *    driving without a mouse.
 *
 *  - Focus moves into the drawer on open and returns to the button on close, so
 *    a keyboard user is not left tabbing through the page behind an overlay.
 *
 *  - The close button, the overlay and Escape all work, because on a phone the
 *    overlay is the largest and most obvious target and dismissing a menu is
 *    most often an accident that needs undoing.
 */
export function MobileNavDrawer() {
  const { user, logout } = useAuth();
  const location = useLocation();
  // Which path the drawer was opened on. Storing the path rather than a plain
  // boolean is what lets "closes after navigating" fall out of render instead of
  // an effect: as soon as the location changes, `openedAt` no longer matches and
  // the drawer is closed. That also covers navigation the drawer did not
  // initiate, such as the browser back button or a redirect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = openedAt === location.pathname;

  const items = user ? NAV_ITEMS.filter((n) => n.roles.includes(user.role)) : [];

  function close() {
    setOpenedAt(null);
    buttonRef.current?.focus();
  }

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape to close, and restore focus to the button that opened it.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel so the next Tab lands on a menu item rather than
    // continuing from the hamburger up through the whole page behind.
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!user) return null;

  return (
    <>
      {/* The hamburger. md:hidden so the pill bar takes over from md upwards. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpenedAt(location.pathname)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/80 shadow-sm hover:bg-white md:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[2px] w-4 rounded-full bg-ink-soft/80" />
          <span className="block h-[2px] w-4 rounded-full bg-ink-soft/80" />
          <span className="block h-[2px] w-4 rounded-full bg-ink-soft/80" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Scrim. Tapping it is the primary way to dismiss on a phone.
              aria-hidden because the header close button and Escape already
              give it a proper accessible name and keyboard route; exposing a
              second, identically named control just duplicates it in the
              accessibility tree. tabIndex=-1 keeps it out of the tab order. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="mobile-nav-scrim"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/40 backdrop-blur-[2px]"
          />

          <div
            ref={panelRef}
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col overflow-y-auto border-r border-ink/10 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-4">
              <span className="text-sm font-semibold text-ink">Menu</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 p-3">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  // Choosing the page you are already on does not change the
                  // path, so `open` above would stay true. Close explicitly
                  // here too, but without moving focus back to the hamburger:
                  // the page just navigated to should receive focus instead.
                  onClick={() => setOpenedAt(null)}
                  className={({ isActive }) =>
                    `rounded-xl px-3 py-3 text-sm font-medium transition ${
                      isActive ? "bg-ink text-white" : "text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
                    }`
                  }
                >
                  {/* Full label, not shortLabel: the drawer exists so a long name
                      wraps instead of scrolling off the side of a pill. */}
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-ink/10 p-3">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-butter text-[11px] font-bold text-ink">
                  {user.name.split(" ").map((n) => n[0]).join("")}
                </span>
                <span className="truncate text-sm font-medium text-ink">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-xl border border-ink/10 px-3 py-2.5 text-left text-sm font-semibold text-ink-soft/80 hover:bg-ink/5 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}