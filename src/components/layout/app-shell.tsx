"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Award, BarChart3, BookOpen, Flame, GraduationCap, Languages, LayoutDashboard,
  LogOut, Menu, Mic, MessageSquareText, Moon, PenLine, Repeat, Settings, Sun,
  Swords, Trophy, X, Zap,
} from "lucide-react";

import { LevelPill, Progress } from "@/components/ui";
import { api } from "@/lib/client";
import { cn, formatNumber, initials } from "@/lib/utils";
import type { Cefr } from "@prisma/client";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  cefrLevel: Cefr;
  xpTotal: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streakCurrent: number;
  dueCount: number;
  dailyGoalXp: number;
  xpToday: number;
}

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: typeof Zap; badge?: "due" }[] }[] = [
  {
    label: "Learn",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/path", label: "Learning paths", icon: BookOpen },
      { href: "/review", label: "Review", icon: Repeat, badge: "due" },
      { href: "/lexicon", label: "Lexicon", icon: Languages },
    ],
  },
  {
    label: "Practise",
    items: [
      { href: "/tutor", label: "Conversation", icon: MessageSquareText },
      { href: "/debate", label: "Debate", icon: Swords },
      { href: "/writing", label: "Writing studio", icon: PenLine },
      { href: "/pronunciation", label: "Pronunciation", icon: Mic },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/exams", label: "Exam prep", icon: GraduationCap },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/achievements", label: "Achievements", icon: Award },
    ],
  },
];

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer on navigation — otherwise it stays open over the new page
  // on mobile, which reads as the tap not having worked.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Escape closes the drawer; a focus trap would be overkill for a nav that
  // also closes on navigation, but dismissal must be keyboard-reachable.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  async function signOut() {
    await api.post("/api/auth/logout").catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const goalProgress = Math.min(1, user.xpToday / Math.max(1, user.dailyGoalXp));

  return (
    <div className="min-h-dvh flex">
      {/* ---------------------------------------------------------- Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 flex flex-col",
          "bg-[var(--surface-raised)] border-r border-[var(--border)]",
          "transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border)] shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold">
            <span className="size-8 rounded-lg bg-brand-600 text-white grid place-items-center text-sm font-bold">
              Lx
            </span>
            <span>Lexicon</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 -mr-2 rounded-lg hover:bg-[var(--surface-sunken)]"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Daily goal — the single most important number on the screen */}
        <div className="px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium muted uppercase tracking-wide">Today</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-warning tabular-nums">
              <Flame className="size-3.5" aria-hidden />
              {user.streakCurrent}
              <span className="sr-only">day streak</span>
            </span>
          </div>
          <Progress
            value={goalProgress}
            tone={goalProgress >= 1 ? "success" : "brand"}
            label={`${user.xpToday} / ${user.dailyGoalXp} XP`}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <h2 className="px-3 mb-1.5 text-[11px] font-semibold muted uppercase tracking-wider">
                {group.label}
              </h2>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const showBadge = item.badge === "due" && user.dueCount > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          active
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                            : "muted hover:text-[var(--text)] hover:bg-[var(--surface-sunken)]",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        {showBadge && (
                          <span className="px-1.5 py-0.5 rounded-full bg-brand-600 text-white text-[10px] font-bold tabular-nums">
                            {user.dueCount > 99 ? "99+" : user.dueCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-[var(--border)] shrink-0">
          <Link
            href="/settings"
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <div className="size-9 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 grid place-items-center text-sm font-semibold shrink-0">
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="flex items-center gap-1.5 text-xs muted">
                <LevelPill level={user.cefrLevel} />
                <span className="tabular-nums">Lv {user.level}</span>
              </div>
            </div>
            <Settings className="size-4 muted shrink-0" aria-hidden />
          </Link>
          <button
            onClick={signOut}
            className="mt-1 w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ------------------------------------------------------------- Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--surface-raised)]/80 backdrop-blur sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--surface-sunken)]"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-brand-500 tabular-nums">
              <Zap className="size-4" aria-hidden />
              {formatNumber(user.xpTotal)}
              <span className="sr-only">total XP</span>
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Cycles light → dark → system, writing the same keys ThemeScript reads. */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    const stored = localStorage.getItem("lx-theme");
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  function apply(next: "light" | "dark" | "system") {
    setTheme(next);
    localStorage.setItem("lx-theme", next);
    const resolved =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const labels = { light: "Light", dark: "Dark", system: "System" };

  return (
    <button
      onClick={() => apply(next)}
      className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
      aria-label={`Theme: ${labels[theme]}. Switch to ${labels[next].toLowerCase()}.`}
      title={`Theme: ${labels[theme]}`}
    >
      {theme === "dark" ? (
        <Moon className="size-[18px]" />
      ) : theme === "light" ? (
        <Sun className="size-[18px]" />
      ) : (
        <div className="relative size-[18px]">
          <Sun className="absolute inset-0 size-[18px] dark:hidden" />
          <Moon className="absolute inset-0 size-[18px] hidden dark:block" />
        </div>
      )}
    </button>
  );
}
