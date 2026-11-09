export interface OffFoodResult {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  imageUrl?: string;
}

const OFF_USER_AGENT =
  "CalorieTracker/0.1 (https://github.com/emirbelkahia/calories)";

const OFF_PRODUCT_FIELDS =
  "code,product_name,product_name_fr,brands,image_front_small_url,nutriments";

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isPlausibleBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  image_front_small_url?: string;
  nutriments?: Record<string, number | undefined>;
}

function pickNutrient(
  nutriments: Record<string, number | undefined> | undefined,
  keys: string[],
): number {
  if (!nutriments) return 0;
  for (const key of keys) {
    const value = nutriments[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return 0;
}

export function mapOffProduct(product: OffProduct): OffFoodResult | null {
  const name =
    product.product_name_fr?.trim() || product.product_name?.trim() || "";
  if (!name) return null;

  let caloriesPer100g = pickNutrient(product.nutriments, [
    "energy-kcal_100g",
    "energy-kcal",
  ]);

  if (
    caloriesPer100g === 0 &&
    product.nutriments?.["energy_100g"] &&
    !product.nutriments?.["energy-kcal_100g"]
  ) {
    // energy_100g is often kJ
    caloriesPer100g = product.nutriments["energy_100g"] / 4.184;
  }

  return {
    id: product.code || name,
    name,
    brand: product.brands?.split(",")[0]?.trim() || undefined,
    caloriesPer100g: Math.round(caloriesPer100g * 10) / 10,
    proteinPer100g:
      Math.round(
        pickNutrient(product.nutriments, ["proteins_100g", "proteins"]) * 10,
      ) / 10,
    carbsPer100g:
      Math.round(
        pickNutrient(product.nutriments, [
          "carbohydrates_100g",
          "carbohydrates",
        ]) * 10,
      ) / 10,
    fatPer100g:
      Math.round(pickNutrient(product.nutriments, ["fat_100g", "fat"]) * 10) /
      10,
    imageUrl: product.image_front_small_url,
  };
}

export function scaleMacros(
  per100g: {
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  },
  quantityG: number,
) {
  const factor = quantityG / 100;
  return {
    calories: Math.round(per100g.caloriesPer100g * factor),
    proteinG: Math.round(per100g.proteinPer100g * factor * 10) / 10,
    carbsG: Math.round(per100g.carbsPer100g * factor * 10) / 10,
    fatG: Math.round(per100g.fatPer100g * factor * 10) / 10,
  };
}

async function fetchOffSearch(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<OffFoodResult[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "24",
    lc: "fr",
    cc: "fr",
    fields:
      "code,product_name,product_name_fr,brands,image_front_small_url,nutriments",
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": OFF_USER_AGENT,
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`OFF HTTP ${res.status}`);
  }

  const data = (await res.json()) as { products?: OffProduct[] };
  return preferUnbranded(
    (data.products ?? [])
      .map(mapOffProduct)
      .filter((p): p is OffFoodResult => Boolean(p))
      .filter(
        (p) =>
          p.caloriesPer100g > 0 ||
          p.proteinPer100g > 0 ||
          p.carbsPer100g > 0 ||
          p.fatPer100g > 0,
      ),
  );
}

/** Generic / no-brand products first; branded items stay below. */
export function preferUnbranded(products: OffFoodResult[]): OffFoodResult[] {
  return [...products].sort((a, b) => {
    const aBrand = a.brand ? 1 : 0;
    const bBrand = b.brand ? 1 : 0;
    return aBrand - bBrand;
  });
}

export async function searchOpenFoodFacts(
  query: string,
  signal?: AbortSignal,
): Promise<OffFoodResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const endpoints = [
    "https://world.openfoodfacts.org/cgi/search.pl",
    "https://fr.openfoodfacts.org/cgi/search.pl",
  ];

  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await fetchOffSearch(endpoint, q, signal);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Recherche Open Food Facts indisponible");
}

/** Product lookup by EAN/UPC — more reliable than text search. */
export async function getOpenFoodFactsProduct(
  barcode: string,
  signal?: AbortSignal,
): Promise<OffFoodResult | null> {
  const code = normalizeBarcode(barcode);
  if (!isPlausibleBarcode(code)) return null;

  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${code}`,
    `https://fr.openfoodfacts.org/api/v2/product/${code}`,
  ];

  let networkError = false;
  for (const base of urls) {
    try {
      const res = await fetch(`${base}?fields=${OFF_PRODUCT_FIELDS}`, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": OFF_USER_AGENT,
        },
        next: { revalidate: 0 },
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        networkError = true;
        continue;
      }
      const data = (await res.json()) as {
        status?: number;
        product?: OffProduct;
      };
      if (data.status !== 1 || !data.product) continue;
      const mapped = mapOffProduct(data.product);
      if (mapped) return mapped;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      networkError = true;
    }
  }

  if (networkError) {
    throw new Error("Fiche Open Food Facts indisponible");
  }
  return null;
}
