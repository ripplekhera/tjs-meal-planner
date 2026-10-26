import { readFile } from "fs/promises";
import path from "path";
import type { PlanningGuide, RecentHistory } from "@/lib/generation/generate";
import { getMealPlanByWeekRange, listMealPlanWeeks } from "@/lib/services/mealPlanService";
import { toSortValueFromDateOnly } from "@/lib/weekRange";

// Sent to Claude with every generation. Order matters only for readability.
export const PLANNING_GUIDE_FILES = [
  "diner-preferences.md",
  "companion-preferences.md",
  "data_context.md",
  "shopping-areas.md",
] as const;

export async function loadPlanningGuides(): Promise<PlanningGuide[]> {
  return Promise.all(
    PLANNING_GUIDE_FILES.map(async (file) => ({
      file,
      content: await readFile(path.join(process.cwd(), "data", file), "utf8"),
    }))
  );
}

/**
 * Meals and junk items from the target week (when it already exists) and the weeks
 * before it, so a new week doesn't repeat them.
 */
export async function loadRecentHistory(
  weekStartDateOnly: string,
  weekCount = 3
): Promise<RecentHistory> {
  const targetSortValue = toSortValueFromDateOnly(weekStartDateOnly);
  const weeks = (await listMealPlanWeeks())
    .filter((week) => week.sortValue <= targetSortValue)
    .slice(-weekCount);

  const plans = await Promise.all(weeks.map((week) => getMealPlanByWeekRange(week.weekRange)));

  const meals: RecentHistory["meals"] = [];
  const junkItems = new Set<string>();
  for (const plan of plans) {
    if (!plan) continue;
    for (const meal of plan.meals) {
      meals.push({ name: meal.name, type: meal.type, weekRange: plan.weekRange });
    }
    for (const category of plan.junkList) {
      for (const item of category.items) junkItems.add(item.n);
    }
  }

  return { meals, junkItems: [...junkItems] };
}
