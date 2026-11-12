import { describe, expect, it } from "vitest";
import {
  VOICE_MEAL_SCHEMA,
  VOICE_SYSTEM_PROMPT,
  buildVoiceUserPrompt,
  listsFromRequest,
} from "./voice-mistral";
import {
  applyVoicePlan,
  dropReady,
  parseVoiceModel,
  withoutReadyAt,
  toVoiceCatalog,
  voicePromptLists,
  withChoice,
  withDate,
  withMeal,
  type VoiceCatalog,
  type VoicePhrases,
} from "./voice-plan";

const phrases: VoicePhrases = {
  unknownFood: "inconnu",
  missingFood: "supprimé",
  both: "deux",
  badQuantity: "quantité",
  whichFood: "lequel",
};

const catalog: VoiceCatalog = toVoiceCatalog({
  aliases: [
    { id: 1, phrase: "protéines habituelles", customFoodId: 1, density: 1 },
    { id: 2, phrase: "lait de soja", customFoodId: 2, density: 0.92 },
    { id: 3, phrase: "huile habituelle", customFoodId: 9, density: 1 },
    { phrase: "sans id", customFoodId: 1, density: 1 },
  ],
  foods: [
    {
      id: 1,
      name: "Whey vanille",
      caloriesPer100g: 400,
      proteinPer100g: 80,
      carbsPer100g: 10,
      fatPer100g: 5,
    },
    {
      id: 2,
      name: "Lait de soja marque",
      caloriesPer100g: 40,
      proteinPer100g: 3,
      carbsPer100g: 2,
      fatPer100g: 2,
    },
  ],
  staples: [
    {
      id: "ciqual-avoine",
      name: "Flocons d'avoine",
      hints: "avoine, oat flakes",
      caloriesPer100g: 370,
      proteinPer100g: 13,
      carbsPer100g: 60,
      fatPer100g: 7,
    },
  ],
});

const today = "2026-11-08";

function plan(raw: unknown) {
  return applyVoicePlan(parseVoiceModel(raw), catalog, today, phrases);
}

describe("applyVoicePlan", () => {
  it("computes alias macros and ignores calories from the model", () => {
    const draft = plan({
      date: null,
      meal: "breakfast",
      items: [
        {
          spoken: "mes protéines",
          quantity: 30,
          unit: "g",
          aliasId: "1",
          stapleId: null,
          unresolved: false,
          question: "",
          candidates: [],
          calories: 9999,
        },
      ],
    });
    expect(draft.date).toBe(today);
    expect(draft.meal).toBe("breakfast");
    expect(draft.canWrite).toBe(true);
    expect(draft.ready).toEqual([
      expect.objectContaining({
        foodName: "Whey vanille",
        quantityG: 30,
        calories: 120,
        proteinG: 24,
      }),
    ]);
    expect(draft.ready[0]).not.toHaveProperty("caloriesPer100g");
  });

  it("converts millilitres with the alias density", () => {
    const draft = plan({
      date: null,
      meal: "breakfast",
      items: [
        {
          spoken: "lait",
          quantity: 200,
          unit: "ml",
          aliasId: 2,
          stapleId: null,
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(draft.ready[0]).toEqual(
      expect.objectContaining({ quantityG: 184, calories: 74 }),
    );
  });

  it("stores a staple in grams, including spoken millilitres at density 1", () => {
    const draft = plan({
      date: "2026-11-01",
      meal: "lunch",
      items: [
        {
          spoken: "flocons",
          quantity: 150,
          unit: "ml",
          aliasId: null,
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(draft.date).toBe("2026-11-01");
    expect(draft.ready[0]).toEqual(
      expect.objectContaining({
        foodName: "Flocons d'avoine",
        quantityG: 150,
        calories: 555,
      }),
    );
  });

  it("rejects an unknown id and keeps a model unresolved line unwritten", () => {
    const draft = plan({
      date: null,
      meal: "dinner",
      items: [
        {
          spoken: "huile d'olive habituelle",
          quantity: 10,
          unit: "g",
          aliasId: 99,
          stapleId: null,
          unresolved: false,
          question: "",
          candidates: ["1", "nope", "ciqual-avoine"],
        },
        {
          spoken: "protéines",
          quantity: 30,
          unit: "g",
          aliasId: 1,
          stapleId: null,
          unresolved: true,
          question: "Laquelle ?",
          candidates: ["alias:1"],
        },
      ],
    });
    expect(draft.ready).toEqual([]);
    expect(draft.canWrite).toBe(false);
    expect(draft.open[0]).toEqual(
      expect.objectContaining({
        question: "inconnu",
        candidates: [
          { value: "food:1", name: "Whey vanille" },
          { value: "staple:ciqual-avoine", name: "Flocons d'avoine" },
        ],
      }),
    );
    expect(draft.open[1]?.question).toBe("Laquelle ?");
    expect(draft.open[1]?.candidates).toEqual([
      { value: "food:1", name: "Whey vanille" },
    ]);
  });

  it("asks when the model returns two ids or a deleted food", () => {
    const draft = plan({
      date: null,
      meal: "snack",
      items: [
        {
          spoken: "un truc",
          quantity: 10,
          unit: "g",
          aliasId: 1,
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
        {
          spoken: "huile",
          quantity: 5,
          unit: "g",
          aliasId: 3,
          stapleId: null,
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(draft.ready).toEqual([]);
    expect(draft.open.map((line) => line.question)).toEqual([
      "deux",
      "supprimé",
    ]);
    expect(draft.open[0]?.candidates.map((choice) => choice.value)).toEqual([
      "food:1",
      "staple:ciqual-avoine",
    ]);
  });

  it("uses today, yesterday, or asks, and does not guess the meal", () => {
    const named = plan({
      date: "hier",
      meal: "Dîner",
      items: [
        {
          spoken: "flocons",
          quantity: 30,
          unit: "g",
          aliasId: null,
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(named.date).toBe("2026-11-07");
    expect(named.meal).toBe("dinner");
    expect(named.canWrite).toBe(true);

    const unnamed = plan({
      date: "demain",
      meal: null,
      items: [
        {
          spoken: "flocons",
          quantity: 30,
          unit: "g",
          aliasId: null,
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(unnamed.date).toBeNull();
    expect(unnamed.dateQuestion).toBe(true);
    expect(unnamed.meal).toBeNull();
    expect(unnamed.canWrite).toBe(false);
    expect(unnamed.ready).toHaveLength(1);

    const chosen = withMeal(withDate(unnamed, "2026-11-03"), "lunch");
    expect(chosen.date).toBe("2026-11-03");
    expect(chosen.meal).toBe("lunch");
    expect(chosen.canWrite).toBe(true);
    expect(withDate(unnamed, "nope")).toBe(unnamed);
  });

  it("turns a picked food into a ready line and can drop written lines", () => {
    const draft = plan({
      date: null,
      meal: "breakfast",
      items: [
        {
          spoken: "mes protéines",
          quantity: 30,
          unit: "g",
          aliasId: null,
          stapleId: null,
          unresolved: true,
          question: "Laquelle ?",
          candidates: [],
        },
      ],
    });
    const picked = withChoice(draft, 0, "food:1", catalog);
    expect(picked.open).toEqual([]);
    expect(picked.ready[0]).toEqual(
      expect.objectContaining({ calories: 120, quantityG: 30 }),
    );
    expect(picked.canWrite).toBe(true);
    const left = dropReady(picked, 1);
    expect(left.ready).toEqual([]);
    expect(left.canWrite).toBe(false);
    expect(withoutReadyAt(picked, 0).ready).toEqual([]);
    expect(withoutReadyAt(picked, 4)).toBe(picked);
  });

  it("reads an empty string as an absence", () => {
    const draft = plan({
      date: "",
      meal: "",
      items: [
        {
          spoken: "flocons",
          quantity: 30,
          unit: "g",
          aliasId: "",
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(draft.date).toBe(today);
    expect(draft.dateQuestion).toBe(false);
    expect(draft.meal).toBeNull();
    expect(draft.canWrite).toBe(false);
    expect(draft.ready).toHaveLength(1);
  });

  it("asks again when the quantity is unreadable", () => {
    const draft = plan({
      date: null,
      meal: "breakfast",
      items: [
        {
          spoken: "flocons",
          quantity: 0,
          unit: "g",
          aliasId: null,
          stapleId: "ciqual-avoine",
          unresolved: false,
          question: "",
          candidates: [],
        },
      ],
    });
    expect(draft.ready).toEqual([]);
    expect(draft.open[0]).toEqual(
      expect.objectContaining({ quantity: null, question: "quantité" }),
    );
    expect(withChoice(draft, 0, "staple:ciqual-avoine", catalog)).toBe(draft);
  });
});

describe("voice prompt", () => {
  it("sends ids and names, not nutrition numbers", () => {
    const lists = voicePromptLists(catalog);
    const prompt = buildVoiceUserPrompt("Petit-déjeuner, 30 grammes", lists);
    expect(prompt).toContain("Petit-déjeuner, 30 grammes");
    expect(prompt).toContain("1 | protéines habituelles | Whey vanille");
    expect(prompt).toContain("ciqual-avoine | Flocons d'avoine | avoine, oat flakes");
    expect(prompt).not.toContain("400");
    expect(prompt).not.toContain("370");
    expect(JSON.stringify(VOICE_MEAL_SCHEMA)).not.toMatch(/calor/i);
    expect(VOICE_SYSTEM_PROMPT).toContain("Tu ne calcules aucune calorie");
  });

  it("drops unknown ids and extra fields before the prompt is built", () => {
    const prepared = listsFromRequest({
      transcript: "  un repas  ",
      aliases: [
        { id: "1", phrase: "protéines", food: "Whey", calories: 9999 },
        { id: "nope", phrase: "x", food: "y" },
      ],
      staples: [
        { id: "ciqual-avoine", name: "Flocons", hints: "avoine", kcal: 12 },
      ],
    });
    expect(prepared?.transcript).toBe("un repas");
    expect(prepared?.lists.aliases).toEqual([
      { id: "1", phrase: "protéines", food: "Whey" },
    ]);
    expect(JSON.stringify(prepared)).not.toContain("9999");
    expect(listsFromRequest({ transcript: "   ", aliases: [], staples: [] })).toBeNull();
    expect(
      listsFromRequest({
        transcript: "a".repeat(2001),
        aliases: [],
        staples: [],
      }),
    ).toBeNull();
  });

  it("skips a blank phrase when building the catalog", () => {
    expect(catalog.aliases.map((alias) => alias.id)).toEqual([1, 2, 3]);
    expect(catalog.aliases[1]?.density).toBe(0.92);
    expect(catalog.aliases[2]?.foodName).toBe("huile habituelle");
  });
});
