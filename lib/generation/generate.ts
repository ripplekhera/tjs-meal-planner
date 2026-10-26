import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  EXPECTED_MEAL_COUNTS,
  MEAL_TYPE_LABELS,
  MAX_BUILD_VALUE_USES_PER_WEEK,
  WEEK_MEAL_TYPES,
  WeekMealType,
  formatMealCount,
} from "@/lib/constants";
import {
  countBuildValueUses,
  normalizeComparableValue,
  validateWeekData,
} from "@/lib/domain/mealPlanValidation";
import {
  GenerationRules,
  describeSkipGroups,
  describeTypeRules,
  findRuleViolations,
  findWeekViolations,
} from "@/lib/generation/rules";
import {
  GeneratedJunkListSchema,
  GeneratedMealsSchema,
  toJunkList,
  toMealInput,
} from "@/lib/generation/schema";
import type { ListCategory, MealInput, MealType, WeekData } from "@/lib/types";

export const GENERATION_MODEL = "claude-opus-5-5";

/** Each meal type is its own Claude call, and so is the junk list. They run in parallel. */
export type GenerationPart = WeekMealType | "Junk";

const GENERATION_PARTS: GenerationPart[] = [...WEEK_MEAL_TYPES, "Junk"];

export interface PlanningGuide {
  file: string;
  content: string;
}

export interface RecentHistory {
  meals: { name: string; type: MealType; weekRange: string }[];
  junkItems: string[];
}

export interface ModelTurn<T> {
  /** Parsed output, or null when the response didn't match the schema. */
  output: T | null;
  /** Full response content, appended as-is so later turns keep Claude's thinking. */
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: string | null;
  refusalCategory?: string | null;
}

export type CallModel = <T>(request: {
  part: GenerationPart;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: z.ZodType<T>;
}) => Promise<ModelTurn<T>>;

export interface GenerateWeekInput {
  weekRange: string;
  rules: GenerationRules;
  guides: PlanningGuide[];
  history: RecentHistory;
  /** First round plus repair rounds. Each round takes as long as its slowest call. */
  maxAttempts?: number;
  /** Don't start a repair round once this many ms have passed since the start. */
  deadlineMs?: number;
}

export interface GenerateWeekResult {
  /** The last week Claude produced; check `valid` before saving it. */
  weekData: WeekData;
  valid: boolean;
  errors: string[];
  warnings: string[];
  attempts: number;
}

export interface WeekCheck {
  valid: boolean;
  errors: string[];
  /** The same errors, filed under the part (meal type or junk list) that should fix them. */
  byPart: Partial<Record<GenerationPart, string[]>>;
  warnings: string[];
}

/** Raised when Claude returns nothing usable (refusal, truncation, schema mismatch). */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Asks Claude for every meal type and the junk list in parallel, checks the assembled
 * week, and sends each failing part its own failures until the week passes or the
 * attempts run out.
 */
export async function generateWeek(
  input: GenerateWeekInput,
  callModel: CallModel = callClaude
): Promise<GenerateWeekResult> {
  const startedAt = Date.now();
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  const system = buildSystemPrompt(input.guides);

  const conversations = {} as Record<GenerationPart, Anthropic.Beta.BetaMessageParam[]>;
  for (const type of WEEK_MEAL_TYPES) {
    conversations[type] = [{ role: "user", content: buildTypePrompt(type, input) }];
  }
  conversations.Junk = [{ role: "user", content: buildJunkPrompt(input) }];

  const mealsByType = {} as Record<WeekMealType, MealInput[]>;
  let junkList: ListCategory[] = [];

  async function runPart(part: GenerationPart) {
    const messages = conversations[part];
    if (part === "Junk") {
      const turn = await callModel({ part, system, messages, schema: GeneratedJunkListSchema });
      if (!turn.output) throw new GenerationError(describeUnusableTurn(part, turn));
      messages.push({ role: "assistant", content: turn.content });
      junkList = toJunkList(turn.output);
    } else {
      const turn = await callModel({ part, system, messages, schema: GeneratedMealsSchema });
      if (!turn.output) throw new GenerationError(describeUnusableTurn(part, turn));
      messages.push({ role: "assistant", content: turn.content });
      mealsByType[part] = turn.output.meals.map((meal) => toMealInput(meal, part));
    }
  }

  let pending: GenerationPart[] = [...GENERATION_PARTS];
  let attempts = 0;
  let weekData: WeekData;
  let check: WeekCheck;

  while (true) {
    attempts++;
    await Promise.all(pending.map(runPart));

    weekData = {
      weekRange: input.weekRange,
      meals: WEEK_MEAL_TYPES.flatMap((type) => mealsByType[type]),
      junkList,
    };
    check = checkGeneratedWeek(weekData, input.rules, input.history);

    const outOfTime = input.deadlineMs !== undefined && Date.now() - startedAt > input.deadlineMs;
    if (check.valid || attempts >= maxAttempts || outOfTime) break;

    const failingParts = GENERATION_PARTS.filter((part) => check.byPart[part]?.length);
    const repairParts: GenerationPart[] = failingParts.length ? failingParts : [...WEEK_MEAL_TYPES];
    for (const part of repairParts) {
      const errors = check.byPart[part]?.length ? check.byPart[part]! : check.errors;
      conversations[part].push({
        role: "user",
        content: part === "Junk" ? buildJunkRepairPrompt(errors) : buildRepairPrompt(part, errors, weekData),
      });
    }
    pending = repairParts;
  }

  return { weekData, valid: check.valid, errors: check.errors, warnings: check.warnings, attempts };
}

/** Everything the app can verify about a generated week. Shopping-area fallbacks are only warnings. */
export function checkGeneratedWeek(
  weekData: WeekData,
  rules: GenerationRules,
  history: RecentHistory
): WeekCheck {
  const byPart: Partial<Record<GenerationPart, string[]>> = {};
  const fileError = (part: GenerationPart, message: string) => {
    (byPart[part] ??= []).push(message);
  };

  const mealsOf = (type: WeekMealType) => weekData.meals.filter((meal) => meal.type === type);
  const recentByName = new Map(
    history.meals.map((meal) => [normalizeComparableValue(meal.name), meal])
  );
  const namesThisWeek = new Set<string>();

  for (const type of WEEK_MEAL_TYPES) {
    const meals = mealsOf(type);
    if (meals.length !== EXPECTED_MEAL_COUNTS[type]) {
      fileError(type, `Expected ${formatMealCount(type)}, got ${meals.length}.`);
    }

    for (const meal of meals) {
      for (const pillar of ["pro", "base", "veg", "engine"] as const) {
        if (meal.build[pillar].length === 0) {
          fileError(type, `"${meal.name}" has no ${pillar} in its build.`);
        }
      }

      for (const violation of findRuleViolations(meal, rules, type)) {
        fileError(type, `"${meal.name}" breaks a hard rule: "${violation.term}" appears in ${violation.where}.`);
      }

      const normalizedName = normalizeComparableValue(meal.name);
      const repeat = recentByName.get(normalizedName);
      if (repeat) {
        fileError(type, `"${meal.name}" was already on the menu for ${repeat.weekRange}.`);
      } else if (namesThisWeek.has(normalizedName)) {
        fileError(type, `"${meal.name}" appears twice this week.`);
      }
      namesThisWeek.add(normalizedName);
    }
  }

  // Bases and engines used in too many meals. The meal type that uses a value most keeps
  // it; every other type that uses it is asked to replace it.
  for (const buildKey of ["base", "engine"] as const) {
    for (const usage of countBuildValueUses(weekData.meals, buildKey)) {
      if (usage.meals.length <= MAX_BUILD_VALUE_USES_PER_WEEK) continue;

      const usingTypes = WEEK_MEAL_TYPES.map((type) => ({
        type,
        meals: usage.meals.filter((meal) => meal.type === type),
      }))
        .filter((group) => group.meals.length > 0)
        .sort((a, b) => b.meals.length - a.meals.length);

      const [keeper, ...others] = usingTypes;
      if (keeper.meals.length > MAX_BUILD_VALUE_USES_PER_WEEK) {
        fileError(
          keeper.type,
          `${buildKey} "${usage.value}" is in ${keeper.meals.length} of these meals (${listNames(keeper.meals)}); use it in at most ${MAX_BUILD_VALUE_USES_PER_WEEK}.`
        );
      }
      for (const group of others) {
        fileError(
          group.type,
          `${buildKey} "${usage.value}" is in ${usage.meals.length} meals this week (max ${MAX_BUILD_VALUE_USES_PER_WEEK}), and other meal types are keeping it; replace it in ${listNames(group.meals)}.`
        );
      }
    }
  }

  for (const violation of findWeekViolations(
    weekData.junkList.flatMap((category) => category.items.map((item) => item.n)),
    rules
  )) {
    fileError("Junk", `Junk list item ${violation.where} breaks a hard rule: it contains "${violation.term}".`);
  }

  const validation = validateWeekData(weekData, { allowShoppingFallbacks: true });
  const attributed = GENERATION_PARTS.flatMap((part) => byPart[part] ?? []);
  // The checks above cover what Claude can get wrong; validateWeekData is the final word,
  // so anything it alone catches still makes the week invalid.
  const errors = attributed.length ? attributed : validation.errors;

  return { valid: errors.length === 0, errors, byPart, warnings: validation.warnings };
}

function listNames(meals: MealInput[]): string {
  return meals.map((meal) => `"${meal.name}"`).join(", ");
}

export function buildSystemPrompt(guides: PlanningGuide[]): string {
  const guideBlocks = guides
    .map((guide) => `<guide file="${guide.file}">\n${guide.content.trim()}\n</guide>`)
    .join("\n\n");
  const weekShape = WEEK_MEAL_TYPES.map((type) => formatMealCount(type)).join(", ");

  return `You plan Trader Joe's meals for Harvest, a household meal planner.

A week is ${weekShape}, with no days or timeslots, plus a companion junk list. Each request asks you for one part of a week: all the meals of one type, or the junk list. The other parts are planned at the same time in separate requests. Return your part through the JSON schema you were given. The guides below also describe markdown files, file names and CLI commands; those belong to a different workflow, so ignore them.

How each meal is built:
- \`build\` has four pillars: pro (high-density protein), base (complex carb or filler), veg (fiber and micronutrients) and engine (the signature Trader Joe's flavor: a sauce, seasoning or dressing). Each pillar is a list of product names, with 4-7 build items per meal in total.
- \`ingredients\` lists everything to buy for the meal, each with its pillar as \`category\`. \`quantity\` is the amount to buy for all the servings the household guide calls for (e.g. "2 lb, for 4 servings"). \`macros\` (cal, p, c, f, fiber in grams) are for that ingredient in **one adult serving**. The app adds these up into the meal card, so make each ingredient's numbers realistic per serving.
- Optional parts of a meal (a topping some people skip, a separately cooked add-on, heat added at the table) are their own ingredients, with a prep note in the name or quantity saying who it's for.
- Use real Trader Joe's product names, such as "Trader Joe's Soy Chorizo"; plain produce is fine. Don't list bare pantry staples (olive oil, salt, garlic) as ingredients.
- Meal names read like items on a good cafe menu, with no emojis.
- Junk list items use \`n\` for the product name and \`q\` for the amount to buy.

The app checks the assembled week and sends back anything that fails:
- Each base and each engine may appear in at most ${MAX_BUILD_VALUE_USES_PER_WEEK} meals across the whole week (compared ignoring case and punctuation). Since other meal types are planned separately, vary bases and engines within your meals and favor ones that suit this meal type.
- Hard rules in the request (excluded foods, vegetarian meals) apply to meal names, build items and ingredient names. A plant-based product named after a meat, such as "Soy Chorizo" or "Meatless Meatballs", is fine in a vegetarian meal.
- No meal repeats one from the recent weeks listed in the request, and no two meals in the week share a name.

The household's guides follow. diner-preferences.md is the source of truth for the meals, and companion-preferences.md for the junk list. Where a guide gives a per-week limit, it applies to the whole week across all meal types.

${guideBlocks}`;
}

export function buildTypePrompt(
  type: WeekMealType,
  input: Pick<GenerateWeekInput, "weekRange" | "rules" | "history">
): string {
  const { weekRange, rules, history } = input;
  const recent = history.meals.filter((meal) => meal.type === type);

  return `Plan the ${formatMealCount(type)} for the week of ${input.weekRange}. Each one is a different meal.

Rules:
${rules.week.notes ? `- Whole week: ${rules.week.notes}\n` : ""}- ${MEAL_TYPE_HEADINGS[type]}: ${describeTypeRules(rules, type)}

Recent ${MEAL_TYPE_LABELS[type].many} (don't repeat these):
${recent.length ? recent.map((meal) => `- ${meal.name} (${meal.weekRange})`).join("\n") : "- None on record."}

The week of ${weekRange} is planned in separate requests for the other meal types and the junk list.`;
}

export function buildJunkPrompt(input: Pick<GenerateWeekInput, "weekRange" | "rules" | "history">): string {
  const { weekRange, rules, history } = input;
  const recent = history.junkItems.length
    ? history.junkItems.map((item) => `- ${item}`).join("\n")
    : "- None on record.";

  const hardRules = [
    ...describeSkipGroups(rules),
    ...(rules.week.excludeTerms.length ? [`HARD: no item may contain ${rules.week.excludeTerms.join(", ")}.`] : []),
  ];

  return `Plan the junk list for the week of ${weekRange}, following companion-preferences.md.
${hardRules.length ? `\nRules:\n${hardRules.map((rule) => `- ${rule}`).join("\n")}\n` : ""}${rules.week.notes ? `\nNotes for the whole week: ${rules.week.notes}\n` : ""}
Junk list items from recent weeks (rotate these):
${recent}`;
}

function buildJunkRepairPrompt(errors: string[]): string {
  return `The app checked the junk list and it failed:
${errors.map((error) => `- ${error}`).join("\n")}

Return the full junk list again with these fixed. Keep the items that passed.`;
}

const MEAL_TYPE_HEADINGS: Record<WeekMealType, string> = {
  Breakfast: "Every breakfast",
  Lunch: "Every lunch",
  Dinner: "Every dinner",
};

function buildRepairPrompt(type: WeekMealType, errors: string[], weekData: WeekData): string {
  const otherMeals = weekData.meals.filter((meal) => meal.type !== type);
  const used = (["base", "engine"] as const).flatMap((buildKey) =>
    countBuildValueUses(otherMeals, buildKey).map(
      (usage) => `- ${buildKey} "${usage.value}": ${usage.meals.length}`
    )
  );

  return `The app checked the week and your ${MEAL_TYPE_LABELS[type].many} failed:
${errors.map((error) => `- ${error}`).join("\n")}

Bases and engines the other meal types this week use, with how many meals use each (each may be in at most ${MAX_BUILD_VALUE_USES_PER_WEEK} meals in total):
${used.length ? used.join("\n") : "- None."}

Return all ${formatMealCount(type)} again with these fixed. Keep the meals that passed unless changing one is the only way to fix a problem.`;
}

function describeUnusableTurn(part: GenerationPart, turn: ModelTurn<unknown>): string {
  const what = part === "Junk" ? "the junk list" : `the ${MEAL_TYPE_LABELS[part].many}`;
  if (turn.stopReason === "refusal") {
    return `Claude declined to plan ${what}${turn.refusalCategory ? ` (${turn.refusalCategory})` : ""}. Try different notes.`;
  }
  if (turn.stopReason === "max_tokens") {
    return `Claude ran out of room before finishing ${what}. Try again.`;
  }
  return `Claude's response for ${what} didn't match the meal-plan format. Try again.`;
}

let client: Anthropic | null = null;

/** Default CallModel: one streamed request with structured output. */
export const callClaude: CallModel = async ({ part, system, messages, schema }) => {
  client ??= new Anthropic();

  const stream = client.beta.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: {
      // The junk list is a simple pick from the companion guide.
      effort: part === "Junk" ? "low" : "medium",
      format: betaZodOutputFormat(schema),
    },
    // If a safety classifier declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // The guides are identical on every call, so cache them.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  const message = await stream.finalMessage();

  return {
    output: message.stop_reason === "end_turn" ? message.parsed_output : null,
    content: message.content,
    stopReason: message.stop_reason,
    refusalCategory: message.stop_details?.category ?? null,
  };
};
