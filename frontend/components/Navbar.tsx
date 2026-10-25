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
    { label: "Practice", href: "/interview", icon: Mic, highlight: true },
    { label: "Tracker", href: "/tracker", icon: Briefcase },
    { label: "Companies", href: "/company-prep", icon: Building2 },
    { label: "Resume", href: "/resume", icon: FileText },
  ];

  const secondaryNavItems = [
    { label: "Past Rounds", href: "/history", icon: ChevronRight },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E6E6E4] transition-all">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#202124] text-white flex items-center justify-center shadow-xs transition-transform duration-150 group-hover:scale-105">
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="font-semibold text-xs sm:text-sm text-[#202124] tracking-tight">
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
                      ? "bg-[#F7F7F5] text-[#202124] font-semibold border border-[#E6E6E4]"
                      : "text-[#5F6368] hover:text-[#202124] hover:bg-black/[0.03]",
                    item.highlight && !active && "text-[#C4744B] font-medium"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", active ? "text-[#202124]" : "text-[#80868B]")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Badges & Action Buttons */}
          <div className="flex items-center gap-2">
            {user?.groq_key_configured ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FAF2ED] border border-[#EED9CC] rounded-full text-[10px] sm:text-[11px] font-medium text-[#B3582A] shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C4744B]" />
                <span className="hidden sm:inline">{user.groq_key_masked || "Groq Active"}</span>
                <span className="sm:hidden">Groq</span>
              </div>
            ) : (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FAF2ED] border border-[#EED9CC] rounded-full text-[10px] sm:text-[11px] font-medium text-[#B3582A] hover:bg-[#F5E7DF] transition shadow-xs"
              >
                <KeyRound className="w-3 h-3 text-[#C4744B]" />
                <span className="hidden sm:inline">Setup Key</span>
                <span className="sm:hidden">Key</span>
              </Link>
            )}

            <Link
              href="/settings"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-xs font-semibold text-[#202124] shadow-xs hover:border-[#D4D4D0] transition"
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
          <div className="md:hidden border-b border-[#E6E6E4] bg-white px-4 pt-2 pb-4 space-y-1 shadow-lg animate-in slide-in-from-top-1 duration-150">
            <div className="text-[11px] font-semibold text-[#80868B] uppercase tracking-wider px-2 py-1">
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
                      ? "bg-[#F7F7F5] text-[#202124] font-semibold border border-[#E6E6E4] shadow-xs"
                      : "text-[#5F6368] hover:bg-black/[0.03] hover:text-[#202124]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("w-4 h-4", active ? "text-[#202124]" : "text-[#80868B]")} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#80868B]" />
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar (Fixed 5-Tab Bar, pb-safe for iPhone home bar) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-[#E6E6E4] pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.03)]"
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
                  active ? "text-[#202124]" : "text-[#80868B] hover:text-[#202124]"
                )}
              >
                {/* Active Indicator Top Pill */}
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 bg-[#C4744B] rounded-full" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-xl transition-transform",
                    item.highlight && active && "bg-[#202124] text-white",
                    item.highlight && !active && "text-[#C4744B]"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={cn(
                    "text-[10px] tracking-tight leading-none mt-0.5",
                    active ? "font-semibold text-[#202124]" : "font-medium text-[#5F6368]"
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
