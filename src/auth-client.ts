import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Deliberately a separate file/export from `./auth`: that module imports
 * `jose`/`ws`/`express` unconditionally, which must never end up in a
 * browser bundle. This file only ever imports `@supabase/supabase-js`.
 */

export interface CreateAppSupabaseClientOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * Distinguishes concurrent sessions sharing one browser storage — e.g. two
   * Supabase clients (admin + staff) served from the same origin need
   * different keys or they'd clobber each other's session.
   */
  storageKey: string;
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

/**
 * The browser-side Supabase client every product's `client/src/lib/supabase.ts`
 * (or equivalent) currently hand-rolls with near-identical options. Centralizing
 * it means a future change to auth defaults (or the auth method itself) is one
 * edit here instead of one per product.
 */
export function createAppSupabaseClient(
  options: CreateAppSupabaseClientOptions,
): SupabaseClient {
  const {
    supabaseUrl,
    supabaseAnonKey,
    storageKey,
    persistSession = true,
    autoRefreshToken = true,
    detectSessionInUrl = true,
  } = options;

  if (!supabaseUrl) throw new Error("supabaseUrl is required");
  if (!supabaseAnonKey) throw new Error("supabaseAnonKey is required");

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession,
      autoRefreshToken,
      detectSessionInUrl,
      storageKey,
    },
  });
}

export interface NativeOAuthRedirect {
  /**
   * e.g. "com.sportik.app://auth/callback" — must match the intent-filter in
   * AndroidManifest.xml and the redirect URL allow-listed in Supabase
   * Dashboard > Authentication > URL Configuration.
   */
  nativeCallbackUrl: string;
  /**
   * Hand-off to the OS. Pass Capacitor's `Browser.open` — required because
   * Google (and most OAuth providers) block sign-in inside an embedded
   * WebView.
   */
  openUrl: (url: string) => Promise<void> | void;
}

export interface SignInWithOAuthOptions {
  supabase: SupabaseClient;
  /**
   * Widen this union only when a second provider actually ships — today
   * every product uses Google exclusively.
   */
  provider: "google";
  isNative: boolean;
  /** Where the web flow redirects back to, e.g. `window.location.origin`. */
  webRedirectTo: string;
  /** Omit to keep native sign-in inside the WebView (the older, discouraged
   * pattern); pass it to open the system browser instead (recommended). */
  native?: NativeOAuthRedirect;
  /** Optional post-login destination, appended as a query param to whichever
   * redirect URL is used. */
  returnTo?: string;
}

function withReturnTo(url: string, returnTo: string | undefined): string {
  if (!returnTo) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Shared Google OAuth sign-in. On native, when `native` is supplied, this
 * opens the consent screen in the system browser (`skipBrowserRedirect` +
 * `native.openUrl`) rather than the in-app WebView — the pattern already
 * proven in sportik, since Google blocks OAuth inside embedded WebViews.
 *
 * This is also the seam for a future auth-method change: swapping Google
 * OAuth for e.g. OTP/mobile auth later means adding a `signInWithOtp()`
 * function here once, rather than rewriting every product's call site.
 */
export async function signInWithOAuth(
  options: SignInWithOAuthOptions,
): Promise<void> {
  const { supabase, provider, isNative, webRedirectTo, native, returnTo } =
    options;

  const useSystemBrowser = isNative && !!native;
  const redirectTo = useSystemBrowser
    ? withReturnTo(native!.nativeCallbackUrl, returnTo)
    : withReturnTo(webRedirectTo, returnTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: useSystemBrowser,
    },
  });

  if (error) throw error;

  if (useSystemBrowser && data?.url) {
    await native!.openUrl(data.url);
  }
}

export interface ReturnToOptions {
  /** Path OAuth redirects back to after a fresh sign-in; default "/login". */
  loginPath?: string;
}

const DEFAULT_RETURN = "/";

/**
 * Relative-app-path guard for post-login routing — blocks open redirects
 * (absolute/protocol-relative URLs) and login loops (routing back to the
 * login page itself). Lifted from sportik's `returnTo.ts`, the only product
 * that had this today; generically useful for any login flow.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
  opts: ReturnToOptions = {},
): string {
  const loginPath = opts.loginPath ?? "/login";
  if (!raw) return DEFAULT_RETURN;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_RETURN;
  }

  if (trimmed === loginPath || trimmed.startsWith(`${loginPath}?`)) {
    return DEFAULT_RETURN;
  }

  return trimmed;
}

export interface OauthRedirectUrlOptions extends ReturnToOptions {
  isNative: boolean;
  /** Required when `isNative` is true. */
  nativeCallbackUrl?: string;
  returnToParam?: string;
}

/**
 * Builds the `redirectTo` URL for `signInWithOAuth`, branching native vs web
 * the same way `oauthRedirectUrl` did in sportik's `returnTo.ts`.
 */
export function oauthRedirectUrl(
  returnTo: string,
  opts: OauthRedirectUrlOptions,
): string {
  const returnToParam = opts.returnToParam ?? "returnTo";
  const loginPath = opts.loginPath ?? "/login";

  if (opts.isNative) {
    if (!opts.nativeCallbackUrl) {
      throw new Error("nativeCallbackUrl is required when isNative is true");
    }
    return `${opts.nativeCallbackUrl}?${returnToParam}=${encodeURIComponent(returnTo)}`;
  }

  const safe = sanitizeReturnTo(returnTo, { loginPath });
  const path =
    safe === DEFAULT_RETURN
      ? loginPath
      : `${loginPath}?${returnToParam}=${encodeURIComponent(safe)}`;
  return `${window.location.origin}${path}`;
}
