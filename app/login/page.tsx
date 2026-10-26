import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth";
import { cardClass, inputClass } from "@/lib/uiClasses";

export const metadata: Metadata = { title: "Sign in · Harvest" };

const ERRORS: Record<string, string> = {
  invalid: "That username and password didn't match.",
  config: "Login isn't set up on the server yet (AUTH_USERS / AUTH_SECRET).",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const message = error ? ERRORS[error] ?? ERRORS.invalid : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-[2rem] font-bold leading-none text-harvest-green">Harvest</h1>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Sign in to your meal plan
          </p>
        </div>

        <form method="post" action="/api/auth/login" className={`${cardClass} space-y-4 p-6`}>
          <input type="hidden" name="next" value={safeNextPath(next)} />

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--foreground)]">Username</span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--foreground)]">Password</span>
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </label>

          {message ? (
            <p role="alert" className="text-sm font-medium text-harvest-terracotta">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-2xl bg-harvest-green px-4 py-3 text-base font-semibold text-[var(--surface-1)] transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
