# @hexatech-dev/shared

Shared server-side helpers for Hexatech products (credbox, jalkhata, janmat,
sportik). This repo is public and consumed as a plain git dependency — no
package registry, no token, anywhere (local installs or Vercel builds).

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
- **`@hexatech-dev/shared/email`** — `createEmailClient({ apiKey })`, a thin
  Resend wrapper with safe-fail semantics (`send` never throws). Validation,
  templating, and recipient routing stay app-specific.

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
