import { addDays, isDateKey } from "@/lib/dates";
import { scaleMacros } from "@/lib/off";
import type { MealType } from "@/lib/types";

const MAX_ITEMS = 12;
const MAX_QUANTITY = 10000;

export interface VoicePhrases {
  unknownFood: string;
  missingFood: string;
  both: string;
  badQuantity: string;
  whichFood: string;
}

export interface VoiceAlias {
  id: number;
  phrase: string;
  foodName: string;
  foodId?: number;
  stapleId?: string;
  density: number;
}

export interface VoiceFood {
  id: number;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface VoiceStaple {
  id: string;
  name: string;
  hints: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface VoiceCatalog {
  aliases: VoiceAlias[];
  foods: VoiceFood[];
  staples: VoiceStaple[];
}

export interface VoicePromptLists {
  aliases: { id: string; phrase: string; food: string }[];
  staples: { id: string; name: string; hints: string }[];
}

export interface VoiceModelItem {
  spoken: string;
  quantity: number | null;
  unit: "g" | "ml";
  aliasId: number | null;
  stapleId: string | null;
  unresolved: boolean;
  question: string;
  candidates: string[];
}

export interface VoiceModelPlan {
  date: string | null;
  meal: string | null;
  items: VoiceModelItem[];
}

export interface VoiceReadyLine {
  spoken: string;
  foodName: string;
  quantityG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface VoiceChoice {
  value: string;
  name: string;
}

export interface VoiceOpenLine {
  spoken: string;
  quantity: number | null;
  unit: "g" | "ml";
  question: string;
  candidates: VoiceChoice[];
}

export interface VoiceDraft {
  date: string | null;
  dateQuestion: boolean;
  meal: MealType | null;
  ready: VoiceReadyLine[];
  open: VoiceOpenLine[];
  canWrite: boolean;
}

interface CatalogInput {
  aliases: Array<{
    id?: number;
    phrase: string;
    customFoodId?: number;
    stapleId?: string;
    density: number;
  }>;
  foods: Array<{
    id?: number;
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  }>;
  staples: Array<{
    id: string;
    name: string;
    hints: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  }>;
}

interface Per100g {
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

const MEALS: Record<string, MealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
  "petit dejeuner": "breakfast",
  dejeuner: "lunch",
  diner: "dinner",
  souper: "dinner",
  "en cas": "snack",
  encas: "snack",
  gouter: "snack",
};

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

function oneLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function finish(draft: Omit<VoiceDraft, "canWrite">): VoiceDraft {
  return {
    ...draft,
    canWrite:
      draft.date !== null &&
      !draft.dateQuestion &&
      draft.meal !== null &&
      draft.ready.length > 0,
  };
}

function toGrams(quantity: number, unit: "g" | "ml", density: number): number {
  const factor = unit === "ml" ? (density > 0 ? density : 1) : 1;
  return Math.round(quantity * factor * 10) / 10;
}

function toReady(
  spoken: string,
  quantityG: number,
  per100g: Per100g,
): VoiceReadyLine | null {
  if (!per100g.name.trim() || quantityG <= 0) return null;
  return {
    spoken,
    foodName: per100g.name,
    quantityG,
    ...scaleMacros(per100g, quantityG),
  };
}

function foodById(catalog: VoiceCatalog, id: number): VoiceFood | undefined {
  return catalog.foods.find((food) => food.id === id);
}

function stapleById(catalog: VoiceCatalog, id: string): VoiceStaple | undefined {
  return catalog.staples.find((staple) => staple.id === id);
}

function choiceFromAlias(
  alias: VoiceAlias,
  catalog: VoiceCatalog,
): VoiceChoice | null {
  if (alias.stapleId) {
    const staple = stapleById(catalog, alias.stapleId);
    return staple
      ? { value: `staple:${staple.id}`, name: staple.name }
      : null;
  }
  if (alias.foodId == null) return null;
  const food = foodById(catalog, alias.foodId);
  return food ? { value: `food:${food.id}`, name: food.name } : null;
}

function choiceFromToken(
  token: string,
  catalog: VoiceCatalog,
): VoiceChoice | null {
  const raw = token.trim();
  if (!raw) return null;
  if (raw.startsWith("food:")) {
    const food = foodById(catalog, Number(raw.slice("food:".length)));
    return food ? { value: `food:${food.id}`, name: food.name } : null;
  }
  if (raw.startsWith("staple:")) {
    const staple = stapleById(catalog, raw.slice("staple:".length));
    return staple ? { value: `staple:${staple.id}`, name: staple.name } : null;
  }
  if (raw.startsWith("alias:") || /^\d+$/.test(raw)) {
    const id = Number(raw.startsWith("alias:") ? raw.slice("alias:".length) : raw);
    const alias = catalog.aliases.find((item) => item.id === id);
    return alias ? choiceFromAlias(alias, catalog) : null;
  }
  const staple = stapleById(catalog, raw);
  return staple ? { value: `staple:${staple.id}`, name: staple.name } : null;
}

function choicesFrom(
  tokens: string[],
  catalog: VoiceCatalog,
): VoiceChoice[] {
  const out: VoiceChoice[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const choice = choiceFromToken(token, catalog);
    if (!choice || seen.has(choice.value)) continue;
    seen.add(choice.value);
    out.push(choice);
    if (out.length === 3) break;
  }
  return out;
}

function macrosForValue(value: string, catalog: VoiceCatalog): Per100g | null {
  const choice = choiceFromToken(value, catalog);
  if (!choice) return null;
  if (choice.value.startsWith("food:")) {
    return foodById(catalog, Number(choice.value.slice("food:".length))) ?? null;
  }
  if (choice.value.startsWith("staple:")) {
    return stapleById(catalog, choice.value.slice("staple:".length)) ?? null;
  }
  return null;
}

function resolveDate(
  raw: string | null,
  today: string,
): { date: string | null; dateQuestion: boolean } {
  const todayOk = isDateKey(today);
  if (raw == null) {
    return todayOk
      ? { date: today, dateQuestion: false }
      : { date: null, dateQuestion: true };
  }
  const folded = fold(raw);
  if (folded === "yesterday" || folded === "hier") {
    return todayOk
      ? { date: addDays(today, -1), dateQuestion: false }
      : { date: null, dateQuestion: true };
  }
  if (
    folded === "today" ||
    folded === "aujourd hui" ||
    folded === "aujourdhui"
  ) {
    return todayOk
      ? { date: today, dateQuestion: false }
      : { date: null, dateQuestion: true };
  }
  if (isDateKey(raw)) return { date: raw, dateQuestion: false };
  return { date: null, dateQuestion: true };
}

function resolveMeal(raw: string | null): MealType | null {
  if (raw == null) return null;
  const folded = fold(raw);
  if (!folded || folded === "null") return null;
  return MEALS[folded] ?? null;
}

function lineFromAlias(
  spoken: string,
  quantity: number,
  unit: "g" | "ml",
  alias: VoiceAlias,
  catalog: VoiceCatalog,
): VoiceReadyLine | null {
  if (alias.stapleId) {
    const staple = stapleById(catalog, alias.stapleId);
    if (!staple) return null;
    return toReady(spoken, toGrams(quantity, unit, alias.density), staple);
  }
  if (alias.foodId == null) return null;
  const food = foodById(catalog, alias.foodId);
  if (!food) return null;
  return toReady(spoken, toGrams(quantity, unit, alias.density), food);
}

function openLine(
  spoken: string,
  quantity: number | null,
  unit: "g" | "ml",
  question: string,
  candidates: VoiceChoice[],
): VoiceOpenLine {
  return { spoken, quantity, unit, question, candidates };
}

export function toVoiceCatalog(input: CatalogInput): VoiceCatalog {
  const foods: VoiceFood[] = [];
  for (const food of input.foods) {
    const name = oneLine(food.name, 120);
    if (food.id == null || !name) continue;
    foods.push({
      id: food.id,
      name,
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
    });
  }
  const staples: VoiceStaple[] = [];
  for (const staple of input.staples) {
    const name = oneLine(staple.name, 120);
    const id = staple.id.trim();
    if (!id || !name) continue;
    staples.push({
      id,
      name,
      hints: oneLine(staple.hints, 200),
      caloriesPer100g: staple.caloriesPer100g,
      proteinPer100g: staple.proteinPer100g,
      carbsPer100g: staple.carbsPer100g,
      fatPer100g: staple.fatPer100g,
    });
  }
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const staplesById = new Map(staples.map((staple) => [staple.id, staple]));
  const aliases: VoiceAlias[] = [];
  for (const alias of input.aliases) {
    const phrase = oneLine(alias.phrase, 120);
    if (alias.id == null || !phrase) continue;
    if (alias.stapleId) {
      const staple = staplesById.get(alias.stapleId);
      aliases.push({
        id: alias.id,
        phrase,
        foodName: staple?.name ?? phrase,
        stapleId: alias.stapleId,
        density: alias.density > 0 ? alias.density : 1,
      });
      continue;
    }
    if (alias.customFoodId == null) continue;
    const food = foodsById.get(alias.customFoodId);
    aliases.push({
      id: alias.id,
      phrase,
      foodName: food?.name ?? phrase,
      foodId: alias.customFoodId,
      density: alias.density > 0 ? alias.density : 1,
    });
  }
  return { aliases, foods, staples };
}

export function voicePromptLists(catalog: VoiceCatalog): VoicePromptLists {
  return {
    aliases: catalog.aliases.map((alias) => ({
      id: String(alias.id),
      phrase: alias.phrase,
      food: alias.foodName,
    })),
    staples: catalog.staples.map((staple) => ({
      id: staple.id,
      name: staple.name,
      hints: staple.hints,
    })),
  };
}

function asText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return oneLine(value, max);
}

function asQuantity(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asAliasId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function asStapleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.toLowerCase() === "null") return null;
  return id.slice(0, 64);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function asDateRaw(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, 40);
}

function parseItem(raw: unknown): VoiceModelItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const spoken = asText(obj.spoken, 180);
  if (!spoken) return null;
  const unit = asText(obj.unit, 8).toLowerCase() === "ml" ? "ml" : "g";
  return {
    spoken,
    quantity: asQuantity(obj.quantity),
    unit,
    aliasId: asAliasId(obj.aliasId),
    stapleId: asStapleId(obj.stapleId),
    unresolved: obj.unresolved === true,
    question: asText(obj.question, 180),
    candidates: asStringList(obj.candidates),
  };
}

/** Keeps the model contract. Calories in the payload are dropped. */
export function parseVoiceModel(raw: unknown): VoiceModelPlan {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(obj.items) ? obj.items : [];
  return {
    date: asDateRaw(obj.date),
    meal: asDateRaw(obj.meal),
    items: list.map(parseItem).filter((item): item is VoiceModelItem => item != null).slice(0, MAX_ITEMS),
  };
}

export function applyVoicePlan(
  plan: VoiceModelPlan,
  catalog: VoiceCatalog,
  today: string,
  phrases: VoicePhrases,
): VoiceDraft {
  const ready: VoiceReadyLine[] = [];
  const open: VoiceOpenLine[] = [];

  for (const item of plan.items) {
    const quantityOk =
      item.quantity != null &&
      item.quantity > 0 &&
      item.quantity <= MAX_QUANTITY;
    if (!quantityOk) {
      open.push(
        openLine(item.spoken, null, item.unit, phrases.badQuantity, []),
      );
      continue;
    }
    const quantity = item.quantity as number;
    if (item.unresolved || (item.aliasId == null && item.stapleId == null)) {
      open.push(
        openLine(
          item.spoken,
          quantity,
          item.unit,
          item.question || phrases.whichFood,
          choicesFrom(item.candidates, catalog),
        ),
      );
      continue;
    }
    if (item.aliasId != null && item.stapleId != null) {
      open.push(
        openLine(
          item.spoken,
          quantity,
          item.unit,
          phrases.both,
          choicesFrom(
            [String(item.aliasId), item.stapleId, ...item.candidates],
            catalog,
          ),
        ),
      );
      continue;
    }
    if (item.aliasId != null) {
      const alias = catalog.aliases.find((row) => row.id === item.aliasId);
      const line = alias
        ? lineFromAlias(item.spoken, quantity, item.unit, alias, catalog)
        : null;
      if (line) {
        ready.push(line);
        continue;
      }
      open.push(
        openLine(
          item.spoken,
          quantity,
          item.unit,
          alias ? phrases.missingFood : phrases.unknownFood,
          choicesFrom(item.candidates, catalog),
        ),
      );
      continue;
    }
    const staple = item.stapleId
      ? stapleById(catalog, item.stapleId)
      : undefined;
    const line = staple
      ? toReady(item.spoken, toGrams(quantity, item.unit, 1), staple)
      : null;
    if (line) {
      ready.push(line);
      continue;
    }
    open.push(
      openLine(
        item.spoken,
        quantity,
        item.unit,
        phrases.unknownFood,
        choicesFrom(item.candidates, catalog),
      ),
    );
  }

  return finish({
    ...resolveDate(plan.date, today),
    meal: resolveMeal(plan.meal),
    ready,
    open,
  });
}

export function withMeal(draft: VoiceDraft, meal: MealType): VoiceDraft {
  return finish({ ...draft, meal });
}

export function withDate(draft: VoiceDraft, date: string): VoiceDraft {
  if (!isDateKey(date)) return draft;
  return finish({ ...draft, date, dateQuestion: false });
}

export function withChoice(
  draft: VoiceDraft,
  index: number,
  value: string,
  catalog: VoiceCatalog,
): VoiceDraft {
  const pending = draft.open[index];
  if (!pending || pending.quantity == null) return draft;
  const picked = macrosForValue(value, catalog);
  if (!picked) return draft;
  const line = toReady(
    pending.spoken,
    toGrams(pending.quantity, pending.unit, 1),
    picked,
  );
  if (!line) return draft;
  return finish({
    ...draft,
    ready: [...draft.ready, line],
    open: draft.open.filter((_, i) => i !== index),
  });
}

export function dropReady(draft: VoiceDraft, count: number): VoiceDraft {
  return finish({
    ...draft,
    ready: draft.ready.slice(Math.max(0, count)),
  });
}

export function withoutReadyAt(draft: VoiceDraft, index: number): VoiceDraft {
  if (index < 0 || index >= draft.ready.length) return draft;
  return finish({
    ...draft,
    ready: draft.ready.filter((_, i) => i !== index),
  });
}
