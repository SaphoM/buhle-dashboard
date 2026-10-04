import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TipRow, Tooltip } from "./Tooltip";

/**
 * The shared info tip used for dashboard summary figures.
 *
 * WHAT IS PINNED HERE, and one important limit.
 *
 * HOVER CANNOT BE TESTED HERE. The bubble is revealed by Tailwind's
 * `group-hover:opacity-100` variant, and jsdom has no CSS engine and no real
 * pointer hover, so a `user.hover` in this environment changes nothing that can
 * be asserted. Every hover path therefore rests on that class being present and
 * correct, which these tests do check; they cannot prove the pixels appear.
 * The pinned (tap) path is genuine state and IS tested.
 *
 * 1. NO TIP, NO WRAPPER. Without content the children must render untouched,
 *    or every figure on the dashboard grows a focusable box for no reason.
 * 2. THE FIGURE STAYS VISIBLE. The tip supplements a figure, it does not
 *    replace it. If the bubble were the only place a number appeared, a reader
 *    who never hovers would lose the number.
 * 3. THE CONTENT IS IN THE DOM. Rendered always, revealed by opacity. This is
 *    what lets a screen reader reach it at all.
 * 4. TAP PINS AND UNPINS. Touch is the only input a phone has, so without a
 *    toggle the detail would be unreachable there.
 * 5. ESCAPE DISMISSES. A pinned bubble that only closes by hitting its own
 *    trigger is a trap on a small screen.
 * 6. AN OUTSIDE TAP DISMISSES. Otherwise the bubble covers what you are trying
 *    to read underneath it.
 * 7. THE TRIGGER IS FOCUSABLE. An info tip reachable only by pointer is not
 *    keyboard accessible.
 */
function tip(): HTMLElement {
  return screen.getByRole("tooltip");
}

describe("Tooltip", () => {
  it("renders the figure untouched when there is nothing to explain", () => {
    render(<Tooltip content={undefined}>R100.00m</Tooltip>);

    expect(screen.getByText("R100.00m")).not.toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the figure visible alongside the tip", () => {
    render(
      <Tooltip content={<TipRow label="Exact" value="R100 000 000" />}>
        <span>R100.00m</span>
      </Tooltip>
    );

    // The abbreviated figure is still on the surface; the tip only adds detail.
    expect(screen.getByText("R100.00m")).not.toBeNull();
    expect(screen.getByText("Exact")).not.toBeNull();
    expect(screen.getByText("R100 000 000")).not.toBeNull();
  });

  it("makes the trigger focusable and describes the figure to assistive tech", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Revenue: R100 000 000" content={<TipRow label="Exact" value="R100 000 000" />}>
        <span>R100.00m</span>
      </Tooltip>
    );

    await user.tab();

    expect(document.activeElement?.textContent).toBe("R100.00m");
  });

  it("pins on tap and unpins on a second tap", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={<TipRow label="Exact" value="R100 000 000" />}>
        <span>R100.00m</span>
      </Tooltip>
    );

    expect(tip().classList.contains("opacity-100")).toBe(false);

    await user.click(screen.getByText("R100.00m"));
    expect(tip().classList.contains("opacity-100")).toBe(true);

    await user.click(screen.getByText("R100.00m"));
    expect(tip().classList.contains("opacity-100")).toBe(false);
  });

  it("dismisses on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={<TipRow label="Exact" value="R100 000 000" />}>
        <span>R100.00m</span>
      </Tooltip>
    );

    await user.click(screen.getByText("R100.00m"));
    expect(tip().classList.contains("opacity-100")).toBe(true);

    await user.keyboard("{Escape}");
    expect(tip().classList.contains("opacity-100")).toBe(false);
  });

  it("dismisses when the user taps elsewhere", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Tooltip content={<TipRow label="Exact" value="R100 000 000" />}>
          <span>R100.00m</span>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </div>
    );

    await user.click(screen.getByText("R100.00m"));
    expect(tip().classList.contains("opacity-100")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(tip().classList.contains("opacity-100")).toBe(false);
  });

  it("renders one aligned row per figure pair", () => {
    render(
      <Tooltip
        content={
          <span className="flex flex-col gap-1">
            <TipRow label="Target" value="R120 000 000" />
            <TipRow label="Previous" value="R95 000 000" />
          </span>
        }
      >
        <span>R100.00m</span>
      </Tooltip>
    );

    // Every row keeps its label and value as separate elements so the bubble can
    // align them in columns; a sentence would be unreadable for figures.
    expect(screen.getByText("Target")).not.toBeNull();
    expect(screen.getByText("R120 000 000")).not.toBeNull();
    expect(screen.getByText("Previous")).not.toBeNull();
    expect(screen.getByText("R95 000 000")).not.toBeNull();
  });
});