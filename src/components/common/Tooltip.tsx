import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Shared floating explainer bubble ("info tip").
 *
 * Used for any dashboard summary figure whose displayed value is a shortened
 * or derived form of something more precise: an abbreviated currency figure
 * like R100.00m, a rate computed from a register, a rounded count. The bubble
 * carries the exact underlying number and what it was calculated from, so the
 * headline tile stays readable while the precise figure is one hover away.
 *
 * WHY A SHARED COMPONENT
 *
 * Three separate surfaces needed this (KPI cards, the Executive Overview
 * widget tiles, the department headline rows). Each had invented its own
 * hover-only trick, and hover-only is not an interaction: on a touch screen
 * there is no hover at all, so the detail was simply unreachable on a phone.
 *
 * HOW IT OPENS, and why each trigger is here:
 *
 *  - HOVER, so a mouse user gets the detail without clicking anything.
 *  - FOCUS, via tabIndex and focus-within. An information bubble reachable
 *    only with a pointer is not keyboard accessible, and this is exactly the
 *    content a screen reader user needs most.
 *  - TAP/CLICK, which toggles a pinned state. This is the touch path, and it
 *    is a toggle rather than a hover because touch has no "move away" event:
 *    without a toggle, a tap would open a bubble nothing could close.
 *  - ESCAPE and an outside tap both dismiss the pinned bubble, because a tip
 *    that only closes by tapping its own trigger is a trap on a small screen.
 *
 * The bubble itself is pointer-events-none, so it can never intercept the
 * click that dismisses it, and it never shifts layout when it appears.
 */
export function Tooltip({
  children,
  content,
  text,
  /** Plain-text description for assistive tech. Required when the bubble holds
   *  formatted rows rather than a sentence, because a row of figures read out
   *  as prose is useless. */
  label,
  align = "center",
  bubbleWidth = "w-64",
}: {
  children: ReactNode;
  /** Bubble body. `text` is the older string-only spelling, still used by the
   *  Administration threshold notes. */
  content?: ReactNode;
  text?: string;
  label?: string;
  align?: "center" | "left" | "right";
  bubbleWidth?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  // Dismiss the pinned bubble on Escape or a click anywhere else. Bound only
  // while pinned so a page with a thousand tooltips does not carry a thousand
  // listeners.
  useEffect(() => {
    if (!pinned) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPinned(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pinned]);

  const bubble = content ?? text;
  if (bubble == null || bubble === "") return <>{children}</>;

  // align decides which edge of the trigger the bubble grows from. "right" and
  // "left" exist because a centred bubble on a tile near the right edge of a
  // card would be clipped by the card boundary, which is the common case.
  const placement =
    align === "left"
      ? "right-full top-1/2 mr-2 -translate-y-1/2 origin-right"
      : align === "right"
        ? "left-full top-1/2 ml-2 -translate-y-1/2 origin-left"
        : "bottom-full left-1/2 mb-2 -translate-x-1/2 origin-bottom";
  const arrow =
    align === "left"
      ? "right-full top-1/2 -translate-y-1/2 rotate-45"
      : align === "right"
        ? "left-full top-1/2 -translate-y-1/2 rotate-45"
        : "left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rotate-45";

  return (
    <span ref={rootRef} className="group/tip relative inline-flex">
      <span
        tabIndex={0}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-describedby={pinned ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        className="cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-butter-dark focus-visible:ring-offset-1"
      >
        {children}
      </span>

      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-30 ${bubbleWidth} ${placement} max-w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-ink/95 px-3 py-2 text-xs leading-snug text-butter opacity-0 shadow-lg backdrop-blur-[2px] transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${
          pinned ? "opacity-100" : ""
        }`}
      >
        {bubble}
        {/* The arrow carries the same 95% ink as the bubble. It has to: at full
            opacity the arrow would read as a solid chip attached to a slightly
            see-through bubble, because the two sit on different backdrops. */}
        <span className={`absolute h-2 w-2 bg-ink/95 ${arrow}`} />
      </span>
    </span>
  );
}

/**
 * A label/value pair inside a tooltip bubble.
 *
 * Tooltips here hold figures, and a sentence is the wrong shape for a figure:
 * "Target R120 000.00" is readable at a glance, "The target for this measure
 * is one hundred and twenty thousand rand" is not. Callers pass the label and
 * value separately so the bubble can align them in columns.
 */
export function TipRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-4">
      <span className="opacity-70">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{value}</span>
    </span>
  );
}