import assert from "node:assert/strict";
import { EXPECTED_MEAL_COUNTS, WEEK_MEAL_TYPES, WeekMealType, formatMealCount } from "@/lib/constants";
import { validateWeekData } from "@/lib/domain/mealPlanValidation";
import {
  CallModel,
  GenerationError,
  GenerationPart,
  RecentHistory,
  buildJunkPrompt,
  buildSystemPrompt,
  buildTypePrompt,
  checkGeneratedWeek,
  generateWeek,
} from "@/lib/generation/generate";
import { describeTypeRules, emptyRules, findRuleViolations, normalizeRules } from "@/lib/generation/rules";
import {
  GeneratedJunkList,
  GeneratedMeal,
  GeneratedMeals,
  toJunkList,
  toMealInput,
} from "@/lib/generation/schema";
import type { WeekData } from "@/lib/types";
import { formatWeekRange, parseDateOnly } from "@/lib/weekRange";

// Offline tests for plan generation: no Claude or database calls.

const WEEK_RANGE = "July 27 — August 2";
const NO_HISTORY: RecentHistory = { meals: [], junkItems: [] };

function ingredient(name: string, category: "pro" | "base" | "veg" | "engine", cal: number, fiber: number) {
  return { name, quantity: "1 serving", category, macros: { cal, p: 10.4, c: 12.2, f: 5.1, fiber } };
}

function meal(type: WeekMealType, index: number): GeneratedMeal {
  const pro = `Trader Joe's ${type} Protein ${index}`;
  const base = `Trader Joe's ${type} Grain ${index}`;
  const veg = `${type} Greens ${index}`;
  const engine = `Trader Joe's ${type} Sauce ${index}`;
  return {
    name: `${type} Plate ${index}`,
    build: { pro: [pro], base: [base], veg: [veg], engine: [engine] },
    ingredients: [
      ingredient(pro, "pro", 180, 0),
      ingredient(base, "base", 150.4, 3.3),
      ingredient(veg, "veg", 40, 2.6),
      ingredient(engine, "engine", 60, 0.4),
    ],
  };
}

function fixtureMeals(type: WeekMealType, count: number = EXPECTED_MEAL_COUNTS[type]): GeneratedMeals {
  return { meals: Array.from({ length: count }, (_, index) => meal(type, index + 1)) };
}

function fixtureJunk(): GeneratedJunkList {
  return {
    junkList: {
      "Coffee/Creamer": [{ n: "Trader Joe's Joe Coffee", q: "1 bag" }],
      "Beer/Wine": [{ n: "Trader Joe's Charles Shaw Cabernet", q: "" }],
      Chips: [{ n: "Trader Joe's Elote Chips", q: "1 bag" }],
      Sweets: [{ n: "Trader Joe's Dark Chocolate Peanut Butter Cups", q: "1 box" }],
      "Frozen Food": [{ n: "Trader Joe's Mandarin Orange Chicken", q: "1 bag" }],
      "Frozen Treats": [{ n: "Trader Joe's Mochi Ice Cream", q: "1 box" }],
      "Beverages/Drinks": [{ n: "Trader Joe's Sparkling Water", q: "1 pack" }],
    },
  };
}

function fixtureByType(): Record<WeekMealType, GeneratedMeals> {
  return { Breakfast: fixtureMeals("Breakfast"), Lunch: fixtureMeals("Lunch"), Dinner: fixtureMeals("Dinner") };
}

function assemble(byType: Record<WeekMealType, GeneratedMeals>, junk: GeneratedJunkList = fixtureJunk()): WeekData {
  return {
    weekRange: WEEK_RANGE,
    meals: WEEK_MEAL_TYPES.flatMap((type) => byType[type].meals.map((m) => toMealInput(m, type))),
    junkList: toJunkList(junk),
  };
}

function junkWith(category: keyof GeneratedJunkList["junkList"], n: string): GeneratedJunkList {
  const junk = fixtureJunk();
  junk.junkList[category] = [...junk.junkList[category], { n, q: "1 bag" }];
  return junk;
}

// --- helpers ---
assert.equal(formatWeekRange("2026-07-27"), "July 27 — August 2");
assert.equal(formatWeekRange("2026-12-28"), "December 28 — January 3");
assert.equal(parseDateOnly("2026-02-30"), null);
assert.equal(parseDateOnly("07/27/2026"), null);
assert.equal(formatMealCount("Lunch", 3), "3 lunches");
assert.equal(formatMealCount("Dinner", 1), "1 dinner");

// --- rules ---
{
  const rules = normalizeRules({ week: { excludeTerms: [" shrimp ", 4, ""] }, types: { Dinner: { vegetarian: true, notes: " not spicy " } } });
  assert.deepEqual(rules.week.excludeTerms, ["shrimp"]);
  assert.equal(rules.types.Dinner.vegetarian, true);
  assert.equal(rules.types.Dinner.notes, "not spicy");
  assert.deepEqual(rules.types.Breakfast, { excludeTerms: [], vegetarian: false, notes: "" });
  assert.deepEqual(normalizeRules("garbage"), emptyRules());

  const vegetarian = normalizeRules({ types: { Dinner: { vegetarian: true } } });
  const chicken = { name: "Lemon Herb Chicken", ingredients: [{ name: "Trader Joe's Chicken Breast" }] };
  const soyChorizo = { name: "Soy Chorizo Tacos", ingredients: [{ name: "Trader Joe's Soy Chorizo" }] };
  assert.ok(findRuleViolations(chicken, vegetarian, "Dinner").length > 0, "chicken breaks vegetarian dinners");
  assert.deepEqual(findRuleViolations(soyChorizo, vegetarian, "Dinner"), [], "soy chorizo is plant-based");
  assert.deepEqual(findRuleViolations(chicken, vegetarian, "Lunch"), [], "rule only applies to its type");
  assert.equal(
    findRuleViolations({ name: "Garlic Shrimps Bowl" }, normalizeRules({ week: { excludeTerms: ["shrimp"] } }), "Lunch")[0]?.term,
    "shrimp",
    "plurals match"
  );
}

// --- skip groups ---
{
  assert.deepEqual(normalizeRules({ week: { skipGroups: ["shellfish", "nope", 3] } }).week.skipGroups, ["shellfish"]);
  assert.deepEqual(emptyRules().week.skipGroups, []);

  const noShellfish = normalizeRules({ week: { skipGroups: ["shellfish"] } });
  const flagged = (name: string, ingredient = "Broccoli Florets", type: WeekMealType = "Dinner") =>
    findRuleViolations({ name, ingredients: [{ name: ingredient }] }, noShellfish, type).map((v) => v.term);
  assert.deepEqual(flagged("Ginger Chicken", "Trader Joe's Oyster Sauce"), ["oyster"], "oyster sauce counts");
  assert.deepEqual(flagged("Garlic Prawns", "Broccoli Florets", "Breakfast"), ["prawn"], "applies to every meal type");
  assert.deepEqual(flagged("New England Clam Chowder"), ["clam"]);
  assert.deepEqual(flagged("Seafood Paella"), ["seafood"]);
  assert.deepEqual(flagged("King Oyster Mushroom Stir Fry", "Oyster Mushrooms"), [], "oyster mushrooms are fine");
  assert.deepEqual(findRuleViolations({ name: "Shrimp Fried Rice" }, emptyRules(), "Dinner"), [], "off by default");

  const noPeppers = normalizeRules({ week: { skipGroups: ["bellPeppers"] } });
  const peppers = (ingredient: string) =>
    findRuleViolations({ name: "Chicken Bowl", ingredients: [{ name: ingredient }] }, noPeppers, "Lunch").map((v) => v.term);
  assert.deepEqual(peppers("Trader Joe's Fire Roasted Red Peppers"), ["roasted red pepper"]);
  assert.deepEqual(peppers("Red Bell Pepper"), ["bell pepper"]);
  assert.deepEqual(peppers("Mini Sweet Peppers"), ["sweet pepper"]);
  assert.deepEqual(peppers("Crushed Red Pepper Flakes"), [], "chili flakes are fine");

  const both = normalizeRules({ week: { skipGroups: ["shellfish", "bellPeppers"] } });
  const described = describeTypeRules(both, "Breakfast");
  assert.ok(described.startsWith("HARD: no shellfish of any kind anywhere, including sauces and snacks (watch for: shellfish, seafood, shrimp"));
  assert.ok(described.includes("oyster mushroom, king oyster mushroom, crab apple are fine."));
  assert.ok(described.includes("HARD: no bell peppers anywhere"));
  assert.ok(buildJunkPrompt({ weekRange: WEEK_RANGE, rules: both, history: NO_HISTORY }).includes("Rules:\n- HARD: no shellfish of any kind anywhere"));

  const check = checkGeneratedWeek(assemble(fixtureByType(), junkWith("Chips", "Trader Joe's Shrimp Chips")), noShellfish, NO_HISTORY);
  assert.deepEqual(check.byPart.Junk, ['Junk list item "Trader Joe\'s Shrimp Chips" breaks a hard rule: it contains "shrimp".']);
  assert.equal(check.valid, false);
}

// --- conversion ---
{
  const converted = toMealInput(meal("Breakfast", 1), "Breakfast");
  assert.equal(converted.type, "Breakfast");
  assert.deepEqual(converted.macros, { cal: 430, p: 42, c: 49, f: 20, fiber: 6 }, "meal macros are rounded ingredient sums");

  const junk = toJunkList(fixtureJunk());
  assert.deepEqual(junk.map((c) => c.category), ["Coffee/Creamer", "Beer/Wine", "Chips", "Sweets", "Frozen Food", "Frozen Treats", "Beverages/Drinks"]);
  assert.deepEqual(junk[1].items, [{ n: "Trader Joe's Charles Shaw Cabernet" }], "empty quantities are dropped");
}

// --- checks ---
{
  const week = assemble(fixtureByType());
  assert.deepEqual(week.meals.map((m) => m.type).filter((t, i, all) => all.indexOf(t) === i), ["Breakfast", "Lunch", "Dinner"]);
  assert.equal(week.meals.length, 15);
  const check = checkGeneratedWeek(week, emptyRules(), NO_HISTORY);
  assert.deepEqual(check.errors, [], `fixture week should pass:\n${check.errors.join("\n")}`);
  assert.equal(check.valid, true);
}

{
  // A base or engine may be in two meals.
  const byType = fixtureByType();
  byType.Dinner.meals[1].build.base = [...byType.Dinner.meals[0].build.base];
  byType.Lunch.meals[0].build.engine = [...byType.Breakfast.meals[0].build.engine];
  assert.equal(checkGeneratedWeek(assemble(byType), emptyRules(), NO_HISTORY).valid, true);
}

{
  // Third use: the type that uses it most keeps it; the others are asked to change.
  const byType = fixtureByType();
  const shared = byType.Dinner.meals[0].build.engine;
  byType.Dinner.meals[1].build.engine = [...shared];
  byType.Lunch.meals[0].build.engine = [...shared];
  const check = checkGeneratedWeek(assemble(byType), emptyRules(), NO_HISTORY);
  assert.equal(check.valid, false);
  assert.equal(check.byPart.Dinner, undefined, "dinners keep the engine");
  assert.match(check.byPart.Lunch?.[0] ?? "", /is in 3 meals this week \(max 2\).*replace it in "Lunch Plate 1"/);

  const validation = validateWeekData(assemble(byType), { allowShoppingFallbacks: true });
  assert.ok(validation.errors.some((e) => e.includes("is in 3 meals (max 2 per week)")), "validator enforces the same cap");
}

{
  const byType = fixtureByType();
  for (const m of byType.Breakfast.meals.slice(0, 3)) m.build.engine = ["Trader Joe's Everything but the Bagel Seasoning"];
  byType.Lunch = fixtureMeals("Lunch", 2);
  byType.Dinner.meals[0].ingredients[0].name = "Trader Joe's Chicken Breast";
  byType.Dinner.meals[1].name = "Lunch Plate 1";
  byType.Breakfast.meals[4].build.veg = [];
  const rules = normalizeRules({ types: { Dinner: { vegetarian: true } } });
  const history: RecentHistory = { meals: [{ name: "breakfast plate 2!", type: "Breakfast", weekRange: "July 20 — July 26" }], junkItems: [] };
  const { byPart: errors } = checkGeneratedWeek(assemble(byType), rules, history);

  assert.ok(errors.Breakfast?.some((e) => e.includes("is in 3 of these meals")), "within-type overuse");
  assert.ok(errors.Breakfast?.some((e) => e.includes("has no veg")), "empty pillar");
  assert.ok(errors.Breakfast?.some((e) => e.includes("already on the menu for July 20")), "recent repeat");
  assert.ok(errors.Lunch?.includes("Expected 3 lunches, got 2."), "count");
  assert.ok(errors.Dinner?.some((e) => e.startsWith('"Dinner Plate 1" breaks a hard rule')), "vegetarian rule");
  assert.ok(errors.Dinner?.some((e) => e === '"Lunch Plate 1" appears twice this week.'), "duplicate name");
}

// --- prompts ---
{
  const input = {
    weekRange: WEEK_RANGE,
    rules: normalizeRules({ week: { notes: "Busy week" }, types: { Dinner: { vegetarian: true, excludeTerms: ["tuna"] } } }),
    history: {
      meals: [
        { name: "Old Dinner", type: "Dinner" as const, weekRange: "July 20 — July 26" },
        { name: "Old Breakfast", type: "Breakfast" as const, weekRange: "July 20 — July 26" },
      ],
      junkItems: ["Elote Chips"],
    },
  };
  const dinner = buildTypePrompt("Dinner", input);
  assert.ok(dinner.startsWith(`Plan the 7 dinners for the week of ${WEEK_RANGE}.`));
  assert.ok(dinner.includes("- Whole week: Busy week"));
  assert.ok(dinner.includes("- Every dinner: HARD: no meal may contain tuna. HARD: every meal is vegetarian"));
  assert.ok(dinner.includes("Recent dinners (don't repeat these):\n- Old Dinner (July 20 — July 26)"));
  assert.ok(!dinner.includes("Old Breakfast"), "only this type's history");
  assert.ok(buildJunkPrompt(input).includes("- Elote Chips"));
  const system = buildSystemPrompt([{ file: "diner-preferences.md", content: "Hard no: pineapple." }]);
  assert.ok(system.includes("A week is 5 breakfasts, 3 lunches, 7 dinners"));
  assert.ok(system.includes("at most 2 meals across the whole week"));
  assert.ok(system.includes("for that ingredient in **one adult serving**"), "macros are per adult serving");
  assert.ok(system.includes('<guide file="diner-preferences.md">\nHard no: pineapple.\n</guide>'));
}

// --- generation loop ---
type Call = { part: GenerationPart; messages: Parameters<CallModel>[0]["messages"] };

function fakeModel(responses: Record<GenerationPart, unknown[]>, calls: Call[]): CallModel {
  return async (request) => {
    calls.push({ part: request.part, messages: [...request.messages] });
    const list = responses[request.part];
    const n = calls.filter((call) => call.part === request.part).length;
    const output = list[Math.min(n - 1, list.length - 1)];
    return {
      output: output as never,
      content: [{ type: "text", text: JSON.stringify(output), citations: null }],
      stopReason: "end_turn",
    };
  };
}

async function testGenerationLoop() {
  const input = { weekRange: WEEK_RANGE, rules: emptyRules(), guides: [], history: NO_HISTORY };
  const clashingLunches = fixtureMeals("Lunch");
  clashingLunches.meals[0].build.engine = ["Trader Joe's Dinner Sauce 1"];
  const fixed = fixtureByType();
  fixed.Dinner.meals[1].build.engine = ["Trader Joe's Dinner Sauce 1"];

  const calls: Call[] = [];
  const responses = {
    Breakfast: [fixed.Breakfast],
    Lunch: [clashingLunches, fixtureMeals("Lunch")],
    Dinner: [fixed.Dinner],
    Junk: [fixtureJunk()],
  };
  const result = await generateWeek({ ...input, maxAttempts: 3 }, fakeModel(responses, calls));
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.attempts, 2);
  assert.equal(result.weekData.meals.length, 15);
  assert.deepEqual(calls.map((call) => call.part), ["Breakfast", "Lunch", "Dinner", "Junk", "Lunch"], "only the lunches are re-asked");
  const repair = calls[4].messages;
  assert.equal(repair.length, 3, "repair round appends the assistant turn and the failures");
  assert.equal(repair[1].role, "assistant");
  assert.match(String(repair[2].content), /replace it in "Lunch Plate 1"/);
  assert.match(String(repair[2].content), /engine "Trader Joe's Dinner Sauce 1": 2/, "lists what other types use");

  calls.length = 0;
  const gaveUp = await generateWeek(
    { ...input, maxAttempts: 2 },
    fakeModel({ ...responses, Lunch: [fixtureMeals("Lunch", 2)] }, calls)
  );
  assert.equal(gaveUp.valid, false);
  assert.equal(gaveUp.attempts, 2);
  assert.deepEqual(gaveUp.errors, ["Expected 3 lunches, got 2."]);

  calls.length = 0;
  const outOfTime = await generateWeek(
    { ...input, maxAttempts: 3, deadlineMs: -1 },
    fakeModel({ ...responses, Lunch: [clashingLunches] }, calls)
  );
  assert.equal(outOfTime.attempts, 1, "no repair round after the deadline");

  calls.length = 0;
  const shrimpChips = junkWith("Chips", "Trader Joe's Shrimp Chips");
  const junkFixed = await generateWeek(
    { ...input, rules: normalizeRules({ week: { skipGroups: ["shellfish"] } }) },
    fakeModel({ ...responses, Lunch: [fixtureMeals("Lunch")], Junk: [shrimpChips, fixtureJunk()] }, calls)
  );
  assert.equal(junkFixed.valid, true, junkFixed.errors.join("\n"));
  assert.deepEqual(calls.map((call) => call.part), ["Breakfast", "Lunch", "Dinner", "Junk", "Junk"], "only the junk list is re-asked");
  assert.match(String(calls[4].messages[2].content), /^The app checked the junk list and it failed:\n- Junk list item "Trader Joe's Shrimp Chips"/);

  const refusal: CallModel = async (request) => ({
    output: request.part === "Junk" ? null : (fixtureMeals(request.part as WeekMealType) as never),
    content: [],
    stopReason: request.part === "Junk" ? "refusal" : "end_turn",
    refusalCategory: "general_harms",
  });
  await assert.rejects(generateWeek(input, refusal), (error: unknown) =>
    error instanceof GenerationError && error.message === "Claude declined to plan the junk list (general_harms). Try different notes."
  );
}

testGenerationLoop()
  .then(() => console.log("Generation tests passed."))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
