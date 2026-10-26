"use client";

import { ChefHat, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { WEEK_MEAL_TYPES, WeekMealType, formatMealCount } from "@/lib/constants";
import { GenerationRules, SKIP_GROUPS, SKIP_GROUP_IDS, SkipGroupId } from "@/lib/generation/rules";
import { useMealPlan } from "@/lib/MealPlanProvider";
import { cardClass, inputClass, sectionLabelColorClass } from "@/lib/uiClasses";
import { formatWeekRange, getWeekStartDateOnly } from "@/lib/weekRange";

const RULES_STORAGE_KEY = "harvest.generate-rules.v2";
const WEEK_SHAPE = WEEK_MEAL_TYPES.map((type) => formatMealCount(type)).join(", ");

type TypeForm = { avoid: string; vegetarian: boolean; notes: string };
type RulesForm = { skip: SkipGroupId[]; avoid: string; notes: string; types: Record<WeekMealType, TypeForm> };

function emptyForm(): RulesForm {
  const types = {} as Record<WeekMealType, TypeForm>;
  for (const type of WEEK_MEAL_TYPES) types[type] = { avoid: "", vegetarian: false, notes: "" };
  return { skip: [], avoid: "", notes: "", types };
}

// Rules are remembered per browser so recurring ones ("2 vegetarian dinners") stick.
function loadForm(): RulesForm {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RULES_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return emptyForm();
    const form = emptyForm();
    form.avoid = typeof saved.avoid === "string" ? saved.avoid : "";
    form.notes = typeof saved.notes === "string" ? saved.notes : "";
    form.skip = SKIP_GROUP_IDS.filter((id) => Array.isArray(saved.skip) && saved.skip.includes(id));
    for (const type of WEEK_MEAL_TYPES) {
      const s = saved.types?.[type];
      form.types[type] = {
        avoid: typeof s?.avoid === "string" ? s.avoid : "",
        vegetarian: s?.vegetarian === true,
        notes: typeof s?.notes === "string" ? s.notes : "",
      };
    }
    return form;
  } catch {
    return emptyForm();
  }
}

function saveForm(form: RulesForm) {
  try {
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(form));
  } catch {
    // Storage unavailable (private window); rules just won't be remembered.
  }
}

function toTerms(value: string): string[] {
  return value.split(",").map((term) => term.trim()).filter(Boolean);
}

function toRules(form: RulesForm): GenerationRules {
  const types = {} as GenerationRules["types"];
  for (const type of WEEK_MEAL_TYPES) {
    const t = form.types[type];
    types[type] = { excludeTerms: toTerms(t.avoid), vegetarian: t.vegetarian, notes: t.notes.trim() };
  }
  return { week: { excludeTerms: toTerms(form.avoid), skipGroups: form.skip, notes: form.notes.trim() }, types };
}

function weekOptions() {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return [
    { label: "This week", start: getWeekStartDateOnly() },
    { label: "Next week", start: getWeekStartDateOnly(nextWeek) },
  ].map((option) => ({ ...option, range: formatWeekRange(option.start) }));
}

export default function GenerateWeekButton({ variant = "compact" }: { variant?: "compact" | "card" }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {variant === "card" ? (
        <div className={`${cardClass} p-5`}>
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-harvest-green/10 text-harvest-green flex items-center justify-center">
              <ChefHat size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-serif text-lg text-harvest-green">Generate a week</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Have Claude plan a new week from your preference guides.
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-harvest-green px-4 py-2 text-sm font-semibold text-white"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card-border)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-harvest-green transition active:scale-[0.98]"
        >
          <ChefHat size={14} strokeWidth={2.5} />
          Generate
        </button>
      )}

      {isOpen ? <GenerateWeekModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function GenerateWeekModal({ onClose }: { onClose: () => void }) {
  const { plan, refresh, selectWeek } = useMealPlan();
  const [options] = useState(weekOptions);
  const [weekStart, setWeekStart] = useState(options[1].start);
  const [form, setForm] = useState<RulesForm>(emptyForm);
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setForm(loadForm()));
  }, []);

  useEffect(() => {
    if (!isGenerating) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  function updateType(type: WeekMealType, patch: Partial<TypeForm>) {
    setForm((current) => ({
      ...current,
      types: { ...current.types, [type]: { ...current.types[type], ...patch } },
    }));
  }

  async function generate(replace = false): Promise<void> {
    setError(null);
    setElapsed(0);
    setIsGenerating(true);
    saveForm(form);

    try {
      const response = await fetch("/api/mealplan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, replace, rules: toRules(form) }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 409 && !replace) {
        setIsGenerating(false);
        if (window.confirm(`${payload.error} Replace it with a newly generated week?`)) {
          return generate(true);
        }
        return;
      }
      if (response.status === 401) {
        throw new Error("Your session expired. Sign in again and retry.");
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Couldn't generate a week.");
      }

      const weekRange: string = payload.data.mealPlan.weekRange;
      onClose();
      if (plan?.weekRange === weekRange) {
        await refresh();
      } else {
        selectWeek(weekRange);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't generate a week.");
      setIsGenerating(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--surface-0)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4">
        <div>
          <p className={sectionLabelColorClass.green}>Generate a week</p>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            Claude plans {WEEK_SHAPE} and a junk list from your guides.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isGenerating}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tint-stone)] text-[var(--muted-text)] disabled:opacity-50"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <fieldset disabled={isGenerating} className="flex-1 overflow-y-auto px-4 py-4">
        <p className={sectionLabelColorClass.green}>Week</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {options.map((option) => (
            <button
              key={option.start}
              type="button"
              onClick={() => setWeekStart(option.start)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                weekStart === option.start
                  ? "border-harvest-green bg-harvest-green/10"
                  : "border-[var(--border-subtle)] bg-[var(--surface-1)]"
              }`}
            >
              <span className="block text-sm font-semibold text-[var(--foreground)]">{option.label}</span>
              <span className="block text-xs text-[var(--muted-text)]">{option.range}</span>
            </button>
          ))}
        </div>

        <p className={`mt-6 ${sectionLabelColorClass.green}`}>Whole week</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SKIP_GROUP_IDS.map((id) => {
            const isOn = form.skip.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  setForm({
                    ...form,
                    skip: isOn ? form.skip.filter((group) => group !== id) : [...form.skip, id],
                  })
                }
                className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                  isOn
                    ? "border-harvest-green bg-harvest-green/10"
                    : "border-[var(--border-subtle)] bg-[var(--surface-1)]"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                      isOn ? "border-harvest-green bg-harvest-green text-white" : "border-[var(--border-subtle)]"
                    }`}
                  >
                    {isOn ? "✓" : ""}
                  </span>
                  {SKIP_GROUPS[id].label} this week
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted-text)]">{SKIP_GROUPS[id].description}</span>
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs font-semibold text-[var(--muted-text)]">
          Never include (comma-separated)
          <input
            value={form.avoid}
            onChange={(event) => setForm({ ...form, avoid: event.target.value })}
            placeholder="shrimp, mushrooms"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-[var(--muted-text)]">
          Notes for Claude
          <textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Busy week, keep dinners under 20 minutes"
            rows={2}
            className={`${inputClass} mt-1 resize-none`}
          />
        </label>

        <p className={`mt-6 ${sectionLabelColorClass.green}`}>By meal type</p>
        <div className={`mt-2 divide-y divide-[var(--border-subtle)] ${cardClass}`}>
          {WEEK_MEAL_TYPES.map((type) => (
            <div key={type} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold capitalize text-[var(--foreground)]">
                  {formatMealCount(type)}
                </span>
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-text)]">
                  <input
                    type="checkbox"
                    checked={form.types[type].vegetarian}
                    onChange={(event) => updateType(type, { vegetarian: event.target.checked })}
                    className="h-4 w-4 accent-harvest-green"
                  />
                  All vegetarian
                </label>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  value={form.types[type].avoid}
                  onChange={(event) => updateType(type, { avoid: event.target.value })}
                  placeholder="Never include"
                  aria-label={`${type}: never include`}
                  className={`${inputClass} py-2 text-sm`}
                />
                <input
                  value={form.types[type].notes}
                  onChange={(event) => updateType(type, { notes: event.target.value })}
                  placeholder="Notes, e.g. 2 vegetarian, not spicy"
                  aria-label={`${type}: notes`}
                  className={`${inputClass} py-2 text-sm`}
                />
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-0)] px-4 py-4">
        {error ? (
          <p className="mb-3 text-sm font-medium text-harvest-terracotta">{error}</p>
        ) : null}
        {isGenerating ? (
          <p className="mb-3 text-xs text-[var(--muted-text)]">
            Planning… {minutes}:{seconds}. This usually takes 2–4 minutes; keep this screen open.
          </p>
        ) : null}
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => void generate()}
          className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-harvest-green px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : null}
          {isGenerating ? "Generating…" : `Generate ${options.find((o) => o.start === weekStart)?.range}`}
        </button>
      </div>
    </div>
  );
}
