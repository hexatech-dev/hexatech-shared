# @hexatech-dev/shared

Shared helpers for Hexatech products (credbox, jalkhata, janmat, sportik,
hexatech-website) — server-side (Node) and browser-side. This repo is public
and consumed as a plain git dependency — no package registry, no token,
anywhere (local installs or Vercel builds).

**Runtime split**: `./db`, `./auth`, `./storage-apk` are Node-only (they
import `ws`/`jose`/`express`/`fs`). `./auth-client`, `./storage-upload` are
browser-safe (only `@supabase/supabase-js`) — never add a Node-only import to
these two. `./email`/`./contact` are Node-only (`resend`).

## Modules

- **`@hexatech-dev/shared/db`** — `createDb({ databaseUrl, schema })`. Picks
  the Neon WebSocket driver when `databaseUrl` is a `neon.tech` host,
  otherwise plain `node-postgres` — the same connection string works against
  production Neon and local Postgres with no code change.
- **`@hexatech-dev/shared/auth`** — `createSupabaseAdmin`,
  `resolveUserFromAccessToken` (verifies a Supabase access token locally via
  JWKS, no per-request round-trip to Supabase's Auth API),
  `createBearerVerifyMiddleware` (ready-made Express middleware), plus
  `createUserByEmail`/`updateUserPasswordById` admin helpers. All Hexatech
  products share one Supabase project for auth, so every consumer passes the
  same `SUPABASE_URL`.
- **`@hexatech-dev/shared/auth-client`** — `createAppSupabaseClient` (the
  browser-side Supabase client every product previously hand-rolled),
  `signInWithOAuth` (Google sign-in, with an optional system-browser flow for
  native — the seam for swapping auth methods later without touching every
  consumer), `sanitizeReturnTo`/`oauthRedirectUrl` (open-redirect-safe
  post-login routing).
- **`@hexatech-dev/shared/email`** — `createEmailClient({ apiKey })`, a thin
  Resend wrapper with safe-fail semantics (`send` never throws), plus
  `HEXATECH_SEND_DOMAIN`/`buildFromAddress` — every product must send from
  the shared `hexatech.dev` domain (Resend's free tier only verifies one
  domain). Validation, templating, and recipient routing stay app-specific.
- **`@hexatech-dev/shared/contact`** — `sendContactMessage`, the shared
  "contact us" form handler (honeypot spam guard + Resend send) used by every
  marketing site's contact Server Action.
- **`@hexatech-dev/shared/storage-apk`** — `uploadApkRelease`,
  `resolveLatestApkDownloadUrl` — self-hosted Android APK release
  distribution via a Supabase Storage bucket (credbox and jalkhata's
  previously-duplicated upload script + download-redirect route pattern).
- **`@hexatech-dev/shared/storage-upload`** — `uploadPublicImage`, a
  direct-from-browser Supabase Storage upload (e.g. user avatars/logos),
  generalized from sportik's implementation.
- **`@hexatech-dev/shared/logger`** — `createLogger` (console-backed,
  `timestamp [source] message` shape, env-gated debug verbosity via
  `DEBUG_API`) and `createRequestLogger` (Express middleware — one debug
  line per `/api` request, one on response finish, 5xx logs at warn level).
  Generalized from sportik's `server/lib/logger.ts` +
  `server/middleware/requestLogger.ts`. Deliberately never logs request/
  response bodies — credbox/jalkhata/janmat's pre-existing hand-rolled
  middleware did, which risks leaking PII into logs.

## Installing

Each product depends on a specific tag, not a floating branch:

```json
"@hexatech-dev/shared": "github:hexatech-dev/hexatech-shared#v0.1.0"
```

`npm install` clones the tagged commit, runs this package's own `prepare`
script (`npm run build`) to produce `dist/`, and uses that — no registry
involved, so this works identically on a laptop and on Vercel.

## Versioning

Bump deliberately and tag a release when consumers need the change:

```bash
npm version <patch|minor|major>
git push --follow-tags
```

Then update the `#v<version>` tag in each consumer's `package.json`
dependency and reinstall — there's no auto-update; every product pins an
exact tag.

## Local development against this package

For iterating without cutting a real tag yet, use `npm link`:

```bash
npm run build   # in hexatech-shared
npm link        # in hexatech-shared
npm link @hexatech-dev/shared   # in the consumer repo
```

## Consumer version matrix

There's no registry and no CI, so nothing catches version drift automatically.
This table is the source of truth for who's on what — **update it in the same
change** whenever you bump a tag in any consumer's `package.json`. Check
current drift at any time with `scripts/check-consumer-pins.sh`.

| Consumer | `@hexatech-dev/shared` | `@hexatech-dev/ui` |
| --- | --- | --- |
| credbox-monorepo | v0.3.1 | v0.4.0 |
| jalkhata-monorepo (root) | v0.3.1 | v0.4.0 |
| jalkhata-monorepo/www | v0.1.4 | — |
| janmat-monorepo | v0.3.1 | v0.4.0 |
| sportik-monorepo (root) | v0.3.2 | v0.5.0 |
| sportik-monorepo/server | v0.3.1 | — |
| sportik-monorepo/web | v0.3.1 | — |
| hexatech-website | v0.3.2 | — |

When bumping a tag: land it in a test-user repo (janmat, jalkhata) first,
promote to credbox/sportik only after it's been consumed successfully
elsewhere.
