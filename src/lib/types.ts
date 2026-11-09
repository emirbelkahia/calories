export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type DayColor = "green" | "yellow" | "red" | "gray" | "blue";

export type GoalMode = "deficit" | "maintain" | "surplus";

export interface Profile {
  id: 1;
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activity: ActivityLevel;
  goalMode: GoalMode;
  /** Percent for deficit/surplus (ignored for maintain). */
  goalPercent: number;
  /** Target protein grams per kg bodyweight (1.6–2.0). */
  proteinGPerKg: number;
  dailyCalorieTarget: number;
  dailyProteinTargetG: number;
  /** Manual carb quota (g/day). Absent = Anses-derived from kcal + protein. */
  dailyCarbsTargetG?: number;
  /** Manual fat quota (g/day). Absent = Anses-derived from kcal + protein. */
  dailyFatTargetG?: number;
}

export interface Meal {
  id?: number;
  date: string;
  type: MealType;
  name: string;
  sortOrder: number;
}

export interface FoodEntry {
  id?: number;
  mealId: number;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantityG: number;
  offId?: string;
}

export interface CustomFood {
  id?: number;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

/** Snapshot of a meal’s foods. Applying copies these; logged meals stay untouched. */
export interface SavedMealItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantityG: number;
  offId?: string;
}

export interface SavedMeal {
  id?: number;
  name: string;
  items: SavedMealItem[];
}

/** A phrase said out loud, pointing at one saved food or one kitchen staple. */
export interface SpokenAlias {
  id?: number;
  phrase: string;
  customFoodId?: number;
  stapleId?: string;
  /** Grams per millilitre. 1 means 150 ml is stored as 150 g. */
  density: number;
}

export interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryCount: number;
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  profile: Profile | null;
  meals: Meal[];
  foodEntries: FoodEntry[];
  customFoods: CustomFood[];
  /** Absent on backups made before saved-meal templates. */
  savedMeals?: SavedMeal[];
  /** Absent on backups made before spoken aliases. */
  spokenAliases?: SpokenAlias[];
}
