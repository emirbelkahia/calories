"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { STAPLES } from "@/data/staples";
import {
  addSpokenAlias,
  deleteSpokenAlias,
  listCustomFoods,
  listSpokenAliases,
  updateSpokenAlias,
  upsertCustomFood,
  dedupeIdenticalCustomFoods,
} from "@/lib/db";
import type { CustomFood, SpokenAlias } from "@/lib/types";
import { FoodPicker } from "./FoodPicker";
import { useLocale } from "./LocaleProvider";

function targetValue(alias: SpokenAlias): string {
  if (alias.stapleId) return `staple:${alias.stapleId}`;
  return `food:${alias.customFoodId ?? ""}`;
}

function applyTarget(alias: SpokenAlias, value: string): SpokenAlias {
  if (value.startsWith("staple:")) {
    return {
      id: alias.id,
      phrase: alias.phrase,
      density: alias.density,
      stapleId: value.slice("staple:".length),
    };
  }
  return {
    id: alias.id,
    phrase: alias.phrase,
    density: alias.density,
    customFoodId: Number(value.slice("food:".length)),
  };
}

const DEMO_FOODS_KEY = "calorie-tracker-demo-foods";

const DEMO_FOODS = [
  {
    name: "Flocons avoine maison",
    caloriesPer100g: 380,
    proteinPer100g: 13,
    carbsPer100g: 60,
    fatPer100g: 8,
  },
  {
    name: "Banane bien mûre",
    caloriesPer100g: 95,
    proteinPer100g: 1.2,
    carbsPer100g: 22,
    fatPer100g: 0.3,
  },
  {
    name: "Yaourt nature maison",
    caloriesPer100g: 70,
    proteinPer100g: 4,
    carbsPer100g: 5,
    fatPer100g: 3,
  },
];

export function HabitsEditor() {
  const { t, locale } = useLocale();
  const [foods, setFoods] = useState<CustomFood[] | null>(null);
  const [aliases, setAliases] = useState<SpokenAlias[]>([]);

  const staples = useMemo(
    () =>
      [...STAPLES].sort((a, b) =>
        (locale === "en" ? a.nameEn : a.nameFr).localeCompare(
          locale === "en" ? b.nameEn : b.nameFr,
          locale,
        ),
      ),
    [locale],
  );

  useEffect(() => {
    async function load() {
      if (!window.localStorage.getItem(DEMO_FOODS_KEY)) {
        window.localStorage.setItem(DEMO_FOODS_KEY, "1");
        for (const food of DEMO_FOODS) await upsertCustomFood(food);
      }
      await dedupeIdenticalCustomFoods();
      const [saved, rows] = await Promise.all([
        listCustomFoods(),
        listSpokenAliases(),
      ]);
      setFoods(saved);
      setAliases(rows);
    }
    load();
  }, []);

  async function reloadAliases() {
    setAliases(await listSpokenAliases());
  }

  async function addRow() {
    const firstFood = foods?.find((food) => food.id);
    if (firstFood?.id) await addSpokenAlias({ customFoodId: firstFood.id });
    else await addSpokenAlias({ stapleId: staples[0].id });
    await reloadAliases();
  }

  async function changePhrase(alias: SpokenAlias, phrase: string) {
    const next = { ...alias, phrase };
    setAliases((rows) => rows.map((row) => (row.id === alias.id ? next : row)));
    await updateSpokenAlias(next);
  }

  async function changeTarget(alias: SpokenAlias, value: string) {
    const next = applyTarget(alias, value);
    setAliases((rows) => rows.map((row) => (row.id === alias.id ? next : row)));
    await updateSpokenAlias(next);
  }

  async function removeRow(id: number) {
    await deleteSpokenAlias(id);
    await reloadAliases();
  }

  if (!foods) {
    return <p className="text-[var(--ink-muted)]">{t("loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-2">
        <Link href="/" className="text-sm text-[var(--brand)]">
          {t("backCalendar")}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="display text-3xl text-[var(--brand)]">
            {t("navHabits")}
          </h1>
          <HabitHint text={t("habitVoiceHint")} label={t("navHabits")} />
        </div>
        <p className="mt-2 text-[var(--ink-muted)]">{t("habitsIntro")}</p>
      </header>

      <section className="panel flex flex-col gap-4 p-4">
        {aliases.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">{t("habitEmptyTable")}</p>
        ) : (
          <table className="habit-table">
            <thead>
              <tr>
                <th scope="col">{t("habitPhrase")}</th>
                <th scope="col">{t("habitMeans")}</th>
                <th scope="col">
                  <span className="sr-only">{t("habitRemove")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id}>
                  <td>
                    <input
                      aria-label={t("habitPhrase")}
                      value={alias.phrase}
                      placeholder={t("habitPhrasePlaceholder")}
                      onChange={(event) =>
                        changePhrase(alias, event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <FoodPicker
                      value={targetValue(alias)}
                      saved={foods.flatMap((food) =>
                        food.id
                          ? [{ value: `food:${food.id}`, name: food.name }]
                          : [],
                      )}
                      staples={staples.map((staple) => ({
                        value: `staple:${staple.id}`,
                        name: locale === "en" ? staple.nameEn : staple.nameFr,
                      }))}
                      savedLabel={t("habitSavedGroup")}
                      stapleLabel={t("habitStapleGroup")}
                      searchLabel={t("habitSearch")}
                      placeholder={t("habitSearchPlaceholder")}
                      emptyHint={t("habitStaplePrompt")}
                      noMatch={t("habitNoMatch")}
                      onChange={(value) => changeTarget(alias, value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="habit-remove"
                      aria-label={t("habitRemove")}
                      onClick={() => alias.id && removeRow(alias.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="btn btn-primary" onClick={addRow}>
          {t("habitAdd")}
        </button>
      </section>
    </div>
  );
}

function HabitHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="hint-term">
      <button
        type="button"
        className="habit-info"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span id={id} role="tooltip" className="hint-term-bubble habit-info-bubble">
          {text}
        </span>
      )}
    </span>
  );
}
