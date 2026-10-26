# Harvest Meal Engine: Weekly Plan Workflow

Step-by-step procedure for generating and publishing a new weekly meal plan locally.

**Related docs:** `data/diner-preferences.md` · `data/companion-preferences.md` · `data/data_context.md`

---

## Week shape

A week is a flat `meals` array of breakfasts, lunches and dinners (no days / timeslots). The count of each is `EXPECTED_MEAL_COUNTS` in `lib/constants.ts`, and `npm run meal-plan:sync` rejects weeks that don't match.

Read `data/diner-preferences.md` before editing. All meals target **450–550 kcal** loosely. Fiber is first-class. Full validation checklist (shellfish allergy, spice, cuisine rotation, etc.) lives in that file.

---

## Pre-flight: backup

Before overwriting the active week:

```bash
cp data/current-week.md data/backup-week-$(date +%Y-%m-%d-%H%M%S).md
```

(`data/backup-week-*.md` is gitignored.)

---

## Step 1: Review recent meals

```bash
curl -s http://localhost:3000/api/meals | jq .
```

Avoid repeating meals served in the last week when practical.

---

## Step 2: Author the plan

1. Read `data/diner-preferences.md` and `data/companion-preferences.md`
2. Use `data/data_context.md` for TJ product guidance
3. Create or edit a plan under `data/mealplans/` or edit `data/current-week.md` directly
4. Keep the fenced JSON block valid
5. Build the companion junk list with all seven required categories

---

## Step 3: Validate, sync, publish

```bash
npm run meal-plan:sync
npm run meal-plan:publish
```

Or via the CLI helper:

```bash
npm run meal-plan -- validate data/current-week.md
npm run meal-plan -- publish data/mealplans/mealplan-week-YYYY-MM-DD.md
```

Confirm in the app at http://localhost:3000/menu.

---

## Checklist

- [ ] Read diner + companion preference docs
- [ ] Meal counts match `EXPECTED_MEAL_COUNTS`
- [ ] Macros / fiber present; ~450–550 kcal per meal
- [ ] Dad's serving never contains shellfish; bell peppers separable; shared meals mild
- [ ] Junk list has all seven categories filled
- [ ] Sync + publish succeeded
- [ ] UI shows the new week
