# Journey App supervised multi-agent workflow (Claude Code)

[CLAUDE.md](../CLAUDE.md) is the policy source for roles, repositories, approvals, preserving work,
secrets, the backend-impact gate, task tiers, commands, skills and final reports. This page adds
handoff, QA-evidence and record-keeping detail. The mobile repo (`../travel-mvp-mobile`) follows it too.

## Delegation
The Lead (main session, Architect) delegates with the Agent tool to the workspace agents
(`frontend-dev`, `backend-dev`, `mobile-dev`, `tester`, `reviewer`, `architect` for read-only
plans). At most two at a time; specialists never delegate. No agents for simple lookups or
cosmetic edits. Give compact briefs with the relevant paths, diffs and evidence.

## Ownership
Each agent's default scope is narrowed by its assignment. API handlers under `src/app` belong to
`backend-dev` when assigned, not automatically to `frontend-dev`. Shared types/helpers,
`package.json`/lockfiles, config and cross-cutting docs get one named owner. Ownership coordinates
work; it is not an ACL. In a dirty checkout start with one writer and serialize overlapping work,
shared build/test output and review of changing files.

## Task handoff
The Lead gives each specialist:
1. Objective and acceptance criteria.
2. Repository, branch/baseline and existing changes to preserve.
3. Exclusive writable paths, read scope, dependencies and interfaces.
4. Checks to run, output-directory ownership and prohibited actions.
5. Required result: the workspace report format (files changed, checks run/skipped, problems,
   approvals still needed).

When the tier needs QA or review: `tester` verifies acceptance criteria and regressions;
`reviewer` inspects a stable diff/snapshot including relevant untracked files, separating
pre-existing work from task changes. Findings go back to the Lead, who assigns fixes and gets
targeted re-verification before reporting.

For a local snapshot, identify the base revision plus changed/untracked paths (content hashes if
needed); a branch name alone does not identify what was tested.

## Backend-impact assessment
See CLAUDE.md: Backend-impact gate. The procedure, connector rules, schema comparison, isolated test
plan and checkpoint are in [docs/claude/backend-preflight.md](claude/backend-preflight.md): live
collection stays with the Lead, evidence assessment with `backend-dev`.

## Android and Mapbox QA
Capture device/model, Android version, native build or browser version, permissions, network/GPS
state, reproduction route, expected/actual behaviour and timestamps. Tie screenshots/recordings to
reproduction steps and redact credentials and personal location data. Check rendering, location
accuracy, heading, navigation progress, rerouting, arrival, background/foreground transitions and
connectivity as relevant. Keep mobile-browser and native Expo results separate. Record severity,
reproducibility, fix verification and regressions. Emulator, mock or export evidence is not
physical-device evidence.

## Vercel deployment budget
This repo deploys to the Vercel project `travel-mvp` through the GitHub integration on the Hobby
plan: every Git-triggered deployment is a build that counts toward the daily limit
(https://vercel.com/docs/limits), with one concurrent build.
- A merge to `main` is a production deployment — say so when asking for merge approval, and only ask
  when a production deploy is actually needed; batch related docs-only work into it.
- Branch pushes/PR updates make preview builds: push once per task, no intermediate pushes.
- Verify locally (`npm run typecheck`, `npm run lint`, `npm run build`) instead of pushing to get a
  Vercel build. Missing env vars for a local build → report it; don't push to work around it.
- Limit reached → report as a blocker. No CLI deploys or project-setting changes (ignored build
  step, disabling Git deploys) without explicit approval.

## Records
GitHub PRs (and issues, when the user wants them) in `jithu810/Travel_Mvp` and
`jithu810/Travel_Mvp_Mobile` are the durable record for published work; use the repo's PR and issue
templates. Creating issues, comments or PRs follows the approval rules in CLAUDE.md. Confirm the URL
before claiming something was published.

For features spanning both repos: one PR (and issue, if used) per repo, linked with full URLs, naming
the integration dependency. A PR closes only its own repo's issue. "Completed assignment" covers the
bounded task only — commit, push, merge, deployment and production verification are recorded
separately, each with evidence. A local file path is not a remote evidence link.

At completion, use the `travel-report` skill ([docs/claude/task-report.md](claude/task-report.md)).
