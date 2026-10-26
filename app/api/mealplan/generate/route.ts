import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { ApiError, createRouteHandler } from "@/lib/apiUtils";
import { loadPlanningGuides, loadRecentHistory } from "@/lib/generation/context";
import { GENERATION_MODEL, GenerationError, generateWeek } from "@/lib/generation/generate";
import { normalizeRules } from "@/lib/generation/rules";
import { requireBoolean } from "@/lib/routeValidation";
import { getMealPlanByWeekRange, upsertMealPlan } from "@/lib/services/mealPlanService";
import { formatWeekRange, getWeekStartDateOnly, parseDateOnly } from "@/lib/weekRange";

// A round is parallel Claude calls (one per meal type plus the junk list), so it takes as
// long as the slowest one, usually the dinners. A repair round only starts if there's
// time left for it before maxDuration.
export const maxDuration = 300;
const REPAIR_DEADLINE_MS = 150_000;

/**
 * Generates a week with Claude and saves it.
 * Body: { rules?, weekStart?: "YYYY-MM-DD" (defaults to next week), replace?: boolean }
 */
export const POST = createRouteHandler(async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const weekStartDateOnly = resolveWeekStart(body.weekStart);
  const weekRange = formatWeekRange(weekStartDateOnly);
  const replace = body.replace === undefined ? false : requireBoolean(body.replace, "replace");
  const rules = normalizeRules(body.rules);

  if (!replace && (await getMealPlanByWeekRange(weekRange))) {
    throw new ApiError(`The week of ${weekRange} already has a menu.`, 409);
  }

  const [guides, history] = await Promise.all([
    loadPlanningGuides(),
    loadRecentHistory(weekStartDateOnly),
  ]);

  let result;
  try {
    result = await generateWeek({ weekRange, rules, guides, history, deadlineMs: REPAIR_DEADLINE_MS });
  } catch (error) {
    throw toApiError(error);
  }

  if (!result.valid) {
    throw new ApiError(
      `Claude couldn't produce a week that passes the checks after ${result.attempts} tries: ${result.errors.join(" ")}`,
      422
    );
  }

  const mealPlan = await upsertMealPlan(result.weekData, {
    source: "generated",
    generationContext: {
      generatedAt: new Date().toISOString(),
      model: GENERATION_MODEL,
      attempts: result.attempts,
      rules,
      warnings: result.warnings,
    },
  });

  return { mealPlan, warnings: result.warnings, attempts: result.attempts };
});

function resolveWeekStart(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return getWeekStartDateOnly(nextWeek);
  }

  const date = typeof value === "string" ? parseDateOnly(value) : null;
  if (!date) {
    throw new ApiError("weekStart must be a date in YYYY-MM-DD format.", 400);
  }
  return getWeekStartDateOnly(date);
}

function toApiError(error: unknown): unknown {
  if (error instanceof GenerationError) {
    return new ApiError(error.message, 502);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ApiError("Claude rejected the API key. Check ANTHROPIC_API_KEY.", 502);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ApiError("Claude is rate limiting requests right now. Try again in a minute.", 503);
  }
  if (error instanceof Anthropic.APIError) {
    return new ApiError(`Claude request failed (${error.status ?? "network error"}): ${error.message}`, 502);
  }
  if (error instanceof Anthropic.AnthropicError) {
    // Thrown before any request, e.g. when no API key is configured.
    console.error("Claude client error", error);
    return new ApiError("Plan generation isn't set up. Add ANTHROPIC_API_KEY to the server's environment.", 503);
  }
  return error;
}
