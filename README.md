# @hexatech-dev/shared

Shared server-side helpers for Hexatech products (credbox, jalkhata, janmat,
sportik), published as a private npm package via GitHub Packages.

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

## Versioning & publishing

Each product pins an exact version in its own `package.json` and bumps it
deliberately — no floating ranges against this package. To publish a new
version:

```bash
npm version <patch|minor|major>
git push --follow-tags
```

The `publish` workflow (`.github/workflows/publish.yml`) builds and runs
`npm publish` on any pushed `v*` tag, using the repo's own `GITHUB_TOKEN`
(no manual PAT needed).

## Local development against this package

Since none of the consumer repos are a workspace/monorepo with this one, use
`npm link` for local iteration before cutting a real version:

```bash
npm run build   # in hexatech-shared
npm link        # in hexatech-shared
npm link @hexatech-dev/shared   # in the consumer repo
```
