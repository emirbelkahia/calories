import { describe, expect, it } from "vitest";
import { filterFoodChoices, type FoodChoice } from "./food-choices";

const saved: FoodChoice[] = [
  { value: "food:1", name: "Whey vanille" },
  { value: "food:2", name: "Flocons avoine maison" },
];

const staples: FoodChoice[] = [
  { value: "staple:avoine", name: "Flocons d'avoine" },
  { value: "staple:abricot", name: "Abricot" },
  { value: "staple:ail", name: "Ail cru" },
];

describe("filterFoodChoices", () => {
  it("lists saved foods and hides the staple catalog until a query", () => {
    const result = filterFoodChoices("", saved, staples);
    expect(result.saved.map((item) => item.name)).toEqual([
      "Whey vanille",
      "Flocons avoine maison",
    ]);
    expect(result.staples).toEqual([]);
  });

  it("puts a saved match before staple matches", () => {
    const result = filterFoodChoices("avoine", saved, staples);
    expect(result.saved.map((item) => item.name)).toEqual([
      "Flocons avoine maison",
    ]);
    expect(result.staples.map((item) => item.name)).toEqual([
      "Flocons d'avoine",
    ]);
  });

  it("ignores accents and caps the staple list", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      value: `staple:${index}`,
      name: `Banane ${index}`,
    }));
    const result = filterFoodChoices("banane", [], many, 12);
    expect(result.staples).toHaveLength(12);
    expect(filterFoodChoices("AIL", saved, staples).staples[0]?.name).toBe(
      "Ail cru",
    );
  });
});
