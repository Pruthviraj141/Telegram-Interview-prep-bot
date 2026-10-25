import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  FileText,
  History,
  LayoutDashboard,
  Mic,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The practice entry point is the one emphasised destination. */
  emphasis?: boolean;
}

/** Five destinations that fit a 320px bottom bar without truncation. */
export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Practice", href: "/interview", icon: Mic, emphasis: true },
  { label: "Tracker", href: "/tracker", icon: Briefcase },
  { label: "Companies", href: "/company-prep", icon: Building2 },
  { label: "Resume", href: "/resume", icon: FileText },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Past rounds", href: "/history", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
