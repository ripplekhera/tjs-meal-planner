import { EXPECTED_MEAL_COUNTS, MAX_BUILD_VALUE_USES_PER_WEEK } from "@/lib/constants";
import { deriveShoppingListFromMeals } from "@/lib/domain/shoppingListDerivation";
import { classifyShoppingItem } from "@/lib/shoppingListOrder";
import { ListCategory, Macros, MealInput, WeekData } from "@/lib/types";

export const REQUIRED_JUNK_CATEGORIES = [
  "Coffee/Creamer",
  "Beer/Wine",
  "Chips",
  "Sweets",
  "Frozen Food",
  "Frozen Treats",
  "Beverages/Drinks",
] as const;

const MACRO_KEYS = ["cal", "p", "c", "f", "fiber"] as const;

export interface WeekValidationOptions {
  allowShoppingFallbacks?: boolean;
  macroTolerance?: number;
  /** Week data as authored, before normalization fills in missing fiber. Defaults to weekData. */
  rawWeekData?: WeekData;
}

export interface WeekValidationResult {
  valid: boolean;
  shoppingList: ListCategory[];
  errors: string[];
  warnings: string[];
}

/** Structural checks shared by the file-based CLI validator and in-app generation. */
export function validateWeekData(
  weekData: WeekData,
  options: WeekValidationOptions = {}
): WeekValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const macroTolerance = options.macroTolerance ?? 1;

  validateMealCounts(weekData, errors);
  validateFiberPresence(options.rawWeekData ?? weekData, errors);
  validateIngredientMacroTotals(weekData, macroTolerance, errors);
  validateUniqueBuildValues(weekData, "base", errors);
  validateUniqueBuildValues(weekData, "engine", errors);
  validateJunkCategories(weekData, errors);

  const shoppingList = deriveShoppingListFromMeals(
    weekData.meals,
    [],
    weekData.junkList,
    weekData.householdGoods ?? []
  );
  validateShoppingClassifications(
    shoppingList,
    errors,
    warnings,
    Boolean(options.allowShoppingFallbacks)
  );

  return { valid: errors.length === 0, shoppingList, errors, warnings };
}

function validateMealCounts(weekData: WeekData, errors: string[]) {
  const counts = weekData.meals.reduce<Record<string, number>>((acc, meal) => {
    acc[meal.type] = (acc[meal.type] ?? 0) + 1;
    return acc;
  }, {});

  for (const [type, want] of Object.entries(EXPECTED_MEAL_COUNTS)) {
    const got = counts[type] ?? 0;
    if (got !== want) {
      errors.push(`Expected ${want} ${type}(s), found ${got}.`);
    }
  }

  const totalExpected = Object.values(EXPECTED_MEAL_COUNTS).reduce((sum, count) => sum + count, 0);
  if (weekData.meals.length !== totalExpected) {
    errors.push(`Expected ${totalExpected} total meals, found ${weekData.meals.length}.`);
  }
}

function validateFiberPresence(weekData: WeekData, errors: string[]) {
  weekData.meals.forEach((meal, mealIndex) => {
    if (!hasNumericMacro(meal.macros, "fiber")) {
      errors.push(`meals[${mealIndex}] "${meal.name}" is missing numeric macros.fiber.`);
    }

    meal.ingredients?.forEach((ingredient, ingredientIndex) => {
      if (!hasNumericMacro(ingredient.macros, "fiber")) {
        errors.push(
          `meals[${mealIndex}].ingredients[${ingredientIndex}] "${ingredient.name}" is missing numeric macros.fiber.`
        );
      }
    });
  });
}

function validateIngredientMacroTotals(weekData: WeekData, tolerance: number, errors: string[]) {
  weekData.meals.forEach((meal, mealIndex) => {
    if (!meal.ingredients?.length) {
      errors.push(`meals[${mealIndex}] "${meal.name}" must include ingredients for macro validation.`);
      return;
    }

    const ingredientTotals = sumIngredientMacros(meal.ingredients);
    for (const macroKey of MACRO_KEYS) {
      const diff = Math.abs(ingredientTotals[macroKey] - meal.macros[macroKey]);
      if (diff > tolerance) {
        errors.push(
          `meals[${mealIndex}] "${meal.name}" ${macroKey} total mismatch: ingredients=${round(ingredientTotals[macroKey])}, meal=${meal.macros[macroKey]}.`
        );
      }
    }
  });
}

function validateUniqueBuildValues(
  weekData: WeekData,
  buildKey: "base" | "engine",
  errors: string[]
) {
  for (const usage of countBuildValueUses(weekData.meals, buildKey)) {
    if (usage.meals.length > MAX_BUILD_VALUE_USES_PER_WEEK) {
      errors.push(
        `${buildKey} "${usage.value}" is in ${usage.meals.length} meals (max ${MAX_BUILD_VALUE_USES_PER_WEEK} per week): ${usage.meals
          .map((meal) => `"${meal.name}"`)
          .join(", ")}.`
      );
    }
  }
}

export interface BuildValueUsage<TMeal> {
  /** The value as first written. */
  value: string;
  /** Meals that use it, counted once per meal. */
  meals: TMeal[];
}

/** Groups meals by base or engine value, ignoring case and punctuation. */
export function countBuildValueUses<TMeal extends Pick<MealInput, "name" | "build">>(
  meals: TMeal[],
  buildKey: "base" | "engine"
): BuildValueUsage<TMeal>[] {
  const byValue = new Map<string, BuildValueUsage<TMeal>>();

  for (const meal of meals) {
    const seenInMeal = new Set<string>();
    for (const value of meal.build[buildKey]) {
      const normalized = normalizeComparableValue(value);
      if (!normalized || seenInMeal.has(normalized)) continue;
      seenInMeal.add(normalized);

      const usage = byValue.get(normalized) ?? { value, meals: [] };
      usage.meals.push(meal);
      byValue.set(normalized, usage);
    }
  }

  return [...byValue.values()];
}

function validateJunkCategories(weekData: WeekData, errors: string[]) {
  const actual = weekData.junkList.map((category) => category.category);

  if (actual.length !== REQUIRED_JUNK_CATEGORIES.length) {
    errors.push(
      `Junk list must have ${REQUIRED_JUNK_CATEGORIES.length} categories, found ${actual.length}.`
    );
  }

  REQUIRED_JUNK_CATEGORIES.forEach((category, index) => {
    if (actual[index] !== category) {
      errors.push(
        `Junk list category ${index + 1} must be "${category}", found "${actual[index] ?? "(missing)"}".`
      );
    }
  });
}

function validateShoppingClassifications(
  shoppingList: ListCategory[],
  errors: string[],
  warnings: string[],
  allowShoppingFallbacks: boolean
) {
  const fallbackItems = shoppingList.flatMap((category) =>
    category.items
      .map((item) => ({
        category: category.category,
        itemName: item.n,
        classification: classifyShoppingItem(item.n),
      }))
      .filter(({ classification }) => classification.confidence === "fallback")
  );

  if (!fallbackItems.length) {
    return;
  }

  const message = `Shopping classification fallback for: ${fallbackItems
    .map((item) => `"${item.itemName}" -> ${item.category}`)
    .join(", ")}.`;

  if (allowShoppingFallbacks) {
    warnings.push(message);
  } else {
    errors.push(message);
  }
}

export function sumIngredientMacros(ingredients: MealInput["ingredients"] = []): Macros {
  return ingredients.reduce<Macros>(
    (acc, ingredient) => ({
      cal: acc.cal + ingredient.macros.cal,
      p: acc.p + ingredient.macros.p,
      c: acc.c + ingredient.macros.c,
      f: acc.f + ingredient.macros.f,
      fiber: acc.fiber + ingredient.macros.fiber,
    }),
    { cal: 0, p: 0, c: 0, f: 0, fiber: 0 }
  );
}

function hasNumericMacro(macros: Partial<Macros> | undefined, macroKey: keyof Macros) {
  const value = macros?.[macroKey];
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeComparableValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
