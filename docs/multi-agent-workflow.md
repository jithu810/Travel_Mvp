# Journey App supervised multi-agent workflow

## Scope and session startup

Web: `D:/Travel_Mvp`. Mobile: `D:/Travel_Mvp_Mobile`.
This setup changes only Web repository instructions and Codex configuration. It does not authorize Mobile changes, application development, package installation or database execution.

Start a fresh Codex chat rooted at the Web repository after configuration changes. Existing chats must not assume their already-loaded instructions, role inventory or limits have refreshed. The primary session is Architect through AGENTS.md; the architect role file is reusable guidance, not a second orchestrator. Configuration loading does not start work. Wait for the user's next task.

Before assigning work in a fresh chat, confirm that the Web repository is trusted so its project-local configuration can load. Inspect effective configuration and any managed or session overrides, including agent availability, the specialist concurrency limit, sandbox access and approval review. Confirm that `web_developer`, `mobile_developer`, `backend_developer`, `qa_tester` and `code_reviewer` are available through the active delegation interface. If named roles are unavailable, use the role-instruction fallback below; if delegation tools are unavailable, report the limitation before assigning work. Report any startup checks that cannot be completed rather than claiming configuration is verified. These checks do not authorize development or a delegation smoke test.

## Proportional verification and agent budget

This policy applies to Codex and Claude in both repositories. Classify by behavior and blast radius, not line count. State the tier and planned checks briefly before editing; upgrade it when scope or evidence changes. Explicit user requests for broader testing/review still apply.

| Tier | Examples | Execution and verification |
| --- | --- | --- |
| Small | Button colour, spacing, copy, isolated cosmetic styles, ordinary documentation | Architect may implement directly. No specialist, separate QA or independent reviewer by default. Inspect the diff and affected usage; check visual appearance/contrast when relevant and available. No full suite, build, typecheck or lint by default. |
| Focused | Local interaction fix, isolated component or domain logic with understood callers | Architect may implement directly or assign one bounded implementer when useful. Run affected behavioral tests; typecheck for changed TypeScript contracts and scoped lint where useful. Independent review is required for meaningful regression risk, otherwise Architect self-review suffices. Separate QA is optional when focused checks establish the behavior. |
| Major or sensitive | New multi-step feature, broad/shared refactor, auth/session/authorization, data writes, API/RPC/schema/RLS/Storage changes, native dependencies, GPS/lifecycle/navigation behavior | Architect coordinates appropriate specialist implementation, QA and independent Code Reviewer. Run relevant integration/regression suites, typecheck and lint, and build/native checks where affected. Run the full applicable repository suite for broad impact or uncertain coverage; do not run unrelated repository suites automatically. |

Backend-impacting or uncertain changes retain the conditional live-preflight gate below regardless of patch size. Cosmetic changes to a navigation button do not by themselves change navigation behavior. Policy/configuration changes affecting security, authorization or broad runtime behavior cannot use the small tier merely because they are documentation or few lines.

For small tasks, one short local note or final report is enough for tier, baseline, inspected paths, backend-impact rationale and checks; do not create QA reports, status/roadmap entries or the full checkpoint template solely for a cosmetic edit. For this workflow-maintenance policy change, inspect instruction consistency and parse configuration instead of running application suites. No live schema check is needed.

Use the smallest sufficient verification set. Reuse passing results for an unchanged snapshot; rerun affected checks after fixes, and broaden only for failures, newly discovered risk, shared dependencies or explicit user requests. Do not add tests that mirror static styling or implementation. Report checks actually run and skipped with a short reason; skipped independent review is not a claim of independent approval. A tool limitation is disclosed and is not permission to fabricate QA/review.

Keep delegation bounded: no agents for simple lookups or cosmetic tasks. When delegation is justified, pass a compact task brief, relevant paths/diff, constraints, baseline and existing test evidence; use fresh context rather than full conversation inheritance when supported. Load only applicable role/skill references, inspect focused file ranges, avoid repeated broad scans and duplicate test runs, and reuse a specialist for related follow-ups. Reviewers inspect the assigned diff and directly affected contracts, widening only for a concrete risk. Return concise findings and evidence; never enforce a token cap that would hide a correctness or security issue. Do not change models, permissions or external integrations to reduce tokens without authorization.

## Native delegation and concurrency

Use native Codex subagent spawn, messaging, follow-up, status, wait and interruption tools. The Architect sends bounded tasks and receives results directly; the user does not forward prompts. Use named custom roles when supported by the active tool interface. If the interface only accepts a task/message, include the corresponding role file's instructions in that task. Do not create separate sidebar chats as a substitute for subagents without the user's request.

Project `.codex/config.toml` sets `agents.enabled = true` and `agents.max_concurrent_threads_per_session = 2`. This setting excludes the primary thread: one Architect plus at most two specialist threads. Open or paused specialists may occupy a slot. Retire completed specialists using the available lifecycle controls before replacing them; if unavailable, reuse existing specialists or work sequentially. Never bypass the limit with separate sessions. Only the Architect delegates. Specialists must not spawn children or delegate through any alternative tool. This prohibition is a workflow instruction, not a separate permission sandbox.

Standalone `.codex/agents/*.toml` files define name, description and developer_instructions. Models inherit the current session settings. No legacy multi-agent feature flag is needed. The reusable Architect file does not automatically select the parent role; AGENTS.md assigns that responsibility explicitly.

## Ownership

| Role | Default scope, always narrowed by the task |
| --- | --- |
| Architect | Planning, ownership, integration, workflow/configuration documentation; direct implementation for small/focused tasks |
| Web Developer | Assigned frontend routes/components and frontend helpers |
| Mobile Developer | Assigned React Native, Expo and Mapbox files in the separate Mobile repository after authorization and access checks |
| Backend Developer | Assigned SQL, backend scripts, API handlers, auth/server helpers and contracts |
| QA Tester | Assigned tests, fixtures, evidence and QA documentation; no application edits by default |
| Code Reviewer | Independent inspection and findings; no file edits by default |

API handlers under src/app belong to Backend when assigned, not automatically Web. Shared types, src/lib helpers, manifests, lockfiles, root configuration and cross-cutting documentation need one named owner. Ownership is coordination, not an ACL. Never write outside the task's paths. Report a required cross-scope change to Architect and wait for reassignment. Do not modify Mobile during this configuration step; future tasks must read its own instructions and verify filesystem access first.

Project `.codex/config.toml` includes `D:/Travel_Mvp_Mobile` in `sandbox_workspace_write.writable_roots`. This requests filesystem write access when honored by the effective session policy; it does not authorize a Mobile task. Before Mobile work, obtain task authorization, verify effective access and read the Mobile repository's own instructions.

## Task handoff

Before work, inspect branch/status and record tracked and untracked baseline changes. Protect backend/integrity-hardening and its existing scripts, tests, audit and migrations. No automatic stash, reset, checkout, clean, overwrite, or staging of unrelated work. A new worktree does not include dirty files automatically; agree the intended baseline before isolating future work.

If Git reports dubious repository ownership in the sandbox, use a command-scoped exception for read-only inspection, for example `git -c safe.directory=D:/Travel_Mvp status --short --branch` or `git -c safe.directory=D:/Travel_Mvp rev-parse HEAD`. This trusts the explicitly named repository for that invocation only. Do not change global Git settings or use a wildcard trust exception. This workaround does not authorize Git writes or other gated actions.

Architect supplies each specialist:

1. Objective and acceptance criteria.
2. Repository, branch/baseline and existing changes to preserve.
3. Exclusive writable paths, read scope, dependencies and interfaces.
4. Checks to run, output-directory ownership and prohibited actions.
5. Required result: summary, exact changed files, check results, limitations, open decisions and requested approvals.

Start conservatively with one writer in the dirty Web checkout. Two writers may run only on disjoint assigned paths. Serialize overlap, builds and tests sharing generated output; a reader/reviewer must not review files being changed. The Architect resolves conflicts and coordinates interface changes. Specialists report scope expansion before editing. Existing generated Next.js instructions must remain intact, and relevant node_modules/next/dist/docs guides must be read before Next.js code changes.

When the selected tier requires QA or independent review, QA verifies acceptance criteria and regressions; Code Reviewer independently inspects a stable diff/snapshot including relevant untracked files. Separate pre-existing work from task changes. Review findings return to the Architect, who assigns fixes and obtains targeted re-verification before presenting results.

## Backend-impact assessment and conditional live preflight

This is the shared backend-preflight policy for both Web (`D:/Travel_Mvp`) and Mobile (`D:/Travel_Mvp_Mobile`). Each repository's AGENTS.md points to this policy; the reusable Architect and Backend Developer instructions must remain consistent with it.

Before feature implementation, Architect inspects the relevant repository paths and records whether the task affects backend behavior. UI-only layout, styling, navigation and local animation changes may proceed without a live Supabase check or Backend Developer assignment when existing data contracts, authentication/authorization, persistence, RPC/API behavior and Storage access remain unchanged. Record the scope, baseline, inspected paths, no-backend-impact rationale and local verification plan in the task record. A UI-only classification does not claim live-schema verification, and unavailable Supabase access does not block it. Configuration/documentation-only workflow maintenance also needs no live schema check.

If the task changes database schema, migrations, RPC/API contracts or behavior, query/write semantics, authentication/session/authorization, RLS/grants, Storage access/uploads or persistence behavior, or if impact is uncertain, Architect assigns Backend Developer the full bounded, read-only preflight below. Keep affected feature implementation paused until it completes. Requirements clarification and read-only investigation may continue. Reclassify and pause affected work if a UI-only task expands into these areas.

For the full live-schema preflight, Backend Developer must:

1. Assess database tables, columns, constraints, indexes, RPC/functions, API contracts, RLS, grants/roles/ownership permissions, and Storage buckets, policies and access patterns required by the feature.
2. Compare repository migrations (including pending/untracked migrations and relevant existing backend work) with the current schema of the confirmed target Supabase project. Use read-only metadata/catalog queries or schema inspection and read-only migration-history checks. Record project/environment, timestamp, repository revision and dirty baseline, inspected migrations and schema objects, evidence, drift and unapplied migrations. A migration file or migration-history entry alone does not prove the current object definition. Do not expose credentials or user data.
3. Report the required change and dependencies, or explicitly state why no backend change is needed with evidence covering all assessed areas. Distinguish repository intent from observed live state and disclose any incomplete comparison.
4. For required changes, provide a safe test plan before feature coding starts: isolated local/disposable database target, migration order and compatibility, representative synthetic fixtures, positive/negative authorization cases (anonymous, owner, other user and privileged roles as applicable), RPC/API and Storage checks, regressions, expected results, cleanup and rollback/recovery considerations. Verify the test target is isolated before any writes; never use live writes as preflight verification.

Architect records the UI-only assessment or completed full preflight report and test plan in the local task record, or the canonical issue when reporting publication is authorized, before releasing the implementation gate. Tasks requiring the full preflight remain paused until its review and safe test plan are complete. A full-preflight no-change result releases implementation only after its evidence-backed rationale is recorded. Missing credentials, unavailable tools, unknown target or incomplete current-schema evidence block tasks requiring the full preflight; report the missing evidence and next owner instead of assuming no change. Re-run affected preflight checks when scope, migration baseline or target schema changes materially.

Preflight completion authorizes only the already-requested local implementation and isolated testing. Never apply changes to any live Supabase project without explicit product-owner approval identifying the action and target, including migrations, DDL, RPC replacements, RLS/grants, Storage configuration/policies, seeds and data writes. Read-only inspection, a completed test plan, GitHub publication approval and specialist messages do not authorize live changes.

Record this checkpoint (locally when publication is not authorized):

```text
Assessment owner / timestamp / feature scope:
Assessment path: UI-only repository assessment | full live-schema preflight
Repository revision + dirty baseline / migration files inspected:
Confirmed Supabase project + environment / schema inspection timestamp:
Read-only checks actually run / evidence / migration-to-schema drift:
Database / RPC/API / RLS / permissions / Storage impact:
Decision: UI-only, live check not required | changes required | no backend change verified live | blocked
Required changes + dependencies OR evidence-backed no-change rationale:
Safe isolated test target / cases / expected results / recovery plan:
Missing evidence / blockers / next owner:
Architect gate: paused | released (report and test-plan reference):
Live Supabase changes: not authorized | explicit human action + target approval reference:
```

## Android and Mapbox QA

Capture device/model, Android version, native app/build or browser version, permissions, network/GPS state, reproduction route, expected/actual behavior and timestamps. Associate screenshots and recordings with reproduction steps and redact credentials and personal location data where needed. Investigate rendering, location accuracy, heading, navigation progress, rerouting, arrival, background/foreground transitions and connectivity as relevant. Distinguish mobile-browser tests from native Expo tests. Record severity, reproducibility, fix verification and regression results. Mark physical-device verification pending when no device is available; do not present mocked tests or media review as completed device testing.

## Product-owner approvals

The user is the sole human developer and product owner. Architect selects the proportional tier above and coordinates only the specialists, implementation, QA and independent review required by that tier.

A task request explicitly including "push to GitHub" or "publish to GitHub" authorizes the related commits, branch pushes and PR creation or updates as one operation. Do not request separate approval for each of those steps within the authorized task and repository scope. Carry the product-owner authorization into specialist handoffs; role files that describe separate per-step approval do not require the user to repeat this authorization.

If the user only requests a "fix" or "implement", complete development and tier-appropriate verification/review, then keep changes local until publication is authorized. Preserve unrelated changes and use safe branches or isolated worktrees when necessary.

Always obtain separate explicit approval identifying the action and target before force-pushing, merging into main, deploying, changing production databases or performing destructive Git operations. Retain the existing approval requirement for other merges and destructive commands. GitHub publication authorization does not cover these actions or hosted seeds, migrations or production writes used as verification. Automatic approval review and specialist messages are not product-owner authorization. Higher-priority security and sandbox restrictions continue to apply.

### Vercel deployment budget

The Web repository is connected to the Vercel project `travel-mvp` through the GitHub integration on the Hobby plan. Merging into main creates a production deployment (direct pushes to main remain prohibited); pushing any other branch creates a preview deployment. Each deployment uses a build and counts toward the plan's daily deployment limit (see https://vercel.com/docs/limits), and Hobby allows one concurrent build.

Preview deployments triggered automatically by an authorized branch push or PR update are covered by the publication authorization. Production deployments (merging into main), CLI/manual deployments, promotions, rollbacks and redeploys still require separate explicit approval.

- Treat a merge into main as a production deployment. When asking for merge approval, state that it will deploy to production.
- Recommend or request a merge only when a production deployment is needed. Batch related changes within the authorized scope, including documentation-only work, into one PR instead of merging many small ones.
- When publication is authorized, run local checks first and push once at the end of the task rather than after each commit; avoid extra pushes to a PR branch.
- Use local checks (`npm run typecheck`, `npm run lint`, `npm run build`) for verification instead of pushing to trigger a Vercel build. If a local build needs missing environment variables, report it rather than pushing to work around it.
- If a deployment limit is reached, report it as a blocker; do not work around it with CLI deployments or project-setting changes without explicit approval.

Changing Vercel project settings (for example an ignored build step or disabling Git deployments) is a deployment configuration change and requires separate explicit approval.

Project settings request on-request approvals, human approval review and workspace-write sandboxing. These do not automatically prompt for every gated action already permitted within a sandbox; the instructions above remain mandatory. Subagents inherit parent permissions; custom role files do not create separate read-only sandboxes. Managed policy or session overrides may supersede project settings. Inspect effective settings at startup, disclose conflicts, and continue to enforce the product-owner approval boundaries above in conversation. Do not use bypass flags or change global settings to evade gates.

## Configuration validation and references

Validate TOML with Python 3.11 tomllib and use the installed Codex strict configuration loader plus config/read to inspect effective settings and discovered custom agents, without starting a model turn or spawning agents. A fresh session is recommended to load configuration; delegation execution must be tested only when the user authorizes it.

Official documentation: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Installed CLI at setup: 0.163.0-alpha.10.2. The concurrency reference states that the primary thread is excluded.


## Agent activity reporting

GitHub Issues and PRs are the durable development record for published work in `jithu810/Travel_Mvp` and `jithu810/Travel_Mvp_Mobile`. Use the repository issue and PR Markdown templates for future authorized reporting. A task request explicitly including "push to GitHub" or "publish to GitHub" authorizes related PR creation or updates under the product-owner approval policy above. This workflow alone does not authorize creating issues, posting standalone comments or updating Notion; those actions require an authorized reporting scope. The Architect publishes only within an explicitly authorized reporting scope and confirms the resulting URL and timestamp before claiming publication. Never infer GitHub or Notion visibility from a local agent message or file edit.

### Ownership and checkpoints

Architect owns reporting and coordination. Each assignment names one responsible role: Architect, Web Developer, Mobile Developer, Backend Developer, QA Tester or Code Reviewer. GitHub assignees identify real accounts; role ownership belongs in the record body. Name exclusive writable paths, acceptance criteria, repository, branch, starting revision and dirty baseline, dependencies and next handoff owner. Preserve existing branches and uncommitted work. For a future authorized new branch, use `codex/<issue>-slug`; do not rename or switch the current branch merely to match the convention.

Record meaningful checkpoints at assignment, handoff, blocker or material scope/status change, QA/review completion and closure. Specialists report to Architect; do not publish each internal message. At each checkpoint update the canonical issue and add a concise comment only when the milestone merits history. Link the PR when available rather than duplicating the full narrative across records.

Use this compact checkpoint in the canonical record:

```text
Timestamp (with timezone):
Architect coordinator / responsible role / next owner:
Task status: planned | in progress | blocked | awaiting QA | awaiting review | awaiting approval | completed assignment
Repository / branch / baseline or current revision:
Scope / acceptance criteria progress:
Canonical issue / related issue and PR full URLs:
QA owner / tested revision or local snapshot identifier + paths + timestamp:
Checks actually run / environment / results / evidence links / untested limitations:
Independent Code Reviewer / reviewed revision or snapshot / findings + severity + disposition:
Blockers / next action / owner:
Human approvals: exact action + target / pending or granted / human approval reference:
Code publication: local/unpublished | pushed + confirmed branch URL and revision
Report publication: local/unpublished | GitHub-published + confirmed URL and timestamp
```

For local snapshots, identify the base revision plus changed/untracked paths and a reproducible snapshot identifier (for example, content hashes); a branch name alone does not identify tested contents. QA evidence and reviewer findings must identify the actual snapshot inspected. Re-verify affected checks after fixes. Physical-device verification pending remains explicit; browser, mock and export checks do not prove native-device behavior. Keep secrets and private data out of published evidence.

### Cross-repository records and completion

When a feature spans repositories, use one canonical issue per affected repository and link both issues and their repository-specific PRs using full URLs. Name the integration dependency and handoff owner in each record; avoid ambiguous bare issue numbers across repositories. Feature-level context can link these records from the existing Feature Backlog page. A PR may close its own repository issue after its acceptance criteria are met; do not automatically close the other repository's work. Do not create records for an untouched repository merely to mirror activity.

Completed assignment describes the bounded task only. Record commit, push, merge, deployment and production verification separately, with evidence for each. A GitHub-published report may describe local/unpublished code; distinguish report visibility from code visibility. A local artifact path is not a remotely accessible evidence link. Report missing or stale evidence explicitly rather than assuming success.

At task completion, give the product owner a concise summary of implementation, tests actually run and their results, independent review findings, GitHub links and remaining blockers. Clearly distinguish local work from published code and report any verification that remains pending.

### Existing Notion reporting surfaces

Reuse existing schemas and databases; add no databases or automation infrastructure:

| Existing database | Reporting use |
| --- | --- |
| AI Agent Activity | Keep the existing six role rows as current-assignment summaries. Use existing fields and page bodies for branch, issue/PR URLs, QA evidence, reviewer findings, blockers, approvals and publication state. |
| Feature Backlog | Keep one feature record linking canonical issues and PRs; use existing ownership/status fields and page body for cross-repository dependencies. |
| GitHub Activity | Record only confirmed published GitHub events. Deduplicate using the existing Event ID; check for an existing event before adding one. Local work is not a GitHub event. |
| Daily Briefings | Reuse one briefing per date in Asia/Kolkata; update that dated entry on a rerun instead of duplicating it. Summarize verified records, blockers, stale reports, pending QA/review and approvals. |

The existing 9 AM Asia/Kolkata ChatGPT briefing remains the daily reporting mechanism. Its six-agent instructions and scheduler are unchanged. Notion reflects explicitly published, timestamped reports; it cannot automatically observe local specialists. Until a report has actually been published, keep it local/unpublished. Do not claim synchronization or scheduler execution without evidence. Updating Notion requires authorized reporting scope; these instructions grant no publication authorization.

### Approval boundary

Record the product-owner authorization reference and scope. A task request explicitly including "push to GitHub" or "publish to GitHub" covers related commits, branch pushes and PR creation or updates together; no separate per-step approval is required. A request only to fix or implement leaves publication pending. Force-pushes, merges into main, deployments, production database changes and destructive Git operations always require separate explicit approval for the action and target; other merges and destructive commands retain their existing approval requirement. Preparing templates, checkpoints, evidence or migrations grants no additional authorization. Stop with reviewable local changes when required authorization is absent, and respect all higher-priority security and sandbox restrictions.
