import { scaleMacros } from "@/lib/off";
import type { MealType } from "@/lib/types";

export interface ResolveFood {
  id: number;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface ResolveAlias {
  phrase: string;
  foodId?: number;
  stapleId?: string;
  /** Grams per millilitre. 1 means 150 ml is stored as 150 g. */
  density: number;
}

export interface ResolveStaple {
  id: string;
  name: string;
  aliases: string[];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface ParsedItem {
  phrase: string;
  quantity: number;
  unit: "g" | "ml";
}

export interface ParsedUtterance {
  meal: MealType | null;
  items: ParsedItem[];
}

export interface ResolvedLine {
  phrase: string;
  foodName: string;
  quantityG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: "alias" | "staple";
}

export interface ResolveQuestion {
  phrase: string;
  reason: "unknown" | "ambiguous" | "missing-food";
}

export interface ResolveResult {
  meal: MealType | null;
  /** True when the utterance did not name a meal. Nothing should be written. */
  mealQuestion: boolean;
  lines: ResolvedLine[];
  questions: ResolveQuestion[];
  /** True only when every item resolved and the meal is known. */
  canWrite: boolean;
}

interface Candidate {
  key: string;
  name: string;
  score: number;
  density: number;
  source: "alias" | "staple";
  per100g: ResolveFood | ResolveStaple;
  foodId?: number;
  staple?: ResolveStaple;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scorePhrase(heard: string, candidate: string): number {
  if (!candidate) return 0;
  if (heard === candidate) return 1000 + candidate.length;
  if (` ${heard} `.includes(` ${candidate} `)) return candidate.length;
  return 0;
}

function best(candidates: Candidate[]): Candidate[] {
  const top = candidates.reduce((max, item) => Math.max(max, item.score), 0);
  if (top <= 0) return [];
  return candidates.filter((item) => item.score === top);
}

function unique(candidates: Candidate[]): Candidate | "ambiguous" | null {
  const winners = best(candidates);
  if (winners.length === 0) return null;
  const keys = new Set(winners.map((item) => item.key));
  if (keys.size > 1) return "ambiguous";
  return winners[0];
}

function toLine(
  phrase: string,
  quantityG: number,
  name: string,
  per100g: Pick<
    ResolveFood,
    "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g"
  >,
  source: "alias" | "staple",
): ResolvedLine {
  const scaled = scaleMacros(per100g, quantityG);
  return {
    phrase,
    foodName: name,
    quantityG,
    source,
    ...scaled,
  };
}

export function resolveUtterance(
  utterance: ParsedUtterance,
  aliases: ResolveAlias[],
  foods: ResolveFood[],
  staples: ResolveStaple[],
): ResolveResult {
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const staplesById = new Map(staples.map((staple) => [staple.id, staple]));
  const lines: ResolvedLine[] = [];
  const questions: ResolveQuestion[] = [];

  for (const item of utterance.items) {
    const heard = fold(item.phrase);
    if (!heard || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      questions.push({ phrase: item.phrase.trim(), reason: "unknown" });
      continue;
    }

    const aliasCandidates: Candidate[] = [];
    for (const alias of aliases) {
      const phrase = fold(alias.phrase);
      const score = scorePhrase(heard, phrase);
      if (score <= 0) continue;
      const staple = alias.stapleId
        ? staplesById.get(alias.stapleId)
        : undefined;
      const food =
        alias.foodId != null ? foodsById.get(alias.foodId) : undefined;
      aliasCandidates.push({
        key: `alias:${phrase}:${alias.stapleId ?? alias.foodId}`,
        name: staple?.name ?? food?.name ?? phrase,
        score,
        density: alias.density > 0 ? alias.density : 1,
        source: "alias",
        per100g: staple ??
          food ?? {
            id: alias.stapleId ?? String(alias.foodId ?? ""),
            name: "",
            aliases: [],
            caloriesPer100g: 0,
            proteinPer100g: 0,
            carbsPer100g: 0,
            fatPer100g: 0,
          },
        foodId: alias.foodId,
        staple,
      });
    }

    const aliasHit = unique(aliasCandidates);
    if (aliasHit === "ambiguous") {
      questions.push({ phrase: item.phrase.trim(), reason: "ambiguous" });
      continue;
    }

    const quantityG =
      item.unit === "ml"
        ? Math.round(item.quantity * (aliasHit?.density ?? 1) * 10) / 10
        : item.quantity;

    if (aliasHit) {
      if (aliasHit.staple) {
        lines.push(
          toLine(
            item.phrase.trim(),
            quantityG,
            aliasHit.staple.name,
            aliasHit.staple,
            "alias",
          ),
        );
        continue;
      }
      const food = foodsById.get(aliasHit.foodId ?? -1);
      if (!food) {
        questions.push({ phrase: item.phrase.trim(), reason: "missing-food" });
        continue;
      }
      lines.push(toLine(item.phrase.trim(), quantityG, food.name, food, "alias"));
      continue;
    }

    const stapleCandidates: Candidate[] = [];
    for (const staple of staples) {
      const labels = [staple.name, ...staple.aliases];
      for (const label of labels) {
        const phrase = fold(label);
        const score = scorePhrase(heard, phrase);
        if (score <= 0) continue;
        stapleCandidates.push({
          key: `staple:${staple.id}`,
          name: staple.name,
          score,
          density: 1,
          source: "staple",
          per100g: staple,
        });
      }
    }

    const stapleHit = unique(stapleCandidates);
    if (stapleHit === "ambiguous" || !stapleHit) {
      questions.push({
        phrase: item.phrase.trim(),
        reason: stapleHit === "ambiguous" ? "ambiguous" : "unknown",
      });
      continue;
    }

    lines.push(
      toLine(
        item.phrase.trim(),
        quantityG,
        stapleHit.name,
        stapleHit.per100g,
        "staple",
      ),
    );
  }

  const mealQuestion = utterance.meal === null;
  return {
    meal: utterance.meal,
    mealQuestion,
    lines,
    questions,
    canWrite: !mealQuestion && questions.length === 0 && lines.length > 0,
  };
}
