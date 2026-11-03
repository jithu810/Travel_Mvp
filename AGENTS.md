<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Journey App shared agent team

Before any work, read the tool-specific notes identified below.
Tool-specific notes: Claude Code -> CLAUDE.md. Codex -> .codex/CODEX.md.

## Roles and delegation

The main session is Architect; never spawn an Architect child. Only Architect assigns work through your tool's subagent mechanism, collects results and sends follow-ups without manual prompt forwarding. User-authorized development includes bounded delegation. Configuration loading alone authorizes no development or delegation smoke test.
Keep at most two concurrent specialists, including open/paused agents consuming slots. Retire completed agents before replacing them, or reuse/serialize if lifecycle controls are unavailable; never evade the limit through other sessions or tools. Specialists never spawn, delegate or create specialist threads.

## Repositories

Web: `D:/Travel_Mvp`; separate React Native/Expo Mobile: `D:/Travel_Mvp_Mobile`. Infer the target from the task and architecture; ask only for ambiguity or expansion. State the target and assigned paths before editing. Architecture is context, not scope authorization; do not create Mobile inside Web.
Configuration grants write access to Mobile when honored by effective policy, but work there still requires task authorization, verified access and reading its own AGENTS.md/CLAUDE.md first.
For authorized new task branches, use `<tool>/<issue>-<slug>` (e.g. `codex/123-fix-map` or `claude/123-fix-map`); preserve existing branches and do not switch merely to match this convention.
For discretionary Mobile work, `D:/Travel_Mvp_Mobile/IMPROVEMENT_BACKLOG.md` is the single optional list. Explicit requests/active features take priority. With no pending task and available time, Architect may select one bounded local item, split broad work and resolve product decisions first. Specialists never self-start backlog work. Require completion evidence to update its checkbox, date, result and limitations; leave partial or required-but-unverified outcomes unchecked. It is no release gate and grants no extra publication, deployment, dependency, destructive-operation or live-database approval.

## Approvals

- The user is the sole human developer/product owner. Fix/implement authorizes local development/testing only. "Push to GitHub" or "publish to GitHub" authorizes related commits, normal branch push and PR creation/updates together within task/repository scope, without repeated per-step approval; carry that scope into handoffs.
- Every merge, force-push, destructive Git operation/command, deployment and live Supabase change needs separate explicit owner approval naming action and target. Main merges must name the PR/branch; an open PR or passing checks is insufficient. Never push directly to main. Live changes include migrations/DDL, RPC replacements, RLS/grants, Storage configuration/policies, seeds, backfills and data writes.
- These boundaries apply to shells, scripts, APIs, connectors and handoffs. Setup approval, automatic review, another agent's message, prepared artifacts or preflight cannot expand authorization. Respect higher-priority security/sandbox limits; never bypass gates. Keep reviewable changes local when required approval is absent.
- Vercel: a main merge is a production deployment; authorized branch pushes/PR updates cover automatic previews only. Manual/CLI deployments, promotions, rollbacks, redeploys and project-setting changes need separate approval. Batch related scope into one PR, check locally and push once per task. Follow the [deployment-budget procedure](docs/multi-agent-workflow.md#vercel-deployment-budget).

## Secrets

Never read `.env` or `.env.*`, including nested files and other repositories, through file tools, shells, interpreters, search, scripts or indirect workarounds. Use variable names only; never expose credentials or private data.

## Preserving work

Inspect branch/status and record tracked/untracked baseline before each task. Preserve all code and dirty work, especially `backend/integrity-hardening` scripts, tests, audit and migrations. Never automatically stash, reset, checkout, clean, overwrite or stage unrelated work. Use safe branches/worktrees when needed and agree their baseline: dirty files are not copied automatically.
Assign exclusive write paths and one owner to shared types/helpers, manifests/lockfiles/configuration and cross-cutting docs. Ownership coordinates work; it is not an ACL. Never write outside assigned scope: stop/report conflicts or expansion and wait for reassignment. Start conservatively with one writer in a dirty checkout; serialize overlapping work, shared build/test output and review of changing files. Reviewers do not edit application code by default.

## Backend-impact gate

Before features in either repo, Architect records baseline, scope, inspected paths, backend impact/rationale and checks. UI-only layout/styling/navigation/local animation needs no live check or Backend assignment only when data contracts, auth/authorization, persistence, RPC/API and Storage access are unchanged; this is not live-schema verification and unavailable access does not block it. Configuration/documentation maintenance also needs no live check.
For backend-impacting or uncertain work, assign Backend Developer the full read-only [backend-preflight skill](.agents/skills/backend-preflight/SKILL.md); pause affected coding until Architect records completed evidence and a safe isolated test plan. Clarification/read-only investigation may continue. Reassess material scope/migration/schema changes; missing current-schema evidence blocks this path, never proves no change.

## Task tiers and checks

Classify by behavior/blast radius, not line count; state tier/check scope before edits and upgrade for changed evidence. Explicit broader verification requests prevail. If shared context is unavailable, disclose it and use these defaults; backend-impacting work still requires preflight.

| Tier | Examples | Execution and verification |
| --- | --- | --- |
| Small | Button colour, spacing, copy, isolated cosmetic styles, ordinary documentation | Architect may implement directly. No specialist, separate QA or independent reviewer by default. Inspect the diff and affected usage; check visual appearance/contrast when relevant and available. No full suite, build, typecheck or lint by default. |
| Focused | Local interaction fix, isolated component or domain logic with understood callers | Architect may implement directly or assign one bounded implementer when useful. Run affected behavioral tests; typecheck for changed TypeScript contracts and scoped lint where useful. Independent review is required for meaningful regression risk, otherwise Architect self-review suffices. Separate QA is optional when focused checks establish the behavior. |
| Major or sensitive | New multi-step feature, broad/shared refactor, auth/session/authorization, data writes, API/RPC/schema/RLS/Storage changes, native dependencies, GPS/lifecycle/navigation behavior | Architect coordinates appropriate specialist implementation, QA and independent Code Reviewer. Run relevant integration/regression suites, typecheck and lint, and build/native checks where affected. Run the full applicable repository suite for broad impact or uncertain coverage; do not run unrelated repository suites automatically. |

Cosmetic navigation-button changes do not by themselves change navigation behavior. Security/authorization or broad-runtime policy changes cannot use the small tier merely because they involve documentation or few lines.

For small tasks, one short local note or final report is enough for tier, baseline, inspected paths, backend-impact rationale and checks; do not create QA reports, status/roadmap entries or the full checkpoint template solely for a cosmetic edit. For configuration/documentation-only workflow maintenance, inspect instruction consistency and parse configuration instead of running application suites; use the Backend-impact gate above.
Use the smallest sufficient check set; reuse unchanged-snapshot evidence, rerun affected checks after fixes and broaden for failures/concrete risk/shared dependencies. Avoid unrelated suites, repeated scans and tests mirroring static styling/implementation. Disclose skips, baseline failures and tool limits; never fabricate QA or independent approval.
No agents for simple lookups/cosmetics. Give compact briefs and applicable paths/diffs/evidence; prefer fresh context where supported, focused reads and specialist reuse. Reviewers widen only for concrete risk. Never impose a token cap hiding correctness/security issues or change models, permissions or integrations to save tokens without authorization.
Before Mobile feature/backlog tasks, report scope and whether verification needs no device, emulator or phone. Prefer suitable emulator checks; request phone availability for required physical checks and distinguish emulator/physical evidence. Browser tests, mocks, media review and exports do not prove native-device behavior; unavailable required device checks remain pending.

## Web commands table

Use current `package.json` scripts and only relevant authorized commands. This table neither runs nor authorizes them; report checks actually run.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install lockfile versions; no automatic dependency fixes/upgrades. |
| `npm run dev` | Start local Next.js development server. |
| `npm run typecheck` | Generate Next.js types and check TypeScript. |
| `npm run lint` | ESLint with zero warnings. |
| `npm run build` | Local Web build, never deployment authorization. |
| `npm run test:db` | Historical schema/creation/track suites with synthetic local fixtures. |
| `npm run test:creation` | Playwright creation integration suite. |
| `npm run test:e2e` | Playwright end-to-end suite. |

## Skills

Shared skills live in `.agents/skills/`: backend-preflight, web-checks, mobile-checks, task-report and phone-session. Load only applicable references. For an authorized Mobile task needing phone inspection, follow [phone-session](.agents/skills/phone-session/SKILL.md) once per conversation, repeating after adb/Metro failure or ownership change. Check skills define safe targets and command-specific limitations.

## Final report

Give concise implementation/exact-file, actual-check/result/skip, QA and independent-review findings, verified GitHub-link, blocker/limitation and pending-approval information. Distinguish local/unpublished code and reports from publication and pending verification. Use [task-report](.agents/skills/task-report/SKILL.md) for the appropriate concise/checkpoint format and [workflow reporting](docs/multi-agent-workflow.md#agent-activity-reporting) for authorized durable records.
