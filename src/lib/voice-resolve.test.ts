import { describe, expect, it } from "vitest";
import {
  resolveUtterance,
  type ResolveAlias,
  type ResolveFood,
  type ResolveStaple,
} from "./voice-resolve";

const whey: ResolveFood = {
  id: 1,
  name: "Whey vanille",
  caloriesPer100g: 400,
  proteinPer100g: 80,
  carbsPer100g: 10,
  fatPer100g: 5,
};

const soy: ResolveFood = {
  id: 2,
  name: "Lait de soja marque",
  caloriesPer100g: 40,
  proteinPer100g: 3,
  carbsPer100g: 2,
  fatPer100g: 2,
};

const aliases: ResolveAlias[] = [
  { phrase: "protéines habituelles", foodId: 1, density: 1 },
  { phrase: "lait de soja", foodId: 2, density: 1 },
];

const staples: ResolveStaple[] = [
  {
    id: "ciqual-avoine",
    name: "Flocons d'avoine",
    aliases: ["avoine", "flocons"],
    caloriesPer100g: 370,
    proteinPer100g: 13,
    carbsPer100g: 60,
    fatPer100g: 7,
  },
  {
    id: "ciqual-lait",
    name: "Lait demi-écrémé",
    aliases: ["lait"],
    caloriesPer100g: 46,
    proteinPer100g: 3.3,
    carbsPer100g: 4.8,
    fatPer100g: 1.6,
  },
];

describe("resolveUtterance", () => {
  it("maps a personal phrase to the saved food and scales macros", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "protéines habituelles", quantity: 30, unit: "g" }],
      },
      aliases,
      [whey, soy],
      staples,
    );

    expect(result.canWrite).toBe(true);
    expect(result.meal).toBe("breakfast");
    expect(result.lines).toEqual([
      {
        phrase: "protéines habituelles",
        foodName: "Whey vanille",
        quantityG: 30,
        calories: 120,
        proteinG: 24,
        carbsG: 3,
        fatG: 1.5,
        source: "alias",
      },
    ]);
  });

  it("matches the phrase ignoring case and accents", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "PROTEINES HABITUELLES", quantity: 30, unit: "g" }],
      },
      aliases,
      [whey],
      staples,
    );

    expect(result.lines[0]?.foodName).toBe("Whey vanille");
    expect(result.questions).toEqual([]);
  });

  it("converts millilitres to grams with the product density", () => {
    const watery = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "lait de soja", quantity: 150, unit: "ml" }],
      },
      aliases,
      [soy],
      staples,
    );
    expect(watery.lines[0]).toMatchObject({ quantityG: 150, calories: 60 });

    const oilAliases: ResolveAlias[] = [
      { phrase: "huile d'olive", foodId: 3, density: 0.92 },
    ];
    const oil: ResolveFood = {
      id: 3,
      name: "Huile d'olive",
      caloriesPer100g: 900,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 100,
    };
    const oily = resolveUtterance(
      {
        meal: "lunch",
        items: [{ phrase: "huile d'olive", quantity: 150, unit: "ml" }],
      },
      oilAliases,
      [oil],
      [],
    );
    expect(oily.lines[0]?.quantityG).toBe(138);
  });

  it("asks and writes nothing when the phrase is unknown", () => {
    const result = resolveUtterance(
      {
        meal: "lunch",
        items: [{ phrase: "un truc bizarre", quantity: 40, unit: "g" }],
      },
      aliases,
      [whey, soy],
      staples,
    );

    expect(result.lines).toEqual([]);
    expect(result.questions).toEqual([
      { phrase: "un truc bizarre", reason: "unknown" },
    ]);
    expect(result.canWrite).toBe(false);
  });

  it("keeps the known line and asks about the unknown one", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [
          { phrase: "flocons d'avoine", quantity: 40, unit: "g" },
          { phrase: "protéines mystère", quantity: 30, unit: "g" },
        ],
      },
      aliases,
      [whey],
      staples,
    );

    expect(result.lines.map((line) => line.foodName)).toEqual([
      "Flocons d'avoine",
    ]);
    expect(result.lines[0]).toMatchObject({
      quantityG: 40,
      calories: 148,
      source: "staple",
    });
    expect(result.questions).toEqual([
      { phrase: "protéines mystère", reason: "unknown" },
    ]);
    expect(result.canWrite).toBe(false);
  });

  it("targets breakfast and refuses to write when the meal was not said", () => {
    const named = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "flocons", quantity: 40, unit: "g" }],
      },
      [],
      [],
      staples,
    );
    expect(named.meal).toBe("breakfast");
    expect(named.mealQuestion).toBe(false);
    expect(named.canWrite).toBe(true);

    const unnamed = resolveUtterance(
      {
        meal: null,
        items: [{ phrase: "flocons", quantity: 40, unit: "g" }],
      },
      [],
      [],
      staples,
    );
    expect(unnamed.mealQuestion).toBe(true);
    expect(unnamed.lines).toHaveLength(1);
    expect(unnamed.canWrite).toBe(false);
  });

  it("asks when the alias points at a deleted food", () => {
    const result = resolveUtterance(
      {
        meal: "dinner",
        items: [{ phrase: "protéines habituelles", quantity: 30, unit: "g" }],
      },
      aliases,
      [],
      staples,
    );

    expect(result.lines).toEqual([]);
    expect(result.questions[0]?.reason).toBe("missing-food");
  });

  it("prefers the personal alias over a staple with the same words", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "lait", quantity: 100, unit: "ml" }],
      },
      [{ phrase: "lait", foodId: 2, density: 1 }],
      [soy],
      staples,
    );

    expect(result.lines[0]).toMatchObject({
      foodName: "Lait de soja marque",
      source: "alias",
    });
  });

  it("maps a vague phrase to a kitchen staple chosen in the dictionary", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "protéines habituelles", quantity: 30, unit: "g" }],
      },
      [{ phrase: "protéines habituelles", stapleId: "ciqual-avoine", density: 1 }],
      [],
      staples,
    );

    expect(result.lines[0]).toMatchObject({
      foodName: "Flocons d'avoine",
      quantityG: 30,
      source: "alias",
    });
  });

  it("prefers the longer alias when one phrase contains another", () => {
    const result = resolveUtterance(
      {
        meal: "breakfast",
        items: [{ phrase: "lait de soja", quantity: 150, unit: "ml" }],
      },
      [
        { phrase: "lait", foodId: 1, density: 1 },
        { phrase: "lait de soja", foodId: 2, density: 1 },
      ],
      [whey, soy],
      staples,
    );

    expect(result.lines[0]?.foodName).toBe("Lait de soja marque");
  });
});
