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
  { path: "/", label: "Executive Overview", shortLabel: "Overview", roles: ["board", "executive", "admin"] },
  { path: "/finance", label: "Finance", shortLabel: "Finance", roles: ["executive", "finance", "admin"] },
  { path: "/operations", label: "Operations", shortLabel: "Operations", roles: ["executive", "operations", "admin"] },
  { path: "/farming", label: "Commercial Farming", shortLabel: "Farming", roles: ["executive", "farm", "admin"] },
  { path: "/hr", label: "Human Resources", shortLabel: "HR", roles: ["executive", "hr", "admin"] },
  { path: "/marketing", label: "Marketing", shortLabel: "Marketing", roles: ["executive", "marketing", "admin"] },
  { path: "/alumni", label: "Alumni", shortLabel: "Alumni", roles: ["executive", "alumni", "admin"] },
  {
    path: "/risk-centre",
    label: "Early Warning / Risk Centre",
    shortLabel: "Risk Centre",
    roles: ["board", "executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "admin"],
  },
  {
    path: "/actions",
    label: "Corrective Actions",
    shortLabel: "Actions",
    roles: ["executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "admin"],
  },
  {
    path: "/reports",
    label: "Reports",
    shortLabel: "Reports",
    roles: ["board", "executive", "finance", "operations", "farm", "hr", "marketing", "alumni", "admin"],
  },
  { path: "/admin", label: "Administration", shortLabel: "Settings", roles: ["admin"] },
];

export function canAccess(role: Role, path: string): boolean {
  const item = NAV_ITEMS.find((n) => n.path === path);
  if (!item) return true;
  return item.roles.includes(role);
}

// Board members must not see individual staff/student PII (Section 27).
export function canViewPII(role: Role): boolean {
  return role !== "board";
}
