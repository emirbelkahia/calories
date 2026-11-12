import Dexie, { type EntityTable } from "dexie";
import { buildDefaultProfile } from "./nutrition";
import type {
  BackupPayload,
  CustomFood,
  DayTotals,
  FoodEntry,
  Meal,
  Profile,
  SavedMeal,
  SavedMealItem,
  SpokenAlias,
} from "./types";

const DEFAULT_MEALS: Omit<Meal, "id" | "date">[] = [
  { type: "breakfast", name: "Petit-déjeuner", sortOrder: 0 },
  { type: "lunch", name: "Déjeuner", sortOrder: 1 },
  { type: "dinner", name: "Dîner", sortOrder: 2 },
];

class CalorieDB extends Dexie {
  profile!: EntityTable<Profile, "id">;
  meals!: EntityTable<Meal, "id">;
  foodEntries!: EntityTable<FoodEntry, "id">;
  customFoods!: EntityTable<CustomFood, "id">;
  savedMeals!: EntityTable<SavedMeal, "id">;
  spokenAliases!: EntityTable<SpokenAlias, "id">;

  constructor() {
    super("calorie-tracker");
    this.version(1).stores({
      profile: "id",
      meals: "++id, date, type",
      foodEntries: "++id, mealId",
      customFoods: "++id, name",
    });
    this.version(2).stores({
      savedMeals: "++id, name",
    });
    this.version(3).stores({
      spokenAliases: "++id, customFoodId",
    });
  }
}

export const db = new CalorieDB();

export async function ensureProfile(): Promise<Profile> {
  const existing = await db.profile.get(1);
  if (existing) return existing;
  const profile = buildDefaultProfile();
  await db.profile.put(profile);
  return profile;
}

export async function saveProfile(
  input: Omit<Profile, "id"> & { id?: 1 },
): Promise<Profile> {
  const profile: Profile = { ...input, id: 1 };
  if (typeof profile.dailyCarbsTargetG !== "number") {
    delete profile.dailyCarbsTargetG;
  }
  if (typeof profile.dailyFatTargetG !== "number") {
    delete profile.dailyFatTargetG;
  }
  await db.profile.put(profile);
  return profile;
}

/** Prevents React Strict Mode double-mount from creating duplicate meals. */
const mealEnsureLocks = new Map<string, Promise<Meal[]>>();

async function dedupeDefaultMeals(date: string): Promise<void> {
  const existing = await db.meals.where("date").equals(date).toArray();
  const byType = new Map<string, Meal[]>();
  for (const meal of existing) {
    if (meal.type === "snack" || !meal.id) continue;
    const list = byType.get(meal.type) ?? [];
    list.push(meal);
    byType.set(meal.type, list);
  }

  for (const list of byType.values()) {
    if (list.length < 2) continue;
    const [keep, ...dupes] = list.sort(
      (a, b) => (a.id ?? 0) - (b.id ?? 0),
    );
    for (const dupe of dupes) {
      if (!dupe.id || !keep.id) continue;
      await db.foodEntries
        .where("mealId")
        .equals(dupe.id)
        .modify({ mealId: keep.id });
      await db.meals.delete(dupe.id);
    }
  }
}

export async function ensureDefaultMeals(date: string): Promise<Meal[]> {
  const pending = mealEnsureLocks.get(date);
  if (pending) return pending;

  const task = (async () => {
    await db.transaction("rw", db.meals, db.foodEntries, async () => {
      await dedupeDefaultMeals(date);
      const existing = await db.meals
        .where("date")
        .equals(date)
        .toArray();
      const present = new Set(existing.map((m) => m.type));
      const missing = DEFAULT_MEALS.filter((m) => !present.has(m.type));
      if (missing.length > 0) {
        await db.meals.bulkAdd(missing.map((m) => ({ ...m, date })));
      }
    });
    return db.meals.where("date").equals(date).sortBy("sortOrder");
  })();

  mealEnsureLocks.set(date, task);
  try {
    return await task;
  } finally {
    mealEnsureLocks.delete(date);
  }
}

export async function addSnack(date: string, name: string): Promise<Meal> {
  const meals = await db.meals.where("date").equals(date).toArray();
  const sortOrder =
    meals.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;
  const id = await db.meals.add({
    date,
    type: "snack",
    name: name.trim() || "En-cas",
    sortOrder,
  });
  return (await db.meals.get(id))!;
}

export async function getEntriesForMeals(
  mealIds: number[],
): Promise<FoodEntry[]> {
  if (mealIds.length === 0) return [];
  return db.foodEntries.where("mealId").anyOf(mealIds).toArray();
}

export async function getDayTotals(date: string): Promise<DayTotals> {
  const meals = await db.meals.where("date").equals(date).toArray();
  const entries = await getEntriesForMeals(
    meals.map((m) => m.id!).filter(Boolean),
  );
  return entries.reduce<DayTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
      entryCount: acc.entryCount + 1,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 },
  );
}

export async function getMonthTotals(
  year: number,
  month: number,
): Promise<Record<string, DayTotals>> {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const meals = await db.meals
    .where("date")
    .startsWith(prefix)
    .toArray();
  const byDate = new Map<string, number[]>();
  for (const meal of meals) {
    if (!meal.id) continue;
    const list = byDate.get(meal.date) ?? [];
    list.push(meal.id);
    byDate.set(meal.date, list);
  }

  const result: Record<string, DayTotals> = {};
  for (const [date, mealIds] of byDate) {
    const entries = await getEntriesForMeals(mealIds);
    result[date] = entries.reduce<DayTotals>(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        proteinG: acc.proteinG + e.proteinG,
        carbsG: acc.carbsG + e.carbsG,
        fatG: acc.fatG + e.fatG,
        entryCount: acc.entryCount + 1,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 },
    );
  }
  return result;
}

export async function addFoodEntry(
  entry: Omit<FoodEntry, "id">,
): Promise<number> {
  const id = await db.foodEntries.add(entry);
  return id as number;
}

export async function deleteFoodEntry(id: number): Promise<void> {
  await db.foodEntries.delete(id);
}

export async function deleteMeal(id: number): Promise<void> {
  await db.foodEntries.where("mealId").equals(id).delete();
  await db.meals.delete(id);
}

function normalizeFoodName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function macrosMatch(
  a: Pick<
    CustomFood,
    "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g"
  >,
  b: Pick<
    CustomFood,
    "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g"
  >,
): boolean {
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    round(a.caloriesPer100g) === round(b.caloriesPer100g) &&
    round(a.proteinPer100g) === round(b.proteinPer100g) &&
    round(a.carbsPer100g) === round(b.carbsPer100g) &&
    round(a.fatPer100g) === round(b.fatPer100g)
  );
}

export async function upsertCustomFood(
  food: Omit<CustomFood, "id"> & { id?: number },
): Promise<number> {
  if (food.id) {
    await db.customFoods.put(food as CustomFood);
    return food.id;
  }
  const name = food.name.trim();
  const existing = await db.customFoods.toArray();
  const match = existing.find(
    (item) =>
      normalizeFoodName(item.name) === normalizeFoodName(name) &&
      macrosMatch(item, food),
  );
  if (match?.id) return match.id;
  const id = await db.customFoods.add({ ...food, name });
  return id as number;
}

export async function dedupeIdenticalCustomFoods(): Promise<void> {
  const foods = await db.customFoods.toArray();
  const sorted = [...foods].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const seen = new Map<string, number>();
  for (const food of sorted) {
    if (!food.id) continue;
    const key = [
      normalizeFoodName(food.name),
      food.caloriesPer100g,
      food.proteinPer100g,
      food.carbsPer100g,
      food.fatPer100g,
    ].join("|");
    const keep = seen.get(key);
    if (keep == null) {
      seen.set(key, food.id);
      continue;
    }
    await db.spokenAliases
      .where("customFoodId")
      .equals(food.id)
      .modify({ customFoodId: keep });
    await db.customFoods.delete(food.id);
  }
}

export async function listCustomFoods(): Promise<CustomFood[]> {
  return db.customFoods.orderBy("name").toArray();
}

export async function deleteCustomFood(id: number): Promise<void> {
  await db.transaction("rw", db.customFoods, db.spokenAliases, async () => {
    await db.spokenAliases.where("customFoodId").equals(id).delete();
    await db.customFoods.delete(id);
  });
}

export async function listSpokenAliases(): Promise<SpokenAlias[]> {
  return db.spokenAliases.toArray();
}

export async function addSpokenAlias(
  target: { customFoodId: number } | { stapleId: string },
): Promise<number> {
  const id = await db.spokenAliases.add({
    phrase: "",
    density: 1,
    ...target,
  });
  return id as number;
}

export async function updateSpokenAlias(alias: SpokenAlias): Promise<void> {
  if (!alias.id) return;
  const record: SpokenAlias = {
    id: alias.id,
    phrase: alias.phrase.trim(),
    density: alias.density > 0 ? alias.density : 1,
  };
  if (alias.stapleId) record.stapleId = alias.stapleId;
  else if (alias.customFoodId) record.customFoodId = alias.customFoodId;
  await db.spokenAliases.put(record);
}

export async function deleteSpokenAlias(id: number): Promise<void> {
  await db.spokenAliases.delete(id);
}

function toSavedMealItem(entry: FoodEntry): SavedMealItem {
  const item: SavedMealItem = {
    name: entry.name,
    calories: entry.calories,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    quantityG: entry.quantityG,
  };
  if (entry.offId) item.offId = entry.offId;
  return item;
}

export async function listSavedMeals(): Promise<SavedMeal[]> {
  return db.savedMeals.orderBy("name").toArray();
}

export async function saveMealAsTemplate(
  mealId: number,
  name: string,
): Promise<number> {
  const entries = await db.foodEntries.where("mealId").equals(mealId).toArray();
  if (entries.length === 0) {
    throw new Error("Cannot save an empty meal");
  }
  const id = await db.savedMeals.add({
    name: name.trim(),
    items: entries.map(toSavedMealItem),
  });
  return id as number;
}

export async function applySavedMeal(
  mealId: number,
  savedMealId: number,
): Promise<void> {
  const template = await db.savedMeals.get(savedMealId);
  if (!template || template.items.length === 0) return;
  await db.foodEntries.bulkAdd(
    template.items.map((item) => ({
      mealId,
      name: item.name,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      quantityG: item.quantityG,
      offId: item.offId,
    })),
  );
}

export async function deleteSavedMeal(id: number): Promise<void> {
  await db.savedMeals.delete(id);
}

export async function exportBackup(): Promise<BackupPayload> {
  const [profile, meals, foodEntries, customFoods, savedMeals, spokenAliases] =
    await Promise.all([
      db.profile.get(1),
      db.meals.toArray(),
      db.foodEntries.toArray(),
      db.customFoods.toArray(),
      db.savedMeals.toArray(),
      db.spokenAliases.toArray(),
    ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    meals,
    foodEntries,
    customFoods,
    savedMeals,
    spokenAliases,
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (payload.version !== 1) {
    throw new Error("Format de backup non supporté");
  }
  await db.transaction(
    "rw",
    [
      db.profile,
      db.meals,
      db.foodEntries,
      db.customFoods,
      db.savedMeals,
      db.spokenAliases,
    ],
    async () => {
      await Promise.all([
        db.foodEntries.clear(),
        db.meals.clear(),
        db.customFoods.clear(),
        db.savedMeals.clear(),
        db.spokenAliases.clear(),
        db.profile.clear(),
      ]);
      if (payload.profile) await db.profile.put(payload.profile);
      if (payload.meals.length) await db.meals.bulkPut(payload.meals);
      if (payload.foodEntries.length) {
        await db.foodEntries.bulkPut(payload.foodEntries);
      }
      if (payload.customFoods.length) {
        await db.customFoods.bulkPut(payload.customFoods);
      }
      if (payload.savedMeals?.length) {
        await db.savedMeals.bulkPut(payload.savedMeals);
      }
      if (payload.spokenAliases?.length) {
        await db.spokenAliases.bulkPut(payload.spokenAliases);
      }
    },
  );
}
