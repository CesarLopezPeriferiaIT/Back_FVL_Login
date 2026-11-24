# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Express 5 + TypeScript (ESM, strict) login microservice for Fundacion Valle del Lili: account registration, email confirmation, login/refresh/logout. Persists to SQL Server. Code identifiers, messages and most comments are in Spanish; file-level JSDoc is in English. Full spec: `odd/tasks/login-microservice.md`; API guide: `docs/api-guide.html`; pending work: `CHANGELOG.md`.

## Commands

- `bun install` — local deps (Node >= 24 is required for scripts/container; `package-lock.json` also exists).
- `npm run dev` — `tsx watch src/index.ts`; `npm run build` / `npm start` — compile to `dist/` and run.
- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm test` — Vitest (`tests/**/*.test.ts`); single file: `npx vitest run tests/unit/auth-service.test.ts`; single test: add `-t "name"`.
- `npm run test:coverage` — enforces 80% lines/functions/branches/statements (`src/index.ts` and `src/types` excluded).
- `npm run verify` — typecheck + lint + coverage.
- `docker compose up -d` then `npm run db:init` — start SQL Server and apply `db/init/01-schema.sql` (creates `FVL_Login` only if missing and not in qas/prd).
- Copy `.env.example` to `.env`; compose requires `JWT_ACCESS_SECRET`, `DB_USER`, `DB_PASSWORD`. The template needs updating for the confirmation-code configuration; see `CHANGELOG.md`.

## Architecture

Layered with dependency injection; no shared mutable state, functional style (factories `createX(deps)` returning objects, no classes).

- `src/index.ts` — composition root: loads config, builds the pool, repositories, services, then `createApp`. Excluded from coverage.
- `src/app.ts` — `createApp(AppDeps)` builds Express; all routes mount under `/backend/{ambiente}/v{apiVersion}` (ambiente: `dev|qas|prd`). `/` and `/health` also exist at root.
- `src/domain/` — business logic. `ports.ts` declares repository interfaces; `auth-service`, `api-key-service`, `token-service`, `mail-service`, `password-hasher` (argon2) depend only on those ports. `entities.ts` holds types and the `PERMISOS` constants.
- `src/domain/codigo-confirmacion-service.ts` — confirmation-code service.
- `src/infrastructure/` — SQL Server (`mssql`) repositories and pool, nodemailer sender and templates. Implements the ports; `codigo-confirmacion.repository.ts` persists codes in `dbo.codigo_confirmacion`.
- `src/http/` — routes, controllers, zod validators, middlewares. Responses always go through `http-response.ts` with shape `{ message, error, code, data }`; errors are `AppError` handled by `middlewares/error-handler.ts`.
- `tests/helpers/in-memory.ts` — in-memory repository doubles used by unit tests; `tests/integration/http.test.ts` drives the app via supertest with those doubles (no real DB needed).

Request security chain on `/auth/*` (see `routes/auth.routes.ts`): API key with per-route permission (`exigirApiKey`, key issued via `/installations`) → rate limiters (login/register/confirmation) → Bearer JWT where needed (`exigirBearer`) → controller. Only the access JWT secret remains; email confirmation uses a six-digit code instead of a JWT.

## Conventions

- Strict TS, no `any`; use `unknown` at input boundaries and narrow via zod.
- Every file starts with a JSDoc block: English description, `@author`, `@version`.
- Imports use `.js` extensions (ESM/NodeNext).
