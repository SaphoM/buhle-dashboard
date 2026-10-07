import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext";
import { MobileNavDrawer } from "./MobileNavDrawer";

/**
 * The mobile navigation drawer.
 *
 * What is pinned here, and why each one is a real requirement rather than a
 * detail:
 *
 * 1. CLOSED BY DEFAULT. A drawer that renders open on load covers the dashboard
 *    the user came to see, and on a phone there is no way to scroll past it.
 *
 * 2. EVERY DESTINATION IS REACHABLE. This is the whole reason the drawer exists.
 *    The desktop pill bar holds a dozen tabs and scrolls; on a phone those tabs
 *    were two wide with no reliable way to reach Human Resources. So the test
 *    asserts an executive user's full set is present, not a subset.
 *
 * 3. FULL LABELS, NOT ABBREVIATIONS. "Human Resources" fits in a drawer row and
 *    "HR" does not explain itself to someone who has not used the desktop nav.
 *    Asserted on the long name specifically, since that is the one the pill bar
 *    abbreviated away.
 *
 * 4. IT CLOSES AFTER YOU CHOOSE. Leaving it open hides the page just selected,
 *    which is the failure mode a slide-out menu is most likely to have.
 *
 * 5. IT CLOSES WITHOUT A NAVIGATION. The scrim is the biggest touch target on a
 *    phone and dismissing a menu is most often an accident that needs undoing.
 *
 * 6. ESCAPE CLOSES IT. A drawer with no keyboard exit traps anyone not using a
 *    mouse, which is a genuine accessibility failure and not a nicety.
 *
 * 7. ROLE SCOPING IS NOT LOST. A Finance user must not find Alumni or Marketing
 *    in the menu just because the drawer is the new navigation surface.
 */

function SignIn({ userId = "u2" }: { userId?: string }) {
  const { login } = useAuth();
  useEffect(() => {
    login(userId);
  }, [login, userId]);
  return null;
}

/** Navigating with a link inside the drawer requires a router; the landing
 *  page stands in for whatever the user actually came from. */
function Page() {
  return <h1>Dashboard page</h1>;
}

function renderDrawer(userId = "u2") {
  return render(
    <AuthProvider>
      <SignIn userId={userId} />
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<Page />} />
        </Routes>
        <MobileNavDrawer />
      </MemoryRouter>
    </AuthProvider>
  );
}

function openButton() {
  return screen.getByRole("button", { name: "Open navigation menu" });
}

function drawer() {
  return screen.getByRole("dialog", { name: "Navigation menu" });
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(openButton());
  return drawer();
}

describe("MobileNavDrawer", () => {
  it("is closed until the hamburger is pressed", () => {
    renderDrawer();

    expect(openButton()).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
    // The page underneath is reachable without any interaction at all.
    expect(screen.getByText("Dashboard page")).not.toBeNull();
  });

  it("exposes every destination a role can reach, in full", async () => {
    const user = userEvent.setup();
    renderDrawer();
    const panel = await open(user);

    // An executive sees the widest set, so this is the case that would catch a
    // destination being dropped from the drawer.
    const expected = [
      "Executive Overview",
      "Finance",
      "Operations",
      "Commercial Farming",
      "Human Resources",
      "Marketing",
      "Academy & Alumni",
      "Early Warning / Risk Centre",
      "Corrective Actions",
      "Reports",
    ];

    for (const label of expected) {
      expect(within(panel).getByRole("link", { name: label })).not.toBeNull();
    }

    // "HR" is what the pill bar showed; the drawer spells it out.
    expect(within(panel).queryByRole("link", { name: "HR" })).toBeNull();
  });

  it("closes after choosing a destination", async () => {
    const user = userEvent.setup();
    renderDrawer();
    const panel = await open(user);

    await user.click(within(panel).getByRole("link", { name: "Academy & Alumni" }));

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });

  it("closes when the backdrop is tapped, without navigating", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await open(user);

    // The scrim is the dismiss affordance a thumb actually lands on. It is
    // aria-hidden, so it is targeted by test id rather than by role.
    await user.click(screen.getByTestId("mobile-nav-scrim"));

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
    expect(screen.getByText("Dashboard page")).not.toBeNull();
  });

  it("closes when the destination is the page already open", async () => {
    const user = userEvent.setup();
    renderDrawer();
    const panel = await open(user);

    // "/dashboard" is a different path from the initial "/", so pick the link
    // for the current route to make the pathname genuinely unchanged.
    await user.click(within(panel).getByRole("link", { name: "Executive Overview" }));

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });

  it("closes from the labelled close button", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await open(user);

    // The scrim is aria-hidden, so this header button is the only dismiss
    // control a screen reader is told about.
    await user.click(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await open(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });

  it("does not offer a Finance user the departments they cannot see", async () => {
    const user = userEvent.setup();
    renderDrawer("u3"); // Finance
    const panel = await open(user);

    expect(within(panel).getByRole("link", { name: "Finance" })).not.toBeNull();
    expect(within(panel).queryByRole("link", { name: "Marketing" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "Academy & Alumni" })).toBeNull();
    // Still available to everyone.
    expect(within(panel).getByRole("link", { name: "Reports" })).not.toBeNull();
  });
});