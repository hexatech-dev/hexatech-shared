import type { NextFunction, Request, Response } from "express";

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  /** Request lifecycle and other high-volume diagnostics — skipped in
   * production unless explicitly re-enabled (see CreateLoggerOptions). */
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface CreateLoggerOptions {
  /** Tag shown as `[source]` (info/warn) or `[source:debug]` (debug) on
   * each line. Default "api". */
  source?: string;
  /** Force debug-level output on/off. Defaults to `NODE_ENV !==
   * "production"`, overridable per-deploy via `DEBUG_API=1` (force on) or
   * `DEBUG_API=0` (force off) without a code change. */
  verbose?: boolean;
}

function timestamp(): string {
  return new Date().toISOString();
}

function defaultVerbose(): boolean {
  if (process.env.DEBUG_API === "0") return false;
  if (process.env.DEBUG_API === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Plain console-backed logger (no external dependency) with a consistent
 * `timestamp [source] message` shape and env-gated debug verbosity.
 * Generalized from sportik's `server/lib/logger.ts`, the only product with
 * this pattern today — the other three backends instead hand-roll a
 * request-logging middleware that also JSON.stringifies and logs response
 * bodies, which risks leaking PII into logs; this logger and
 * `createRequestLogger` below deliberately never do that.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const source = options.source ?? "api";
  const verbose = options.verbose ?? defaultVerbose();

  function write(
    method: "log" | "warn",
    tag: string,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    const line = `${timestamp()} [${tag}] ${message}`;
    if (meta !== undefined && Object.keys(meta).length > 0) {
      console[method](line, meta);
    } else {
      console[method](line);
    }
  }

  return {
    info(message, meta) {
      write("log", source, message, meta);
    },
    warn(message, meta) {
      write("warn", source, message, meta);
    },
    debug(message, meta) {
      if (!verbose) return;
      write("log", `${source}:debug`, message, meta);
    },
  };
}

/** Describes the shape of a Bearer auth header without ever logging the
 * actual token — useful for debugging "why is this request unauthorized"
 * without risking a credential ending up in log output. */
function describeBearerHeader(value: unknown): string {
  if (value === undefined || value === null || value === "") return "missing";
  if (typeof value !== "string") return `invalid-type(${typeof value})`;
  if (!value.startsWith("Bearer ") || value.length <= 7)
    return "present-not-bearer";
  const raw = value.slice(7).trim();
  const looksJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw);
  return `bearer chars=${raw.length} shape=${looksJwt ? "jwt" : "opaque"}`;
}

export interface CreateRequestLoggerOptions {
  logger: Logger;
  /** Only log requests whose path starts with this prefix — avoids noise
   * from static assets / SPA catch-all routes. Default "/api". */
  pathPrefix?: string;
}

/**
 * Express middleware: logs one debug-level line per matching request (auth
 * header shape + content-type, no body) and one on response finish (method,
 * path, status, duration) — 5xx responses log at warn level instead of
 * debug, so they're visible even with debug logging off in production.
 * Never reads or logs a request/response body.
 */
export function createRequestLogger(options: CreateRequestLoggerOptions) {
  const { logger, pathPrefix = "/api" } = options;

  return function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const path = req.originalUrl ?? req.url;
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }

    const start = Date.now();
    logger.debug(`${req.method} ${path}`, {
      auth: describeBearerHeader(req.headers.authorization),
      contentType: req.headers["content-type"],
    });

    res.on("finish", () => {
      const ms = Date.now() - start;
      const line = `${req.method} ${path} → ${String(res.statusCode)} (${ms}ms)`;
      if (res.statusCode >= 500) logger.warn(line);
      else logger.debug(line);
    });

    next();
  };
}
