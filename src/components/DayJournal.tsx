"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/dates";
import { dayColor, dayStatusKind, DAY_COLOR_HEX } from "@/lib/day-status";
import {
  addFoodEntry,
  addSnack,
  deleteFoodEntry,
  deleteMeal,
  ensureDefaultMeals,
  ensureProfile,
  getDayTotals,
  getEntriesForMeals,
} from "@/lib/db";
import type { DayTotals, FoodEntry, Meal, MealType, Profile } from "@/lib/types";
import { AddFoodModal, type FoodDraft } from "./AddFoodModal";
import { SavedMealsModal } from "./SavedMealsModal";
import { VoiceLog } from "./VoiceLog";
import { MacroRow } from "./MacroRow";
import { SettingsGear } from "./SettingsGear";
import { useLocale } from "./LocaleProvider";
import { mealAutoCollapsed } from "@/lib/meal-collapse";
import { useAppClock } from "@/lib/use-app-clock";

interface Props {
  date: string;
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 7l.8 12.2a1.2 1.2 0 0 0 1.2 1.1h6a1.2 1.2 0 0 0 1.2-1.1L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function mealTitle(
  meal: Meal,
  t: (key: "breakfast" | "lunch" | "dinner" | "snack") => string,
) {
  if (meal.type === "snack") return meal.name;
  return t(meal.type as Exclude<MealType, "snack">);
}

export function DayJournal({ date }: Props) {
  const { t, locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [activeMealId, setActiveMealId] = useState<number | null>(null);
  const [savedMealsMealId, setSavedMealsMealId] = useState<number | null>(null);
  const [snackName, setSnackName] = useState("");
  const [showSnackInput, setShowSnackInput] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<
    Record<number, boolean>
  >({});
  const now = useAppClock();
  const mealParam = useSearchParams().get("meal");
  const highlightedMealId =
    mealParam && /^\d+$/.test(mealParam) ? Number(mealParam) : null;

  const reload = useCallback(async () => {
    const p = await ensureProfile();
    const m = await ensureDefaultMeals(date);
    const e = await getEntriesForMeals(m.map((x) => x.id!));
    const dayTotals = await getDayTotals(date);
    setProfile(p);
    setMeals(m);
    setEntries(e);
    setTotals(dayTotals);
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setExpandedOverride({});
  }, [date]);

  const entriesByMeal = useMemo(() => {
    const map = new Map<number, FoodEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.mealId) ?? [];
      list.push(entry);
      map.set(entry.mealId, list);
    }
    return map;
  }, [entries]);

  const color = dayColor(totals, profile, { date, now });
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";

  async function handleAdd(draft: FoodDraft) {
    if (!activeMealId) return;
    await addFoodEntry({
      mealId: activeMealId,
      name: draft.name,
      calories: draft.calories,
      proteinG: draft.proteinG,
      carbsG: draft.carbsG,
      fatG: draft.fatG,
      quantityG: draft.quantityG,
      offId: draft.offId,
    });
    await reload();
  }

  async function handleVoiceLogged(mealId: number) {
    await reload();
    setExpandedOverride((prev) => ({ ...prev, [mealId]: true }));
  }

  async function handleAddSnack() {
    const meal = await addSnack(date, snackName || t("snack"));
    setSnackName("");
    setShowSnackInput(false);
    await reload();
    setActiveMealId(meal.id ?? null);
  }

  if (!profile || !totals) {
    return <p className="text-[var(--ink-muted)]">{t("loading")}</p>;
  }

  const savedMealTarget = meals.find((m) => m.id === savedMealsMealId);
  const remaining = profile.dailyCalorieTarget - totals.calories;
  const statusText = t(dayStatusKind(color));

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[var(--brand)]">
            {t("backCalendar")}
          </Link>
          <SettingsGear />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-3xl capitalize text-[var(--brand)]">
              {formatDisplayDate(date, dateLocale)}
            </h1>
            <p className="mt-1 text-[var(--ink-muted)]">
              {remaining >= 0
                ? t("kcalLeft", { n: Math.round(remaining) })
                : t("kcalOver", { n: Math.round(Math.abs(remaining)) })}
            </p>
          </div>
          <span
            className="status-pill"
            style={{ background: DAY_COLOR_HEX[color] }}
          >
            {statusText}
          </span>
        </div>
      </header>

      <MacroRow
        calories={totals.calories}
        proteinG={totals.proteinG}
        carbsG={totals.carbsG}
        fatG={totals.fatG}
        profile={profile}
        labels={{
          kcal: t("macroKcal"),
          prot: t("macroProt"),
          carbo: t("macroCarbo"),
          fat: t("macroFat"),
        }}
      />

      <VoiceLog pageDate={date} onLogged={handleVoiceLogged} />

      {meals.map((meal) => {
        const mealEntries = entriesByMeal.get(meal.id!) ?? [];
        const mealKcal = mealEntries.reduce((s, e) => s + e.calories, 0);
        const autoCollapsed = mealAutoCollapsed(date, meal.type, now);
        const expanded =
          meal.id != null && meal.id in expandedOverride
            ? expandedOverride[meal.id]
            : meal.id === highlightedMealId || !autoCollapsed;

        function setExpanded(open: boolean) {
          if (meal.id == null) return;
          setExpandedOverride((prev) => ({ ...prev, [meal.id!]: open }));
        }

        return (
          <section key={meal.id} className="panel p-4">
            <div className="meal-head">
              <button
                type="button"
                className="meal-toggle text-left"
                aria-expanded={expanded}
                aria-label={t("mealToggle")}
                onClick={() => setExpanded(!expanded)}
              >
                <span
                  className="meal-chevron"
                  data-open={expanded ? "true" : "false"}
                  aria-hidden="true"
                />
                <span>
                  <span className="meal-name display text-xl">
                    {mealTitle(meal, t)}
                  </span>
                  <span className="text-sm text-[var(--ink-muted)]">
                    {Math.round(mealKcal)} kcal
                  </span>
                </span>
              </button>
              <div className="meal-actions">
                {meal.type === "snack" && (
                  <button
                    type="button"
                    className="meal-delete"
                    aria-label={t("deleteSnack")}
                    onClick={async () => {
                      if (!meal.id) return;
                      await deleteMeal(meal.id);
                      await reload();
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost text-sm px-3"
                  onClick={() => {
                    setExpanded(true);
                    setSavedMealsMealId(meal.id ?? null);
                  }}
                >
                  {t("savedMealsOpen")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => {
                    setExpanded(true);
                    setActiveMealId(meal.id ?? null);
                  }}
                >
                  {t("addFood")}
                </button>
              </div>
            </div>

            {expanded && (
              <div className="mt-3">
                {mealEntries.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    {t("noFood")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {mealEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">{entry.name}</div>
                          <div className="text-sm text-[var(--ink-muted)]">
                            {entry.quantityG}g · {Math.round(entry.calories)}{" "}
                            kcal · P {entry.proteinG}g · C {entry.carbsG}g · F{" "}
                            {entry.fatG}g
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-sm text-[var(--red)]"
                          onClick={async () => {
                            if (!entry.id) return;
                            await deleteFoodEntry(entry.id);
                            await reload();
                          }}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      {showSnackInput ? (
        <div className="panel flex flex-col gap-3 p-4">
          <div className="field">
            <label htmlFor="snack">{t("snackName")}</label>
            <input
              id="snack"
              value={snackName}
              placeholder={t("snackPlaceholder")}
              onChange={(e) => setSnackName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={() => setShowSnackInput(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={handleAddSnack}
            >
              {t("create")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => setShowSnackInput(true)}
        >
          {t("addSnack")}
        </button>
      )}

      <AddFoodModal
        open={activeMealId !== null}
        onClose={() => setActiveMealId(null)}
        onAdd={handleAdd}
      />

      {savedMealsMealId !== null && savedMealTarget && (
        <SavedMealsModal
          open
          mealId={savedMealsMealId}
          mealTitle={mealTitle(savedMealTarget, t)}
          canSave={(entriesByMeal.get(savedMealsMealId) ?? []).length > 0}
          onClose={() => setSavedMealsMealId(null)}
          onApplied={reload}
        />
      )}
    </div>
  );
}
