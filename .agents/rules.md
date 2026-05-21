# Agent Rules

Tool guidance for AI work in this repository.

## How To Use

- Load this file for every AI-assisted code change.
- For bugs, follow the bug workflow below.
- For new behavior, follow the vertical-slice workflow below.
- Before handoff, run the finish review below.

## Project Context

- NodeRef is a desktop workspace for Alfresco admins, developers, and support engineers.
- Stack: pnpm monorepo, TypeScript, React, Vite, Mantine, Monaco, Zustand, Node.js, Express, Prisma, SQLite, Neutralino.
- Renderer code lives in `apps/renderer`.
- Backend code lives in `apps/backend`.
- Shared models, errors, and RPC contracts live in `packages/contracts`.
- Generated or built output is not source; do not edit it.

## Core Rules

- Understand the existing code before changing it.
- Prefer the smallest clear change that solves the task.
- If a 200-line implementation can be expressed clearly in 50 lines, use the 50-line version.
- Keep edits limited to files directly related to the task.
- Match existing naming, structure, UI patterns, and test style.
- State assumptions when requirements are ambiguous.
- Do not perform broad refactors while fixing a narrow issue.
- Do not remove or rewrite unrelated code.
- Do not add abstractions, wrappers, options, callbacks, strategies, or plugin points until a real caller needs them.
- Do not add a dependency without first checking the workspace and `package.json`.

## Architecture Rules

- Contract changes start in `packages/contracts` and flow into backend and renderer usage.
- Cross-boundary types and RPC payloads belong in `packages/contracts`, not duplicated in app code.
- After editing `packages/contracts`, run `pnpm --filter @app/contracts build` before backend or renderer typecheck; downstream packages consume the built output.
- Schema changes go through Prisma migrations via `pnpm migrate:dev`. Do not hand-edit existing migration files or run raw SQL against `dev.db`.
- Backend repositories own persistence; services own business logic and Alfresco/API behavior; RPC handlers adapt validated requests to services.
- Renderer pages compose features; reusable UI belongs in components; shared state belongs in existing stores.
- Prefer dense, information-rich UI. No hero sections, splash animations, or decorative gradients — this is an operational tool.

## Sensitive Data

- Never commit or log Alfresco credentials, tokens, session cookies, or `.env` values.
- Treat saved Alfresco connections and persisted credentials in SQLite as sensitive; do not surface them in error messages, telemetry, or debug output.

## Code Smells

Look for these during review:

- A small behavior spread across many files, layers, or concepts.
- A function mixing parsing, validation, business rules, persistence, and formatting.
- A helper that mainly renames another helper.
- Types wider than the values the code actually supports.
- Error handling that hides the real failure or converts it into a vague fallback.
- Tests that assert implementation details instead of behavior.
- Comments that explain obvious code instead of non-obvious reasoning.

## Bug Workflow

1. Reproduce or localize the failure.
2. Identify the narrowest failing path.
3. Read nearby tests and implementation before changing code.
4. Fix the root cause, not only the visible symptom.
5. Add or update a regression test when practical.
6. Run the narrowest relevant verification.

## Vertical-Slice Workflow

1. Define the smallest observable behavior that proves the change works.
2. Locate the ownership path: contract, backend, renderer, or a subset.
3. Add or update the narrowest meaningful test first when the behavior is testable.
4. Implement only enough code to satisfy the behavior.
5. Refactor only inside the touched area after the behavior works.
6. Run the relevant test or build checks.

## Verification

- `pnpm test` — backend behavior covered by tests.
- `pnpm --filter @app/contracts build` — after contract changes.
- `pnpm --filter @app/renderer build` — after renderer type or build-sensitive changes.
- `pnpm lint` — when touching shared patterns or broad TypeScript code.
- `pnpm fallow` — to check for bloat, duplication, unused exports, and avoidable complexity.

## Finish Review

Before saying the task is complete:

- The diff is scoped to the requested change.
- Error handling and fallback behavior are intentional.
- Sensitive data is not logged, returned, or committed.
- State exactly which checks passed and which were not run.
