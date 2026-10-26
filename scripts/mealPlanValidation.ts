import fs from "fs";
import { validateWeekData } from "@/lib/domain/mealPlanValidation";
import { extractWeekDataFromMarkdown } from "@/lib/mealPlanMarkdown";
import { ListCategory, WeekData } from "@/lib/types";

export interface MealPlanValidationOptions {
  printShoppingOrder?: boolean;
  allowShoppingFallbacks?: boolean;
  macroTolerance?: number;
}

export interface MealPlanValidationResult {
  valid: boolean;
  filepath: string;
  weekData?: WeekData;
  shoppingList?: ListCategory[];
  errors: string[];
  warnings: string[];
}

export function validateMealPlanFile(
  filepath: string,
  options: MealPlanValidationOptions = {}
): MealPlanValidationResult {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    const rawWeekData = parseRawWeekData(content);
    const weekData = extractWeekDataFromMarkdown(content);

    const result = validateWeekData(weekData, {
      rawWeekData,
      allowShoppingFallbacks: options.allowShoppingFallbacks,
      macroTolerance: options.macroTolerance,
    });

    if (options.printShoppingOrder) {
      printShoppingOrder(result.shoppingList);
    }

    return {
      valid: result.valid,
      filepath,
      weekData,
      shoppingList: result.shoppingList,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      filepath,
      errors: [`Invalid meal plan structure: ${message}`],
      warnings: [],
    };
  }
}

export function printMealPlanValidationResult(result: MealPlanValidationResult) {
  for (const warning of result.warnings) {
    console.log(`⚠️  ${warning}`);
  }

  for (const error of result.errors) {
    console.log(`❌ ${error}`);
  }

  if (result.valid) {
    console.log("✅ Meal plan validation passed.");
  }
}

function parseRawWeekData(markdown: string): WeekData {
  const match = markdown.match(/```json\s*([\s\S]*?)```/i);

  if (!match) {
    throw new Error("Unable to find a ```json``` block.");
  }

  return JSON.parse(match[1]) as WeekData;
}

function printShoppingOrder(shoppingList: ListCategory[]) {
  console.log("🛒 Derived Trader Joe's shopping order:");
  for (const category of shoppingList) {
    console.log(`  ${category.category}: ${category.items.map((item) => item.n).join(", ")}`);
  }
}
