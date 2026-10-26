# Household — Harvest Meal Preferences

> Referenced by: `data/data_context.md`, `data/MEAL_PLAN_PRODUCTION_WORKFLOW.md`

The source of truth for what this family eats. Where `data/data_context.md` (product reference) disagrees with this file, this file wins. The junk list is managed separately in `data/companion-preferences.md`.

Health notes below are household guidance, not medical advice; Dad's doctor has the final say.

---

## Who's Eating

A family of 4. **Plan every meal for 4 servings** unless the meal is marked for one person.

| Who | Needs | Likes |
|---|---|---|
| **Dad**, 84 | **Allergic to shellfish.** Diabetes and gout (see Health Guidance) | Indian and Asian flavors |
| **Daughter**, 11 | Not spicy. Doesn't like bell peppers. Not a fan of crumbled feta | Oysters, shrimp, clam chowder, turkey burgers, spaghetti, steak, Asian flavors |
| **The couple** | Want **slightly lower carb** for themselves | Flavorful food with real spice |

---

## Week Shape

The number of breakfasts, lunches and dinners per week is set in the app (`EXPECTED_MEAL_COUNTS` in `lib/constants.ts`) and stated in each planning request.
No day scheduling. No daily calorie targets. Meals are a flat list.

---

## Shellfish (Dad's allergy)

Shellfish means shrimp, prawns, crab, lobster, crawfish, langoustine, clams, oysters, mussels, scallops, squid and octopus, plus anything made from them (clam chowder, seafood blends, imitation crab, shrimp-based sauces).

Shellfish is welcome (the daughter loves it) as long as **Dad's serving never contains it**:

- **In a shared meal, shellfish is an add-on.** List it as its own ingredient, cooked separately and added to individual plates, for example "shrimp, sautéed separately, for 3 of the 4 bowls". Never put it in a shared sauce, broth, base or batter.
- **A meal built around shellfish** (clam chowder, oysters, a shrimp bowl) needs a separate protein for Dad, listed as its own ingredient, or its name ends with **"(not for Dad)"** when it's a breakfast or lunch he'll skip.
- Keep shellfish prep separate (its own pan, utensils and board) to avoid cross-contact.
- **Junk list:** shellfish snacks only when labeled "(not for Dad)".

---

## Health Guidance (Dad)

**Diabetes**
- Keep added sugar low. Sweet sauces and glazes (Soyaki, sweet chili, mango chutney, teriyaki) at most twice a week, and never as the only flavor.
- Pair every carb with protein and fiber; favor whole grains, legumes and vegetables over refined starch.

**Gout**
- Go easy on high-purine foods: organ meats, anchovies, sardines, mussels and scallops shouldn't appear.
- Red meat (steak, tri-tip, ground beef, lamb) in **at most 2 dinners a week**.
- Poultry, eggs, dairy, tofu, legumes and most fish are good everyday proteins.

---

## Spice: Mild in the Pot, Heat at the Table

The daughter eats everything not spicy; the couple wants heat.

- **Cook every shared meal mild.** No spicy sauces, chili or hot sausage in the base dish.
- In **at least 3 dinners a week**, add a heat-at-the-table component as its own ingredient, such as Trader Joe's Chili Onion Crunch, Trader Joe's Green Dragon Hot Sauce, Trader Joe's Zhoug Sauce, or crushed red pepper. Name it in `ingredients` with the category `engine`.

---

## Lower Carb for the Couple

- On shared meals, **keep the base separable**: rice, pasta, bread or naan served on the side so the couple can halve or skip it while Dad and the daughter have a full portion.
- In about half the dinners, include a lower-carb swap in `ingredients` (cauliflower rice, lettuce cups, extra roasted vegetables, a side salad).
- Dad's carbs still follow the diabetes guidance above.

---

## Family Favorites

Proven hits. **Bring back 1–2 of these (or close variations) each week.** The app rejects a meal that was on the menu in the last 3 weeks, so rotate them.

- Gymkhana Goan sauce with fried tofu
- Flatbread pizza on a garlic base (one pesto, one Gymkhana butter sauce)
- Lasagna soup
- 5-cheese tortellini soup
- Viral Trader Joe's dumpling bake
- Trader Joe's Santa Maria tri-tip roast

**Safe bets**
- **Trader Joe's packaged Indian dishes are always a hit**; plan at least one Indian night a week built around them.
- **Soup nights:** 1–2 dinners a week can be soup with garlic bread (chicken tortilla soup, tomato basil soup, lasagna soup, 5-cheese tortellini soup, or a new one).
- Daughter's favorites for shared dinners: turkey burgers, spaghetti, steak, Asian-style noodles and rice dishes.

---

## Cheese, Salads and New Things

- **Bell peppers:** fine for the rest of the family, but keep them **separable** for the daughter: on the side, roasted on their own tray, or cut large enough to pick out. Never blended into a sauce or finely diced into a shared base.
- **Feta and goat cheese:** the family likes crumbled feta and goat cheese crumbles. Serve them **on the side** (listed as their own ingredient) so the daughter can skip them.
- **Salads:** the family is getting tired of salad kits. Prefer **homemade salads** (chopped, grain, slaw, or composed salads built from separate ingredients); at most 1 salad kit a week.
- **Cottage cheese:** willing to try it. Use it in **1 meal a week** in an approachable way (a breakfast bowl, whipped into eggs, or blended into a pasta sauce).

---

## Calorie Targets

Macros are for **one adult serving** with the full base. Aim for roughly **450–550 kcal**, loosely; flavor and satiety matter more than exact numbers.

---

## Cooking Parameters

- **Weeknight time ceiling: 20–30 minutes**, using up to two pans (breakfasts and dinners).
- **Up to 2 dinners a week can run longer**, such as a roast (the tri-tip) or a simmered soup.
- Techniques in scope: sear, sauté, boil, roast, simmer, assemble.
- **Lunch is the exception:** assemble only — no cooking (see Lunch Style).
- Frozen grains and vegetables are freely usable. Fully frozen or packaged entrées, including the Trader Joe's Indian dishes: **at most 4 per week, and at most 3 of them dinners.**

---

## Protein Roster

Rotate across these proteins. Aim for **≥3 different protein types per week.**

| Protein | Notes |
|---|---|
| Chicken thighs or breast | Everyday staple; thighs when either works |
| Ground turkey | Turkey burgers are a daughter favorite |
| Beef (steak, tri-tip, ground) | Counts toward the 2 red-meat dinners a week |
| Fish (salmon, white fish) | Rotate types |
| Eggs | Breakfast and lunch staple |
| Tofu / paneer | Fried tofu is a family hit; paneer suits Indian nights |
| Legumes | Lentils, chickpeas, black beans — first-class protein, not a side |
| Shellfish | As a separately cooked add-on, or with a separate protein for Dad, per the Shellfish section |

**Hard no:** Pineapple (in any meal, any context).

---

## Vegetarian Meals

Vegetarian meals are welcome when they fit the week. When included, make them satisfying and protein-complete. Legumes, tofu, paneer, eggs, and cottage cheese all qualify.

---

## Cuisine Profile

Flavorful, globally inspired, family-friendly. Indian and Asian flavors are favorites. Use at least 5 of these each week. Any one cuisine goes in at most 3 meals, and in at most 2 of the dinners.

- Indian
- Chinese / Taiwanese
- Thai / Southeast Asian
- Japanese / Korean
- Italian / Italian-American (pasta, soups, flatbread pizza)
- Mexican / Tex-Mex
- Mediterranean / Middle Eastern
- American comfort (burgers, roasts, chowders)

**Flavor targets:** umami and fresh herbs in the pot; heat at the table (see Spice). Avoid bland proteins and boring builds.

---

## Breakfast Style

Mix styles each week: **at least 2 savory breakfasts, at most 2 sweet, and at most 2 oat-heavy.**

- **Savory:** eggs, grain bowls, protein-forward builds
- **Sweet but substantial:** oats done interestingly, yogurt or cottage cheese builds with real protein and fiber

---

## Lunch Style

Lunch should be **assemble only — no cooking.**

- No stovetop, oven, sautéing, boiling, roasting, or microwaving for the lunch build.
- OK: open, drain, rinse, chop, and combine ready-to-eat components.
- Homemade salads fit here; still hit the calorie range with adequate protein and fiber.

---

## Fiber

Fiber is a **first-class nutrient** — shown on every meal card. Preferred sources: legumes, whole grains, vegetables, seeds.

---

## Macros

```
cal: 450–550 per adult serving
protein: aim high
fiber: shown on every card; higher is better
carbs: keep the base separable so the couple can go lower carb
```

---

## Meal Structure (Four Pillars)

| Pillar | Description |
|---|---|
| `pro` | Protein + prep note |
| `base` | Grain, starch, or bread |
| `veg` | Vegetables |
| `engine` | TJ's flavor anchor — always the **full Trader Joe's brand name** |

**Each engine and each base appears in at most 2 meals per week.**

---

## Trader Joe's Engines

Vary engines every meal. Check [traderjoes.com](https://www.traderjoes.com) and the [Fearless Flyer](https://www.traderjoes.com/home/ff) for new options. Keep the engine in the pot mild; put the heat in a separate at-the-table component.

---

## Week Validation Rules

- [ ] Breakfast, lunch and dinner counts match the planning request
- [ ] Dad's serving never contains shellfish: shellfish is a separate add-on, comes with a separate protein for Dad, or the meal ends with "(not for Dad)"
- [ ] Bell peppers separable (on the side or easy to pick out)
- [ ] Shared meals cooked mild; ≥3 dinners with heat at the table
- [ ] Red meat in ≤2 dinners; no organ meats, anchovies, sardines, mussels or scallops
- [ ] Sweet sauces and glazes in ≤2 meals
- [ ] Base served on the side in shared meals; lower-carb swap in about half the dinners
- [ ] At least one Indian night; 1–2 soup nights; 1–2 family favorites
- [ ] ≥3 different protein types across the week
- [ ] Each TJ's engine in at most 2 meals
- [ ] Each base in at most 2 meals
- [ ] Adult servings roughly 450–550 kcal
- [ ] Fiber shown on every meal card
- [ ] ≤4 fully frozen or packaged entrées, ≤3 of them dinners
- [ ] ≤2 dinners over 30 minutes
- [ ] Feta and goat cheese on the side; ≤1 salad kit; cottage cheese in 1 meal
- [ ] Breakfasts: ≥2 savory, ≤2 sweet, ≤2 oat-heavy
- [ ] Lunch is assemble-only
- [ ] At least 5 cuisine profiles; none in more than 3 meals or more than 2 dinners
- [ ] No pineapple

---

## Avoid

- Spicy base dishes (heat goes at the table)
- Shellfish or bell peppers mixed into a shared sauce, broth or base
- Pineapple
- Too many salad kits
- Bland proteins and repetitive weeks (same base, cuisine, or engines)
- Product-catalogue meals that feel like a TJ's ad
- Cherries, sugar snap peas, snow peas, frozen shredded hash browns
