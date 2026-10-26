import { WEEK_MEAL_TYPES, WeekMealType } from "@/lib/constants";
import { normalizeComparableValue } from "@/lib/domain/mealPlanValidation";
import type { MealBuild, MealIngredient } from "@/lib/types";

/** Rules for every meal of one type (e.g. all dinners). */
export interface TypeRule {
  /** Hard: whole-word terms that must not appear in the meal (e.g. "shrimp"). */
  excludeTerms: string[];
  /** Hard: expands to VEGETARIAN_EXCLUDED_TERMS. */
  vegetarian: boolean;
  /** Soft: passed to the model only (e.g. "not spicy", "two of them vegetarian"). */
  notes: string;
}

/**
 * One-tap exclusions for a whole week, meals and junk list alike. Each expands to the
 * words that mark the food in a product or meal name.
 */
export const SKIP_GROUPS = {
  shellfish: {
    label: "Skip shellfish",
    description: "Shrimp, crab, lobster, clams, oysters, mussels, scallops, squid and the rest, including oyster sauce",
    promptName: "shellfish of any kind",
    terms: [
      "shellfish", "seafood", "shrimp", "prawn", "scampi", "crab", "lobster", "langoustine",
      "crawfish", "crayfish", "clam", "oyster", "mussel", "scallop", "cockle", "whelk",
      "abalone", "squid", "calamari", "octopus", "surimi", "krill", "xo sauce",
    ],
    // Phrases that contain a term but aren't the food.
    allow: ["oyster mushroom", "king oyster mushroom", "crab apple"],
  },
  bellPeppers: {
    label: "Skip bell peppers",
    description: "Bell, sweet and roasted red peppers. Red pepper flakes and chiles are still fine.",
    promptName: "bell peppers",
    // Not plain "red pepper": that would also catch crushed red pepper flakes.
    terms: [
      "bell pepper", "sweet pepper", "capsicum", "roasted red pepper",
      "green pepper", "yellow pepper", "orange pepper",
    ],
    allow: [],
  },
} as const satisfies Record<string, { label: string; description: string; promptName: string; terms: readonly string[]; allow: readonly string[] }>;

export type SkipGroupId = keyof typeof SKIP_GROUPS;
export const SKIP_GROUP_IDS = Object.keys(SKIP_GROUPS) as SkipGroupId[];

export interface GenerationRules {
  week: { excludeTerms: string[]; skipGroups: SkipGroupId[]; notes: string };
  types: Record<WeekMealType, TypeRule>;
}

export function emptyRules(): GenerationRules {
  const types = {} as Record<WeekMealType, TypeRule>;
  for (const type of WEEK_MEAL_TYPES) {
    types[type] = { excludeTerms: [], vegetarian: false, notes: "" };
  }
  return { week: { excludeTerms: [], skipGroups: [], notes: "" }, types };
}

/** Skip-group terms found in a piece of text, ignoring each group's allowed phrases. */
function findSkipGroupTerms(text: string, rules: GenerationRules): string[] {
  return rules.week.skipGroups.flatMap((group) => {
    const { terms, allow } = SKIP_GROUPS[group];
    let cleaned = ` ${normalizeComparableValue(text)} `;
    for (const phrase of allow) {
      const normalized = normalizeComparableValue(phrase);
      for (const form of [normalized, `${normalized}s`]) cleaned = cleaned.split(` ${form} `).join(" ");
    }
    return terms.filter((term) => containsWord(cleaned, term));
  });
}

/** Fills in anything missing so partially written rules (CLI input, saved form state) are safe to use. */
export function normalizeRules(input: unknown): GenerationRules {
  const rules = emptyRules();
  if (!input || typeof input !== "object") return rules;
  const raw = input as Partial<{
    week: Partial<GenerationRules["week"]>;
    types: Partial<Record<WeekMealType, Partial<TypeRule>>>;
  }>;

  rules.week.excludeTerms = toTermList(raw.week?.excludeTerms);
  rules.week.skipGroups = SKIP_GROUP_IDS.filter((id) =>
    Array.isArray(raw.week?.skipGroups) && (raw.week.skipGroups as unknown[]).includes(id)
  );
  rules.week.notes = typeof raw.week?.notes === "string" ? raw.week.notes.trim() : "";

  for (const type of WEEK_MEAL_TYPES) {
    const typeRaw = raw.types?.[type];
    rules.types[type] = {
      excludeTerms: toTermList(typeRaw?.excludeTerms),
      vegetarian: typeRaw?.vegetarian === true,
      notes: typeof typeRaw?.notes === "string" ? typeRaw.notes.trim() : "",
    };
  }

  return rules;
}

function toTermList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((term): term is string => typeof term === "string")
    .map((term) => term.trim())
    .filter(Boolean);
}

export const VEGETARIAN_EXCLUDED_TERMS = [
  "chicken", "beef", "steak", "pork", "bacon", "ham", "prosciutto", "pancetta",
  "salami", "pepperoni", "chorizo", "sausage", "carnitas", "turkey", "lamb", "veal",
  "duck", "meatball", "fish", "salmon", "tuna", "cod", "tilapia", "halibut",
  "trout", "anchovy", "anchovies", "sardine", "shrimp", "prawn", "crab",
  "lobster", "scallop", "clam", "mussel", "oyster", "squid", "calamari",
  "gelatin",
];

// Product names that contain a meat word but are plant-based ("Soy Chorizo", "Meatless Meatballs").
const PLANT_BASED_MARKERS = [
  "soy", "vegan", "plant based", "plant", "meatless", "beyond", "impossible",
  "quorn", "veggie", "vegetarian", "tofu", "tempeh", "seitan", "jackfruit",
];

export interface RuleViolation {
  term: string;
  /** Where the term was found, e.g. `ingredient "Trader Joe's Shrimp Gyoza"`. */
  where: string;
}

export interface CheckableMeal {
  name: string;
  build?: Partial<MealBuild>;
  ingredients?: Pick<MealIngredient, "name">[];
  /** Extra free text to check, e.g. an outline concept. */
  extra?: string[];
}

/** Hard-rule check: case-insensitive whole-word match (with simple plurals) on every named part of a meal. */
export function findRuleViolations(
  meal: CheckableMeal,
  rules: GenerationRules,
  type: WeekMealType
): RuleViolation[] {
  const typeRule = rules.types[type];
  const explicitTerms = [...rules.week.excludeTerms, ...typeRule.excludeTerms];
  const vegetarianTerms = typeRule.vegetarian ? VEGETARIAN_EXCLUDED_TERMS : [];

  const parts: { where: string; text: string }[] = [
    { where: `name "${meal.name}"`, text: meal.name },
    ...(["pro", "base", "veg", "engine"] as const).flatMap((key) =>
      (meal.build?.[key] ?? []).map((value) => ({ where: `build.${key} "${value}"`, text: value }))
    ),
    ...(meal.ingredients ?? []).map((ingredient) => ({
      where: `ingredient "${ingredient.name}"`,
      text: ingredient.name,
    })),
    ...(meal.extra ?? []).map((text) => ({ where: `"${text}"`, text })),
  ];

  const violations: RuleViolation[] = [];
  for (const part of parts) {
    for (const term of explicitTerms) {
      if (containsWord(part.text, term)) violations.push({ term, where: part.where });
    }
    for (const term of findSkipGroupTerms(part.text, rules)) {
      violations.push({ term, where: part.where });
    }
    if (vegetarianTerms.length && !containsWordFromList(part.text, PLANT_BASED_MARKERS)) {
      for (const term of vegetarianTerms) {
        if (containsWord(part.text, term)) violations.push({ term, where: part.where });
      }
    }
  }

  return dedupeViolations(violations);
}

export function containsWord(text: string, term: string): boolean {
  const haystack = ` ${normalizeComparableValue(text)} `;
  const needle = normalizeComparableValue(term);
  if (!needle) return false;
  return [needle, `${needle}s`, `${needle}es`].some((form) => haystack.includes(` ${form} `));
}

function containsWordFromList(text: string, terms: string[]): boolean {
  return terms.some((term) => containsWord(text, term));
}

function dedupeViolations(violations: RuleViolation[]): RuleViolation[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.term}|${violation.where}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Junk list items (or any plain names) that contain a term the whole week must avoid. */
export function findWeekViolations(names: string[], rules: GenerationRules): RuleViolation[] {
  return dedupeViolations(
    names.flatMap((name) =>
      [
        ...rules.week.excludeTerms.filter((term) => containsWord(name, term)),
        ...findSkipGroupTerms(name, rules),
      ].map((term) => ({ term, where: `"${name}"` }))
    )
  );
}

/** Plain-language summary of the skip groups, for prompts. */
export function describeSkipGroups(rules: GenerationRules): string[] {
  return rules.week.skipGroups.map((group) => {
    const { promptName, terms, allow } = SKIP_GROUPS[group];
    const fine = allow.length ? ` ${allow.join(", ")} are fine.` : "";
    return `HARD: no ${promptName} anywhere, including sauces and snacks (watch for: ${terms.join(", ")}).${fine}`;
  });
}

/** Plain-language summary of one meal type's rules, for prompts. */
export function describeTypeRules(rules: GenerationRules, type: WeekMealType): string {
  const typeRule = rules.types[type];
  const lines: string[] = [...describeSkipGroups(rules)];
  const excluded = [...rules.week.excludeTerms, ...typeRule.excludeTerms];
  if (excluded.length) lines.push(`HARD: no meal may contain ${excluded.join(", ")}.`);
  if (typeRule.vegetarian) lines.push("HARD: every meal is vegetarian (no meat, poultry, fish, or seafood).");
  if (typeRule.notes) lines.push(`Preference: ${typeRule.notes}`);
  return lines.length ? lines.join(" ") : "No extra rules.";
}
