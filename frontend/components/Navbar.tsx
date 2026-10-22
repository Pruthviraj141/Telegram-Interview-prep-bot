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
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  user?: CandidateUser | null;
}

export const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Interview Studio", href: "/interview", icon: Mic, highlight: true },
    { label: "Resume Profile", href: "/resume", icon: FileText },
    { label: "Job Tracker", href: "/tracker", icon: Briefcase },
    { label: "Company Prep", href: "/company-prep", icon: Building2 },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-slate-200/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <Mic className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-base text-slate-900 tracking-tight">
            AI Interview <span className="text-indigo-600">Coach</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition flex items-center gap-2",
                  active
                    ? "bg-white text-indigo-600 shadow-xs border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60",
                  item.highlight && !active && "text-indigo-600 font-bold"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", active ? "text-indigo-600" : "text-slate-500")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Badges & Mobile Toggle */}
        <div className="flex items-center gap-2.5">
          {user?.groq_key_configured ? (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200/80 rounded-full text-[11px] font-medium text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{user.groq_key_masked || "Groq Connected"}</span>
            </div>
          ) : (
            <Link
              href="/settings"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>Connect Groq Key</span>
            </Link>
          )}

          {user && (
            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 text-xs font-bold">
              {user.display_name ? user.display_name.charAt(0).toUpperCase() : "C"}
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1 shadow-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition",
                  active
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
          {!user?.groq_key_configured && (
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200"
            >
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Connect Groq Key</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
};
