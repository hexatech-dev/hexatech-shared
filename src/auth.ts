import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import * as jose from "jose";

const AUTHENTICATED_AUD = "authenticated";

export interface CreateSupabaseAdminOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * Admin (service-role) Supabase client. Call once per process — e.g. export
 * the result from your own `services/supabase.ts` — rather than on every
 * request; the client itself is stateless and safe to reuse.
 */
export function createSupabaseAdmin(
  options: CreateSupabaseAdminOptions,
): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = options;
  if (!supabaseUrl) throw new Error("supabaseUrl is required");
  if (!serviceRoleKey) throw new Error("serviceRoleKey is required");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createUserByEmail(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<User> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) throw error ?? new Error("Failed to create user");
  return data.user;
}

export async function updateUserPasswordById(
  admin: SupabaseClient,
  id: string,
  password: string,
): Promise<User> {
  const { data, error } = await admin.auth.admin.updateUserById(id, {
    password,
  });
  if (error || !data?.user)
    throw error ?? new Error("Failed to update user password");
  return data.user;
}

const jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

function issuerFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
}

function getJwks(supabaseUrl: string) {
  const iss = issuerFor(supabaseUrl);
  let jwks = jwksCache.get(iss);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`));
    jwksCache.set(iss, jwks);
  }
  return jwks;
}

/**
 * Verifies a Supabase access token locally via the project's JWKS endpoint —
 * no round-trip to Supabase's Auth API per request (unlike
 * `supabase.auth.getUser(token)`), so this is safe to call on every
 * authenticated request under load.
 */
export async function resolveUserFromAccessToken(
  supabaseUrl: string,
  token: string,
): Promise<User> {
  const iss = issuerFor(supabaseUrl);
  const { payload } = await jose.jwtVerify(token, getJwks(supabaseUrl), {
    issuer: iss,
    audience: AUTHENTICATED_AUD,
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== "string") {
    throw new Error("Token payload missing subject");
  }
  return { id: sub } as User;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Express middleware: requires a valid `Authorization: Bearer <token>`
 * header, verifies it against Supabase's JWKS, and sets `req.user`.
 * Responds 401 directly (matching the response shape credbox/jalkhata
 * already use) rather than throwing.
 */
export function createBearerVerifyMiddleware(supabaseUrl: string) {
  return async function verifyToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.slice("Bearer ".length);
    try {
      req.user = await resolveUserFromAccessToken(supabaseUrl, token);
      next();
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
  };
}
