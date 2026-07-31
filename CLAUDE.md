# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@hexatech-dev/shared` — backend helpers (DB client, Supabase auth, Resend email, Supabase Storage) shared across all five Hexatech products. See `README.md` for the module list and consumption instructions; this file is about *contributing to* the package, not using it.

## Hexatech ecosystem

This repo is consumed by all five Hexatech products (credbox, jalkhata, janmat, sportik, hexatech-website), each a sibling folder under `~/Workspace/Hexatech/` and its own independent git repo — **not a monorepo**. Every consumer pins an exact tag of this repo in its `package.json` (`github:hexatech-dev/hexatech-shared#v0.x.x`) — there is no auto-update.

A change here has **zero effect anywhere** until a consumer bumps its pin (Phase 2+ of the reuse rollout does this repo-by-repo, test-user repos first). Don't assume a change is "live" just because it's merged.

Sibling packages: `../hexatech-ui` (`@hexatech-dev/ui`) — themeable UI components, same distribution model, separate repo because it needs different build tooling (JSX/CSS bundling vs this repo's plain `tsc`).

## Critical rule: the browser-safe / Node-only module boundary

- `./db`, `./auth`, `./email`, `./contact`, `./storage-apk`, `./logger` are **Node-only** — they import `ws`/`jose`/`express`/`resend`/`fs`. Never import one of these from a file that could end up in a browser bundle.
- `./auth-client`, `./storage-upload` are **browser-safe** — they only ever import `@supabase/supabase-js`. If you add a new browser-facing export, put it in a new file with this same constraint, never inside an existing Node-only file.

Getting this wrong means a client-side Vite/Next.js bundle silently pulls in Node built-ins and breaks at build time (or worse, ships them).

## Adding a new module

1. New file in `src/`, exported via its own subpath in `package.json`'s `exports` map (`"./name": {"types": "./dist/name.d.ts", "default": "./dist/name.js"}`) — no barrel `index.ts`, each module is a separate entry so consumers only pull in what they use.
2. Only add a new `peerDependencies` entry if the module needs a package not already covered (`@neondatabase/serverless`, `@supabase/supabase-js`, `drizzle-orm`, `express`, `jose`, `pg`, `resend`, `ws`).
3. `npm run check` (`tsc --noEmit`) and `npm run build` (`tsc`) before tagging.
4. Bump version (`npm version <patch|minor|major>`), `git push --follow-tags`.
5. **Update the consumer version matrix in `README.md` in the same change** whenever you bump a *consumer's* pin — that table is the only thing standing in for the CI/registry checks this repo deliberately doesn't have. Run `scripts/check-consumer-pins.sh` any time to see current drift.

## Bump-order discipline

No CI gates this repo, so land a new tag in a test-user product first (janmat, jalkhata) before promoting it to a production repo (credbox, sportik) — the existing risk tiers apply to package bumps too, not just product-repo changes.
