import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { DataStoreProvider, useDataStore, type DataStoreValue } from "../../data/DataStoreContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ToastProvider } from "../common/ToastContext";
import { BusinessDevelopment } from "../../pages/BusinessDevelopment";
import { BD_KPI_IDS } from "../../types/businessDevelopment";

/**
 * End-to-end coverage of the Business Development dashboard: the page opens
 * with KPIs and a health block, the submission loads the demo draft across its
 * seven registers, and submitting recalculates every BD KPI from the rows.
 */

let currentStore: DataStoreValue;

function StoreProbe() {
  const store = useDataStore();
  useEffect(() => {
    currentStore = store;
  }, [store]);
  return null;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/business-development"]}>
      <AuthProvider>
        <ToastProvider>
          <DataStoreProvider>
            <StoreProbe />
            <BusinessDevelopment />
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

describe("Business Development dashboard", () => {
  it("shows the BD KPIs and the health block, not an empty page", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Business Development" })).not.toBeNull();
    expect(screen.getByText("Business Development health")).not.toBeNull();
    expect(screen.getByTestId("bd-section-coverage")).not.toBeNull();
    expect(screen.getByText("Pipeline value")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Submit BD Data" })).not.toBeNull();
  });

  it("submits the demo BD draft and recalculates the BD KPIs from the registers", async () => {
    renderPage();
    await user.click(screen.getByRole("button", { name: "Submit BD Data" }));

    // The demo draft is loaded, so the lead register already holds rows.
    expect(await screen.findByDisplayValue("Kgatelopele Co-op")).not.toBeNull();

    // Walk the seven sections to the review page.
    for (let i = 0; i < 6; i += 1) {
      await user.click(screen.getByRole("button", { name: "Next →" }));
    }
    await user.click(screen.getByRole("button", { name: /Review Submission/ }));
    await screen.findByText(/Review before submitting/);

    const submitButtons = screen.getAllByRole("button", { name: "Submit BD Data" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await screen.findByText("Business Development data submitted");
    await waitFor(() => {
      const pipeline = currentStore.kpis.find((k) => k.id === BD_KPI_IDS.pipelineValue)!;
      expect(pipeline.currentValue).toBe(3800000);
      const active = currentStore.kpis.find((k) => k.id === BD_KPI_IDS.activeOpportunities)!;
      expect(active.currentValue).toBe(7);
      const winRate = currentStore.kpis.find((k) => k.id === BD_KPI_IDS.proposalWinRate)!;
      expect(winRate.currentValue).toBe(50);
      const won = currentStore.kpis.find((k) => k.id === BD_KPI_IDS.newBusinessWon)!;
      expect(won.currentValue).toBe(950000);
    });
    expect(currentStore.bdReports.find((r) => r.status === "Submitted")).toBeDefined();
    expect(currentStore.cycles.some((c) => c.department === "Business Development" && c.status === "Upcoming")).toBe(
      true
    );
  });
});
