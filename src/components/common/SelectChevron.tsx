// Custom dropdown indicator for native <select> elements styled with
// appearance-none. A plain "▾" glyph renders inconsistently (tiny/misaligned)
// across browsers, so use a crisp inline SVG instead.
export function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-butter"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}
