"use client";

import { useEffect, useState } from "react";
import {
  addMonths,
  monthGrid,
  toDateKey,
  WEEKDAY_LABELS,
} from "@/lib/dates";
import {
  dayColor,
  dayStatusKind,
  DAY_COLOR_HEX,
  type DayStatusKind,
} from "@/lib/day-status";
import { ensureProfile, getMonthTotals } from "@/lib/db";
import type { DayColor, DayTotals, Profile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppMark } from "./AppNav";
import { SettingsGear } from "./SettingsGear";
import { MacroRow } from "./MacroRow";
import { useLocale } from "./LocaleProvider";
import { useAppClock } from "@/lib/use-app-clock";

function statusLabel(
  color: DayColor,
  t: (key: DayStatusKind) => string,
) {
  return t(dayStatusKind(color));
}

export function CalendarMonth() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totals, setTotals] = useState<Record<string, DayTotals>>({});
  const [ready, setReady] = useState(false);
  const now = useAppClock();
  const today = toDateKey(now);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await ensureProfile();
      const monthTotals = await getMonthTotals(
        cursor.getFullYear(),
        cursor.getMonth(),
      );
      if (!cancelled) {
        setProfile(p);
        setTotals(monthTotals);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor, today]);

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const todayTotals = totals[today];
  const todayColor: DayColor = dayColor(todayTotals, profile, {
    date: today,
    now,
  });
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";

  const monthLabel = cursor.toLocaleDateString(dateLocale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div>
          <AppMark size="sm" />
          <h1 className="display mt-1 text-3xl capitalize text-[var(--brand)]">
            {monthLabel}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost px-3"
            aria-label="Previous month"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3"
            aria-label="Next month"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            ›
          </button>
          <SettingsGear />
        </div>
      </header>

      <section className="panel p-4">
        <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-[var(--ink-muted)]">
          {WEEKDAY_LABELS.map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((key, i) => {
            if (!key) return <div key={`empty-${i}`} />;
            const color = dayColor(totals[key], profile, { date: key, now });
            const dayNum = Number(key.slice(-2));
            return (
              <button
                key={key}
                type="button"
                className="day-dot"
                data-color={color}
                data-today={key === today}
                aria-label={`${key}, ${color}`}
                onClick={() => router.push(`/day/${key}`)}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel p-4">
        {!ready || !profile ? (
          <p className="text-[var(--ink-muted)]">{t("loading")}</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="display text-xl capitalize">
                {new Date(today + "T12:00:00").toLocaleDateString(dateLocale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h2>
              <span
                className="status-pill"
                style={{ background: DAY_COLOR_HEX[todayColor] }}
              >
                {statusLabel(todayColor, t)}
              </span>
            </div>

            <MacroRow
              calories={todayTotals ? todayTotals.calories : 0}
              proteinG={todayTotals ? todayTotals.proteinG : 0}
              carbsG={todayTotals ? todayTotals.carbsG : 0}
              fatG={todayTotals ? todayTotals.fatG : 0}
              profile={profile}
              labels={{
                kcal: t("macroKcal"),
                prot: t("macroProt"),
                carbo: t("macroCarbo"),
                fat: t("macroFat"),
              }}
            />

            <Link href={`/day/${today}`} className="btn btn-primary mt-4 w-full">
              {t("openJournal")}
            </Link>
          </>
        )}
      </section>

      <p className="text-center text-xs text-[var(--ink-muted)]">
        {t("calendarHint")}
      </p>
    </div>
  );
}
