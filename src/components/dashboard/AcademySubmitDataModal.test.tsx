import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { Alumni } from "../../pages/Alumni";
import { ACADEMY_KPI_IDS } from "../../types/academy";

/**
 * End-to-end coverage of the combined Academy & Alumni page: both dashboards
 * are reachable from one page, and the Academy submission opens on the demo
 * draft and flows through to the KPIs when submitted.
 */

let currentStore: DataStoreValue;

function StoreProbe() {
  const store = useDataStore();
  useEffect(() => {
    currentStore = store;
  }, [store]);
  return null;
}

function renderPage(initialPath = "/alumni") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ToastProvider>
          <DataStoreProvider>
            <StoreProbe />
            <Alumni />
          </DataStoreProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe("Academy & Alumni page", () => {
  it("shows Academy by default and switches to Alumni", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Academy & Alumni" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Academy" })).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: "Alumni" }));
    expect(screen.getByRole("heading", { level: 2, name: "Alumni" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Submit Alumni Data" })).not.toBeNull();
  });

  it("lands on Alumni from ?view=alumni", () => {
    renderPage("/alumni?view=alumni");
    expect(screen.getByRole("tab", { name: "Alumni" }).getAttribute("aria-selected")).toBe("true");
  });

  it("submits the demo Academy draft and recalculates the Academy KPIs", async () => {
    renderPage();
    await user.click(screen.getByRole("button", { name: "Submit Academy Data" }));

    // The demo draft is loaded, so the programme register already holds rows.
    expect(await screen.findByDisplayValue("Plant Production NQF 2")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /^Certification/ }));
    await user.click(screen.getByRole("button", { name: /Review Submission/ }));
    // The page header button carries the same label, so take the modal's own.
    await screen.findByText(/Review before submitting/);
    const submitButtons = screen.getAllByRole("button", { name: "Submit Academy Data" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await screen.findByText("Academy data submitted");
    await waitFor(() => {
      const fill = currentStore.kpis.find((k) => k.id === ACADEMY_KPI_IDS.intakeFillRate)!;
      expect(fill.currentValue).toBe(88.8);
      expect(fill.dataAvailable).toBe(true);
    });
    expect(currentStore.academyReports.find((r) => r.status === "Submitted")).toBeDefined();
    expect(currentStore.cycles.some((c) => c.department === "Academy" && c.status === "Upcoming")).toBe(true);
  });
});
