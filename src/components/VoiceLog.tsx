"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { STAPLES, type StapleFood } from "@/data/staples";
import { addDays, formatDisplayDate, isDateKey, todayKey } from "@/lib/dates";
import {
  addFoodEntry,
  addSnack,
  ensureDefaultMeals,
  listCustomFoods,
  listSpokenAliases,
} from "@/lib/db";
import { getMistralApiKey } from "@/lib/mistral-key";
import type { MealType } from "@/lib/types";
import {
  applyVoicePlan,
  dropReady,
  parseVoiceModel,
  toVoiceCatalog,
  voicePromptLists,
  withChoice,
  withDate,
  withMeal,
  withoutReadyAt,
  type VoiceCatalog,
  type VoiceDraft,
  type VoicePhrases,
  type VoiceReadyLine,
} from "@/lib/voice-plan";
import { FoodPicker } from "./FoodPicker";
import { useLocale } from "./LocaleProvider";

interface Props {
  pageDate: string;
  onLogged: (mealId: number) => void;
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function stapleHints(staple: StapleFood, locale: "fr" | "en"): string {
  const other = locale === "en" ? staple.nameFr : staple.nameEn;
  return [other, ...staple.aliases]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

async function commitVoiceLines(
  date: string,
  mealType: MealType,
  lines: VoiceReadyLine[],
  snackName: string,
): Promise<{ mealId: number; written: number; partial: boolean }> {
  const meals = await ensureDefaultMeals(date);
  let target = meals.find((meal) => meal.type === mealType);
  if (target?.id == null && mealType === "snack") {
    target = await addSnack(date, snackName);
  }
  if (target?.id == null) throw new Error("NO_MEAL");
  let written = 0;
  try {
    for (const line of lines) {
      await addFoodEntry({
        mealId: target.id,
        name: line.foodName,
        calories: line.calories,
        proteinG: line.proteinG,
        carbsG: line.carbsG,
        fatG: line.fatG,
        quantityG: line.quantityG,
      });
      written += 1;
    }
  } catch (err) {
    if (written === 0) throw err;
    return { mealId: target.id, written, partial: true };
  }
  return { mealId: target.id, written, partial: false };
}

export function VoiceLog({ pageDate, onLogged }: Props) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [session, setSession] = useState<{
    draft: VoiceDraft;
    catalog: VoiceCatalog;
  } | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<"key" | "bad" | "read" | "save" | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";

  const phrases: VoicePhrases = {
    unknownFood: t("voiceUnknownFood"),
    missingFood: t("voiceMissingFood"),
    both: t("voiceBoth"),
    badQuantity: t("voiceBadQuantity"),
    whichFood: t("voiceWhichFood"),
  };

  async function readPhrase(event: FormEvent) {
    event.preventDefault();
    const text = transcript.trim();
    if (!text || busy) return;
    const apiKey = getMistralApiKey();
    if (!apiKey) {
      setError("key");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("read");
    try {
      const [aliases, foods] = await Promise.all([
        listSpokenAliases(),
        listCustomFoods(),
      ]);
      const catalog = toVoiceCatalog({
        aliases,
        foods,
        staples: STAPLES.map((staple) => ({
          id: staple.id,
          name: locale === "en" ? staple.nameEn : staple.nameFr,
          hints: stapleHints(staple, locale),
          caloriesPer100g: staple.caloriesPer100g,
          proteinPer100g: staple.proteinPer100g,
          carbsPer100g: staple.carbsPer100g,
          fatPer100g: staple.fatPer100g,
        })),
      });
      const res = await fetch("/api/voice/interpret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mistral-api-key": apiKey,
        },
        body: JSON.stringify({
          transcript: text,
          ...voicePromptLists(catalog),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        plan?: unknown;
      } | null;
      if (data?.error === "missing_api_key") {
        setError("key");
        return;
      }
      if (data?.error === "invalid_api_key") {
        setError("bad");
        return;
      }
      if (!res.ok || data?.plan == null) {
        setError("read");
        return;
      }
      setSession({
        draft: applyVoicePlan(
          parseVoiceModel(data.plan),
          catalog,
          todayKey(),
          phrases,
        ),
        catalog,
      });
    } catch {
      setError("read");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!session || busy || !session.draft.canWrite) return;
    const { draft, catalog } = session;
    if (!draft.date || !draft.meal) return;
    setError(null);
    setBusy("save");
    try {
      const result = await commitVoiceLines(
        draft.date,
        draft.meal,
        draft.ready,
        t("snack"),
      );
      const next = dropReady(draft, result.written);
      const done = !result.partial && next.open.length === 0 && next.ready.length === 0;
      if (done && draft.date !== pageDate) {
        setSession(null);
        setTranscript("");
        router.push(`/day/${draft.date}?meal=${result.mealId}`);
        return;
      }
      if (draft.date === pageDate && result.written > 0) {
        await onLogged(result.mealId);
      }
      if (done) {
        setSession(null);
        setTranscript("");
        setNotice(t("voiceSaved"));
      } else {
        setSession({ draft: next, catalog });
        setNotice(result.partial ? null : t("voiceSaved"));
        if (result.partial) setError("save");
      }
    } catch {
      setError("save");
    } finally {
      setBusy(null);
    }
  }

  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error) return;
    alertRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const draft = session?.draft ?? null;
  const today = todayKey();
  const yesterday = isDateKey(today) ? addDays(today, -1) : null;
  const showThisDay =
    isDateKey(pageDate) && pageDate !== today && pageDate !== yesterday;

  function pick(index: number, value: string) {
    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        draft: withChoice(current.draft, index, value, current.catalog),
      };
    });
  }

  return (
    <section className="panel flex min-w-0 flex-col gap-3 p-4">
      <h2 id="voice-title" className="display text-xl">
        {t("voiceTitle")}
      </h2>
      <p id="voice-hint" className="text-sm text-[var(--ink-muted)]">
        {t("voiceHint")}
      </p>
      <form className="flex flex-col gap-3" onSubmit={readPhrase}>
        <div className="field">
          <textarea
            id="voice-phrase"
            rows={4}
            maxLength={2000}
            value={transcript}
            placeholder={t("voicePlaceholder")}
            aria-labelledby="voice-title"
            aria-describedby="voice-hint"
            autoComplete="off"
            onChange={(event) => {
              setTranscript(event.target.value);
              setNotice(null);
            }}
          />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={busy !== null || transcript.trim().length === 0}
        >
          {busy === "read" ? t("voiceReading") : t("voiceRead")}
        </button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {error === "key" && (
          <p ref={alertRef} role="alert" className="voice-alert">
            {t("voiceNeedKeyLead")}{" "}
            <Link href="/settings">{t("settings")}</Link>{" "}
            {t("voiceNeedKeyTail")}
          </p>
        )}
        {error === "bad" && (
          <p ref={alertRef} role="alert" className="voice-alert">
            {t("voiceBadKeyLead")} <Link href="/settings">{t("settings")}</Link>
            .
          </p>
        )}
        {error === "read" && (
          <p ref={alertRef} role="alert" className="voice-alert">
            {t("voiceFailed")}
          </p>
        )}
        {error === "save" && (
          <p ref={alertRef} role="alert" className="voice-alert">
            {t("voiceSaveFailed")}
          </p>
        )}
      </form>

      {draft && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {draft.date && (
            <p className="text-sm text-[var(--ink-muted)]">
              {t("voiceGoesTo", {
                date: formatDisplayDate(draft.date, dateLocale),
              })}
              {draft.date !== pageDate && (
                <>
                  {" "}
                  <Link
                    href={`/day/${draft.date}`}
                    className="text-[var(--brand)]"
                  >
                    {t("voiceOpenDay")}
                  </Link>
                </>
              )}
            </p>
          )}
          {draft.dateQuestion && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">{t("voiceDateAsk")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() =>
                    setSession((current) =>
                      current
                        ? { ...current, draft: withDate(current.draft, today) }
                        : current,
                    )
                  }
                >
                  {t("voiceToday")}
                </button>
                {yesterday && (
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    onClick={() =>
                      setSession((current) =>
                        current
                          ? {
                              ...current,
                              draft: withDate(current.draft, yesterday),
                            }
                          : current,
                      )
                    }
                  >
                    {t("voiceYesterday")}
                  </button>
                )}
                {showThisDay && (
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    onClick={() =>
                      setSession((current) =>
                        current
                          ? {
                              ...current,
                              draft: withDate(current.draft, pageDate),
                            }
                          : current,
                      )
                    }
                  >
                    {t("voiceThisDay")}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm">{t("voiceMealAsk")}</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((meal) => (
                <button
                  key={meal}
                  type="button"
                  className={
                    draft.meal === meal
                      ? "btn btn-primary text-sm"
                      : "btn btn-ghost text-sm"
                  }
                  aria-pressed={draft.meal === meal}
                  onClick={() =>
                    setSession((current) =>
                      current
                        ? { ...current, draft: withMeal(current.draft, meal) }
                        : current,
                    )
                  }
                >
                  {t(meal)}
                </button>
              ))}
            </div>
          </div>

          {draft.ready.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--ink-muted)]">{t("voiceRecap")}</p>
              <ul className="flex flex-col gap-2">
                {draft.ready.map((line, index) => (
                  <li
                    key={`${line.foodName}-${index}`}
                    className="voice-ready-row rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                  >
                    <div>
                      <div className="font-medium">{line.foodName}</div>
                      <div className="text-sm text-[var(--ink-muted)]">
                        {line.quantityG}g · {Math.round(line.calories)} kcal · P{" "}
                        {line.proteinG}g · C {line.carbsG}g · F {line.fatG}g
                      </div>
                      {line.spoken !== line.foodName && (
                        <div className="text-sm text-[var(--ink-muted)]">
                          {line.spoken}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="habit-remove"
                      aria-label={t("voiceRemove")}
                      disabled={busy !== null}
                      onClick={() =>
                        setSession((current) =>
                          current
                            ? {
                                ...current,
                                draft: withoutReadyAt(current.draft, index),
                              }
                            : current,
                        )
                      }
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.open.length > 0 && (
            <div className="voice-ask">
              <div className="voice-ask-bg" aria-hidden="true">
                <span className="voice-ask-mark">?</span>
              </div>
              <div className="voice-ask-body">
                <p className="voice-ask-title text-sm">{t("voiceOpen")}</p>
                {draft.open.map((line, index) => (
                  <div key={`${line.spoken}-${index}`} className="voice-ask-line">
                    <div className="font-medium">{line.spoken}</div>
                    {line.quantity != null && (
                      <div className="text-sm text-[var(--ink-muted)]">
                        {line.quantity} {line.unit}
                      </div>
                    )}
                    <p className="text-sm">{line.question}</p>
                    {line.candidates.length > 0 && (
                      <div className="voice-suggest">
                        {line.candidates.map((choice, choiceIndex) => (
                          <button
                            key={choice.value}
                            type="button"
                            className="voice-suggest-btn"
                            disabled={busy !== null}
                            aria-label={`${t("voiceSuggest", {
                              n: choiceIndex + 1,
                            })}, ${choice.name}`}
                            onClick={() => pick(index, choice.value)}
                          >
                            <span className="voice-suggest-n">
                              {choiceIndex + 1}
                            </span>
                            <span>{choice.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {line.quantity != null && session && (
                      <FoodPicker
                        value=""
                        saved={session.catalog.foods.map((food) => ({
                          value: `food:${food.id}`,
                          name: food.name,
                        }))}
                        staples={session.catalog.staples.map((staple) => ({
                          value: `staple:${staple.id}`,
                          name: staple.name,
                        }))}
                        savedLabel={t("habitSavedGroup")}
                        stapleLabel={t("habitStapleGroup")}
                        searchLabel={t("habitSearch")}
                        placeholder={t("voiceWhichFood")}
                        emptyHint={t("habitStaplePrompt")}
                        noMatch={t("habitNoMatch")}
                        onChange={(value) => pick(index, value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft.ready.length === 0 && draft.open.length === 0 && (
            <p className="text-sm">{t("voiceNone")}</p>
          )}
          {draft.ready.length > 0 && draft.open.length > 0 && (
            <p className="text-sm text-[var(--ink-muted)]">{t("voicePartial")}</p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft.canWrite || busy !== null}
            onClick={save}
          >
            {busy === "save" ? t("voiceSaving") : t("voiceSave")}
          </button>
        </div>
      )}
    </section>
  );
}
