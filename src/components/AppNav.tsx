"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useLocale } from "./LocaleProvider";

const STORAGE_KEY = "calorie-tracker-nav-collapsed";

let collapsedMemory = false;
let hydrated = false;
const listeners = new Set<() => void>();

function readCollapsed() {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    collapsedMemory = window.localStorage.getItem(STORAGE_KEY) === "1";
  }
  return collapsedMemory;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeCollapsed(value: boolean) {
  collapsedMemory = value;
  hydrated = true;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  listeners.forEach((listener) => listener());
}

function current(pathname: string, href: string): "page" | undefined {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/day") ? "page" : undefined;
  }
  return pathname === href ? "page" : undefined;
}

function JournalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HabitsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.4 6.4l1.4 1.4M16.2 16.2l1.4 1.4M17.6 6.4l-1.4 1.4M7.8 16.2l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppMark({ size = "md" }: { size?: "md" | "sm" }) {
  const { t } = useLocale();
  return (
    <span className={size === "sm" ? "app-mark app-mark-sm" : "app-mark"}>
      <img src="/icons/apple-touch-icon.png" alt="" width={32} height={32} />
      <span className="app-mark-word">{t("brand")}</span>
    </span>
  );
}

export function AppNav() {
  const { t } = useLocale();
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const links = [
    { href: "/", label: t("navJournal"), icon: <JournalIcon /> },
    { href: "/habits", label: t("navHabits"), icon: <HabitsIcon /> },
    { href: "/settings", label: t("navSettings"), icon: <SettingsIcon /> },
  ];

  return (
    <nav
      className="nav-rail"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={t("brand")}
    >
      <div className="nav-top">
        <AppMark />
        <button
          type="button"
          className="nav-collapse"
          data-tooltip={collapsed ? t("navExpand") : t("navCollapse")}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("navExpand") : t("navCollapse")}
          onClick={() => writeCollapsed(!collapsed)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="4" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      <div className="nav-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={current(pathname, link.href)}
            title={link.label}
          >
            {link.icon}
            <span className="nav-label">{link.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
