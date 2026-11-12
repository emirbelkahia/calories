export interface FoodChoice {
  value: string;
  name: string;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Saved foods stay first. Staples appear once there is a query, capped. */
export function filterFoodChoices(
  query: string,
  saved: FoodChoice[],
  staples: FoodChoice[],
  stapleLimit = 12,
): { saved: FoodChoice[]; staples: FoodChoice[] } {
  const q = fold(query);
  const matches = (name: string) => fold(name).includes(q);
  return {
    saved: q ? saved.filter((item) => matches(item.name)) : saved,
    staples: q
      ? staples.filter((item) => matches(item.name)).slice(0, stapleLimit)
      : [],
  };
}
