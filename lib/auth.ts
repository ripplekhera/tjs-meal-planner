/**
 * Minimal username/password login for a small, fixed set of users.
 *
 * Users come from the AUTH_USERS environment variable:
 *   AUTH_USERS="alice:first-password,bob:second-password"
 * Sessions are a signed cookie (HMAC-SHA256 with AUTH_SECRET), so there is no
 * session table. Changing AUTH_SECRET signs everyone out; removing a user from
 * AUTH_USERS revokes that user's session on their next request.
 *
 * Uses only Web Crypto so it runs in both middleware and Node route handlers.
 */

export const SESSION_COOKIE = "harvest_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

export type AuthConfig = {
  users: Map<string, string>;
  secret: string;
};

/** Auth is skipped in `next dev` unless AUTH_USERS is set; production always requires it. */
export function isAuthRequired(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.AUTH_USERS?.trim());
}

export function getAuthConfig(): AuthConfig | null {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  const raw = process.env.AUTH_USERS?.trim() ?? "";
  if (secret.length < 32 || !raw) return null;

  const users = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    const sep = trimmed.indexOf(":");
    if (sep <= 0 || sep === trimmed.length - 1) continue;
    users.set(normalizeUsername(trimmed.slice(0, sep)), trimmed.slice(sep + 1));
  }
  return users.size > 0 ? { users, secret } : null;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Checks a username/password pair; compares digests so timing doesn't leak the password. */
export async function verifyCredentials(
  config: AuthConfig,
  username: string,
  password: string
): Promise<string | null> {
  const name = normalizeUsername(username);
  const expected = config.users.get(name);
  // Always hash something so unknown usernames take the same time as wrong passwords.
  const [a, b] = await Promise.all([
    sha256(password),
    sha256(expected ?? "\u0000no-such-user"),
  ]);
  const match = timingSafeEqual(a, b);
  return expected !== undefined && match ? name : null;
}

export async function createSessionToken(config: AuthConfig, username: string): Promise<string> {
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS })
    )
  );
  const signature = base64UrlEncode(await hmac(config.secret, payload));
  return `${payload}.${signature}`;
}

/** Returns the signed-in username, or null if the token is missing, tampered with, or expired. */
export async function readSessionToken(
  config: AuthConfig,
  token: string | undefined
): Promise<string | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let provided: Uint8Array;
  try {
    provided = base64UrlDecode(signature);
  } catch {
    return null;
  }
  const expected = await hmac(config.secret, payload);
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as {
      u?: unknown;
      exp?: unknown;
    };
    if (typeof data.u !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    if (!config.users.has(data.u)) return null;
    return data.u;
  } catch {
    return null;
  }
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/menu";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/menu";
  if (value.startsWith("/login") || value.startsWith("/api/")) return "/menu";
  return value;
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
