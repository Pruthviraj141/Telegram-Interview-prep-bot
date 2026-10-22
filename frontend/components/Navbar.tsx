"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandidateUser } from "@/lib/api";
import {
  Mic,
  LayoutDashboard,
  Briefcase,
  Building2,
  Settings,
  ShieldCheck,
  KeyRound,
  Menu,
  X,
  FileText,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  user?: CandidateUser | null;
}

export const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainNavItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Studio", href: "/interview", icon: Mic, highlight: true },
    { label: "Tracker", href: "/tracker", icon: Briefcase },
    { label: "Prep", href: "/company-prep", icon: Building2 },
    { label: "Resume", href: "/resume", icon: FileText },
  ];

  const secondaryNavItems = [
    { label: "Past Sessions", href: "/history", icon: ChevronRight },
    { label: "Groq Settings", href: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-[#F4F1EA]/92 backdrop-blur-md border-b border-[#E8E5DD] transition-all">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#20232C] text-[#F4F1EA] flex items-center justify-center shadow-xs transition-transform duration-150 group-hover:scale-105">
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F4F1EA]" />
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[#20232C] tracking-tight">
              AI Interview Coach
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {[...mainNavItems, { label: "Settings", href: "/settings", icon: Settings }].map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-medium tracking-tight transition-all duration-150 flex items-center gap-1.5",
                    active
                      ? "bg-white text-[#20232C] font-semibold shadow-xs border border-[#E8E5DD]"
                      : "text-slate-600 hover:text-[#20232C] hover:bg-black/[0.03]",
                    item.highlight && !active && "text-[#4F46E5] font-semibold"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", active ? "text-[#20232C]" : "text-slate-400")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Badges & Action Buttons */}
          <div className="flex items-center gap-2">
            {user?.groq_key_configured ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E8E5DD] rounded-full text-[10px] sm:text-[11px] font-medium text-slate-700 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="hidden sm:inline">{user.groq_key_masked || "Groq Active"}</span>
                <span className="sm:hidden">Groq</span>
              </div>
            ) : (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] sm:text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition shadow-xs"
              >
                <KeyRound className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Setup Key</span>
                <span className="sm:hidden">Key</span>
              </Link>
            )}

            <Link
              href="/settings"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border border-[#E8E5DD] flex items-center justify-center text-xs font-semibold text-[#20232C] shadow-xs hover:border-slate-300 transition"
              title="Profile & Settings"
            >
              {(user?.display_name || user?.email || "C")[0].toUpperCase()}
            </Link>

            {/* Mobile Sheet Toggle for secondary links */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center text-slate-700 hover:text-black hover:bg-black/[0.04] rounded-lg transition"
              aria-label="Toggle Secondary Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Sheet for More Links */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#E8E5DD] bg-[#F4F1EA] px-4 pt-2 pb-4 space-y-1 shadow-lg animate-in slide-in-from-top-1 duration-150">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
              Navigation & Records
            </div>
            {[...mainNavItems, ...secondaryNavItems].map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition min-h-[44px]",
                    active
                      ? "bg-white text-[#20232C] font-semibold border border-[#E8E5DD] shadow-xs"
                      : "text-slate-600 hover:bg-black/[0.03] hover:text-[#20232C]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("w-4 h-4", active ? "text-[#20232C]" : "text-slate-400")} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar (Fixed 5-Tab Bar, pb-safe for iPhone home bar) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#F4F1EA]/96 backdrop-blur-lg border-t border-[#E8E5DD] pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.03)]"
      >
        <div className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-colors relative",
                  active ? "text-[#20232C]" : "text-slate-400 hover:text-slate-600"
                )}
              >
                {/* Active Indicator Top Pill */}
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 bg-[#20232C] rounded-full" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-xl transition-transform",
                    item.highlight && active && "bg-[#20232C] text-white",
                    item.highlight && !active && "text-[#4F46E5]"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={cn(
                    "text-[10px] tracking-tight leading-none mt-0.5",
                    active ? "font-semibold text-[#20232C]" : "font-medium text-slate-500"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};
