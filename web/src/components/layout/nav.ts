import {
  Boxes,
  FlaskConical,
  History,
  LayoutDashboard,
  ListChecks,
  Tags,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Studio",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/questions", label: "Questions", icon: ListChecks },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { to: "/label", label: "Label", icon: Tags },
      { to: "/train", label: "Train", icon: TrendingUp },
      { to: "/models", label: "Models & Playground", icon: Boxes },
    ],
  },
  {
    label: "Operate",
    items: [
      { to: "/evaluate", label: "Evaluate", icon: FlaskConical },
      { to: "/jobs", label: "Jobs", icon: History },
    ],
  },
];

export function isCurrent(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** The nav entry matching the current path, for the header breadcrumb. */
export function currentNavItem(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) => isCurrent(pathname, item.to));
}
