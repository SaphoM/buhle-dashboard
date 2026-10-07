import { describe, expect, it } from "vitest";
import { NAV_ITEMS, canAccess, getHomePath } from "./permissions";
import type { Role } from "../types";

const ROLES: Role[] = [
  "executive",
  "department_manager",
  "finance",
  "operations",
  "farm",
  "hr",
  "marketing",
  "alumni",
  "business_development",
  "admin",
];

/**
 * Regression coverage for the post-login landing page. A department role must
 * land on ITS OWN dashboard: Business Development sits after Academy & Alumni
 * in NAV_ITEMS and is permitted into both, so the "first permitted entry" rule
 * alone sent Thabo Molefe to Grace Mokoena's dashboard.
 */
describe("post-login landing page", () => {
  it("sends the Business Development role to the Business Development dashboard", () => {
    expect(getHomePath("business_development")).toBe("/business-development");
    expect(canAccess("business_development", "/business-development")).toBe(true);
  });

  it("lands every role on a page that role can actually open", () => {
    for (const role of ROLES) {
      const home = getHomePath(role);
      // A role with no navigation access at all falls back to the login screen.
      if (home === "/login") continue;
      expect(canAccess(role, home), `${role} cannot open its own home ${home}`).toBe(true);
    }
  });

  it("keeps each department role on its own department", () => {
    expect(getHomePath("executive")).toBe("/");
    expect(getHomePath("finance")).toBe("/finance");
    expect(getHomePath("operations")).toBe("/operations");
    expect(getHomePath("farm")).toBe("/farming");
    expect(getHomePath("hr")).toBe("/hr");
    expect(getHomePath("marketing")).toBe("/marketing");
    expect(getHomePath("alumni")).toBe("/alumni");
    expect(getHomePath("business_development")).toBe("/business-development");
    expect(getHomePath("admin")).toBe("/");
  });

  it("keeps Academy & Alumni out of the Business Development role", () => {
    // Entering an Academy or Alumni submission is Grace Mokoena's; opening the
    // page is what grants it, so the role must not be listed for it.
    expect(canAccess("alumni", "/alumni")).toBe(true);
    expect(canAccess("executive", "/alumni")).toBe(true);
    expect(canAccess("admin", "/alumni")).toBe(true);
    expect(canAccess("business_development", "/alumni")).toBe(false);
    // The shared pages stay open to BD.
    for (const shared of ["/risk-centre", "/actions", "/reports", "/data"]) {
      expect(canAccess("business_development", shared)).toBe(true);
    }
  });

  it("never lands a department role on the access-denied Executive Overview", () => {
    for (const role of ROLES) {
      if (role === "executive" || role === "admin") continue;
      const home = getHomePath(role);
      if (home === "/login") continue;
      expect(home).not.toBe("/");
      // Shared pages are never a department home either.
      const shared = NAV_ITEMS.filter((n) => ["/risk-centre", "/actions", "/reports", "/data"].includes(n.path)).map(
        (n) => n.path
      );
      expect(shared).not.toContain(home);
    }
  });
});
