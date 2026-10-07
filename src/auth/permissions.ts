import type { Role } from "../types";

export interface NavItem {
  path: string;
  label: string;
  shortLabel: string; // compact label for the top pill nav
  roles: Role[]; // roles permitted to see this nav item / page
}

// Section 26/32: role-based navigation. Admin and Executive see everything;
// department roles see their own area plus shared Risk/Actions/Reports views.
export const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Executive Overview", shortLabel: "Overview", roles: ["executive", "admin"] },
  { path: "/finance", label: "Finance", shortLabel: "Finance", roles: ["executive", "finance", "admin"] },
  { path: "/operations", label: "Operations", shortLabel: "Operations", roles: ["executive", "operations", "admin"] },
  { path: "/farming", label: "Commercial Farming", shortLabel: "Farming", roles: ["executive", "farm", "admin"] },
  { path: "/hr", label: "Human Resources", shortLabel: "HR", roles: ["executive", "hr", "admin"] },
  { path: "/marketing", label: "Marketing", shortLabel: "Marketing", roles: ["executive", "marketing", "admin"] },
  { path: "/alumni", label: "Academy & Alumni", shortLabel: "Academy & Alumni", roles: ["executive", "alumni", "admin"] },
  { path: "/business-development", label: "Business Development", shortLabel: "BD", roles: ["executive", "business_development", "admin"] },
  {
    path: "/risk-centre",
    label: "Early Warning / Risk Centre",
    shortLabel: "Risk Centre",
    roles: ["executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "business_development", "admin"],
  },
  {
    path: "/actions",
    label: "Corrective Actions",
    shortLabel: "Actions",
    roles: ["executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "business_development", "admin"],
  },
  {
    path: "/reports",
    label: "Reports",
    shortLabel: "Reports",
    roles: ["executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "business_development", "admin"],
  },
  {
    path: "/data",
    label: "Data / Submissions",
    shortLabel: "Data",
    roles: ["executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "business_development", "admin"],
  },
  { path: "/admin", label: "Administration", shortLabel: "Settings", roles: ["admin"] },
];

export function canAccess(role: Role, path: string): boolean {
  const item = NAV_ITEMS.find((n) => n.path === path);
  if (!item) return true;
  return item.roles.includes(role);
}

// Where to land a role right after login - normally the first NAV_ITEMS
// entry that role is actually permitted to see. Executive Overview is
// executive/admin-only, so department roles need their own department page
// as home, or they'd land on "/" and immediately hit the access-denied wall.
//
// The "first permitted entry" rule is not enough on its own: a role that is
// also allowed into another department's page would land there instead of on
// its own dashboard. That is what Business Development hit - it was permitted
// into Academy & Alumni, which is listed before its own page, so Thabo Molefe
// logged straight into Grace Mokoena's dashboard. (That access has since been
// removed: entering an Academy submission belongs to Grace.) The override is
// kept so a later permission change cannot quietly move another department's
// dashboard back in front of this role.
const ROLE_HOME_OVERRIDES: Partial<Record<Role, string>> = {
  business_development: "/business-development",
};

export function getHomePath(role: Role): string {
  const override = ROLE_HOME_OVERRIDES[role];
  if (override) return override;
  const item = NAV_ITEMS.find((n) => n.roles.includes(role));
  return item?.path ?? "/login";
}

// PII visibility rules (Section 27/35 - learner, alumni and employee
// personal information) are not yet defined per-role. TO CONFIRM.
export function canViewPII(_role: Role): boolean {
  return true;
}
