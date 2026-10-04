import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MiniBarTrend } from "./MiniBarTrend";

/**
 * Per-bar values on the mini bar trend.
 *
 * WHY THIS IS PINNED
 *
 * A bar chart states a shape and not a number. It shows that one period beat
 * another and nothing about by how much, and this chart is far too small to
 * carry a value axis. So the figure behind a bar has to be reachable by
 * pointing at the bar. These tests hold that line: if a bar loses its own value,
 * the chart is asserting a comparison the reader cannot check.
 *
 * HOVER CANNOT BE TESTED HERE: the bubble is revealed by a Tailwind
 * `group-hover:` class and jsdom has no CSS engine or real pointer hover. What
 * is asserted is the structure and the pinned/tapped path, which is real state.
 *
 * 1. EVERY BAR REPORTS ITS OWN PERIOD AND FIGURE. Not just the latest: the whole
 *    point is that the earlier bars are the ones with no value printed anywhere.
 * 2. THE FORMATTER IS USED. The same chart renders rand amounts and plain
 *    counts, so a raw number would be wrong on one of them.
 * 3. EACH BAR IS A SEPARATE TIP. A chart where every bar shared one bubble would
 *    report the same figure for all of them.
 * 4. THE TIPPED SURFACE IS THE WHOLE COLUMN, not the bar alone, so the pointer
 *    is not asked to hit a narrow bar between wide gaps.
 */
const DATA = [
  { period: "p1", value: 100_000 },
  { period: "p2", value: 140_000 },
  { period: "p3", value: 180_000 },
];

function rand(value: number): string {
  return `R${value.toLocaleString("en-ZA")}`;
}

/** en-ZA groups thousands with a non-breaking space, so the rendered text does
 *  not compare equal to the same string typed with ordinary spaces. */
function plain(text: string | null | undefined): string {
  return (text ?? "").replace(/\u00a0/g, " ");
}

/** The trigger carries its summary as an aria-label, not as text, so it is
 *  queried by role and accessible name rather than by text content. */
function bar(period: string, value: number) {
  return screen.getByRole("img", { name: `${period}: ${rand(value)}` });
}

describe("MiniBarTrend", () => {
  it("gives every bar its own period and figure", () => {
    render(<MiniBarTrend data={DATA} format={rand} />);

    for (const d of DATA) {
      expect(bar(d.period, d.value)).not.toBeNull();
    }
  });

  it("formats values with the caller's formatter", () => {
    render(<MiniBarTrend data={DATA} format={rand} />);

    // The rand formatter must reach the tip content, not just the bar height.
    expect(plain(screen.getByText("R180 000").textContent)).toBe("R180 000");
  });

  it("falls back to a plain grouped number with no formatter", () => {
    render(<MiniBarTrend data={DATA} />);

    // One bubble per bar, so pick the p2 one by its rendered content rather than
    // by accessible name, which does not normalise the non-breaking space.
    const p2 = screen
      .getAllByRole("tooltip")
      .find((b) => plain(b.textContent).includes("p2"));
    expect(p2).toBeDefined();
    expect(plain(p2?.textContent)).toContain("140 000");
  });

  it("makes each column independently tappable", async () => {
    const user = userEvent.setup();
    render(<MiniBarTrend data={DATA} format={rand} />);

    const bubbles = screen.getAllByRole("tooltip");
    expect(bubbles).toHaveLength(DATA.length);

    // Tapping one bar pins only that bar's bubble.
    await user.click(bar("p2", 140_000));

    const pinned = screen
      .getAllByRole("tooltip")
      .filter((b) => b.classList.contains("opacity-100"));
    expect(pinned).toHaveLength(1);
    expect(plain(pinned[0].textContent)).toContain("p2");
    expect(plain(pinned[0].textContent)).toContain("R140 000");
  });

  it("keeps each column filling its slot rather than shrinking to its label", () => {
    const { container } = render(<MiniBarTrend data={DATA} format={rand} />);

    // jsdom performs no layout, so bar widths cannot be measured here. What can
    // be pinned is the cause of a real regression: the tip wrapper is
    // inline-flex by default, so without flex-1 on the wrapper and w-full on the
    // trigger, both size to their own content and every bar renders at roughly
    // the width of its period label instead of filling its column. These two
    // classes are the whole difference between the original bar width and the
    // shrunken one.
    const wrappers = container.querySelectorAll<HTMLElement>(".group\\/tip");
    expect(wrappers).toHaveLength(DATA.length);
    for (const w of wrappers) {
      expect(w.className).toContain("flex-1");
      expect(w.className).toContain("min-w-0");
    }

    const triggers = container.querySelectorAll<HTMLElement>("[tabindex=\"0\"]");
    expect(triggers).toHaveLength(DATA.length);
    for (const t of triggers) {
      expect(t.className).toContain("w-full");
    }
  });

  it("keeps the bar height independent of the tip", () => {
    const { container } = render(<MiniBarTrend data={DATA} format={rand} />);

    // The bar element keeps its percentage height, so wrapping it in a tip did
    // not disturb the layout the comment in the component warns about.
    const bars = container.querySelectorAll<HTMLElement>('[style*="height"]');
    expect(bars).toHaveLength(DATA.length);
    expect(bars[0].style.height).toMatch(/^\d+(\.\d+)?%$/);
  });
});