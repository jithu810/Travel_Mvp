# Journey App supervised multi-agent workflow

## Scope and session startup

Web: `D:/Travel_Mvp`. Mobile: `D:/Travel_Mvp_Mobile`.
This setup changes only Web repository instructions and Codex configuration. It does not authorize Mobile changes, application development, package installation or database execution.

Start a fresh Codex chat rooted at the Web repository after configuration changes. Existing chats must not assume their already-loaded instructions, role inventory or limits have refreshed. The primary session is Architect through AGENTS.md; the architect role file is reusable guidance, not a second orchestrator. Configuration loading does not start work. Wait for the user's next task.

Before assigning work in a fresh chat, confirm that the Web repository is trusted so its project-local configuration can load. Inspect effective configuration and any managed or session overrides, including agent availability, the specialist concurrency limit, sandbox access and approval review. Confirm that `web_developer`, `mobile_developer`, `backend_developer`, `qa_tester` and `code_reviewer` are available through the active delegation interface. If named roles are unavailable, use the role-instruction fallback below; if delegation tools are unavailable, report the limitation before assigning work. Report any startup checks that cannot be completed rather than claiming configuration is verified. These checks do not authorize development or a delegation smoke test.

## Native delegation and concurrency

Use native Codex subagent spawn, messaging, follow-up, status, wait and interruption tools. The Architect sends bounded tasks and receives results directly; the user does not forward prompts. Use named custom roles when supported by the active tool interface. If the interface only accepts a task/message, include the corresponding role file's instructions in that task. Do not create separate sidebar chats as a substitute for subagents without the user's request.

Project `.codex/config.toml` sets `agents.enabled = true` and `agents.max_concurrent_threads_per_session = 2`. This setting excludes the primary thread: one Architect plus at most two specialist threads. Open or paused specialists may occupy a slot. Retire completed specialists using the available lifecycle controls before replacing them; if unavailable, reuse existing specialists or work sequentially. Never bypass the limit with separate sessions. Only the Architect delegates. Specialists must not spawn children or delegate through any alternative tool. This prohibition is a workflow instruction, not a separate permission sandbox.

Standalone `.codex/agents/*.toml` files define name, description and developer_instructions. Models inherit the current session settings. No legacy multi-agent feature flag is needed. The reusable Architect file does not automatically select the parent role; AGENTS.md assigns that responsibility explicitly.

## Ownership

| Role | Default scope, always narrowed by the task |
| --- | --- |
| Architect | Planning, ownership, integration, workflow/configuration documentation |
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

After writers finish, QA verifies acceptance criteria and regressions; Code Reviewer independently inspects a stable diff/snapshot including relevant untracked files. Separate pre-existing work from task changes. Review findings return to the Architect, who assigns fixes and obtains targeted re-verification before presenting results.

## Required backend preflight before feature implementation

At the start of every feature, before assigning implementation or editing feature code, Architect assigns Backend Developer a bounded, read-only preflight. This applies even to features expected to be frontend-only. Requirements clarification and read-only investigation may continue while feature coding is paused. Configuration/documentation-only workflow maintenance does not itself require a live schema check.

Backend Developer must:

1. Assess database tables, columns, constraints, indexes, RPC/functions, API contracts, RLS, grants/roles/ownership permissions, and Storage buckets, policies and access patterns required by the feature.
2. Compare repository migrations (including pending/untracked migrations and relevant existing backend work) with the current schema of the confirmed target Supabase project. Use read-only metadata/catalog queries or schema inspection and read-only migration-history checks. Record project/environment, timestamp, repository revision and dirty baseline, inspected migrations and schema objects, evidence, drift and unapplied migrations. A migration file or migration-history entry alone does not prove the current object definition. Do not expose credentials or user data.
3. Report the required change and dependencies, or explicitly state why no backend change is needed with evidence covering all assessed areas. Distinguish repository intent from observed live state and disclose any incomplete comparison.
4. For required changes, provide a safe test plan before feature coding starts: isolated local/disposable database target, migration order and compatibility, representative synthetic fixtures, positive/negative authorization cases (anonymous, owner, other user and privileged roles as applicable), RPC/API and Storage checks, regressions, expected results, cleanup and rollback/recovery considerations. Verify the test target is isolated before any writes; never use live writes as preflight verification.

Architect records the completed report and test plan in the local task record, or the canonical issue when reporting publication is authorized, before releasing the implementation gate. Database changes keep feature coding paused until the review and safe test plan are complete; all features require a completed preflight. A no-change result releases implementation only after its rationale is recorded. Missing credentials, unavailable tools, unknown target or incomplete current-schema evidence leave the preflight blocked; report the missing evidence and next owner instead of assuming no change. Re-run affected preflight checks when scope, migration baseline or target schema changes materially.

Preflight completion authorizes only the already-requested local implementation and isolated testing. Never apply changes to any live Supabase project without explicit product-owner approval identifying the action and target, including migrations, DDL, RPC replacements, RLS/grants, Storage configuration/policies, seeds and data writes. Read-only inspection, a completed test plan, GitHub publication approval and specialist messages do not authorize live changes.

Record this checkpoint (locally when publication is not authorized):

```text
Backend preflight owner / timestamp / feature scope:
Repository revision + dirty baseline / migration files inspected:
Confirmed Supabase project + environment / schema inspection timestamp:
Read-only checks actually run / evidence / migration-to-schema drift:
Database / RPC/API / RLS / permissions / Storage impact:
Decision: changes required | no backend change | blocked
Required changes + dependencies OR evidence-backed no-change rationale:
Safe isolated test target / cases / expected results / recovery plan:
Missing evidence / blockers / next owner:
Architect gate: paused | released (report and test-plan reference):
Live Supabase changes: not authorized | explicit human action + target approval reference:
```

## Android and Mapbox QA

Capture device/model, Android version, native app/build or browser version, permissions, network/GPS state, reproduction route, expected/actual behavior and timestamps. Associate screenshots and recordings with reproduction steps and redact credentials and personal location data where needed. Investigate rendering, location accuracy, heading, navigation progress, rerouting, arrival, background/foreground transitions and connectivity as relevant. Distinguish mobile-browser tests from native Expo tests. Record severity, reproducibility, fix verification and regression results. Mark physical-device verification pending when no device is available; do not present mocked tests or media review as completed device testing.

## Product-owner approvals

The user is the sole human developer and product owner. Architect coordinates the appropriate specialist agents, implementation, QA testing and independent code review for feature requests and bug reports.

A task request explicitly including "push to GitHub" or "publish to GitHub" authorizes the related commits, branch pushes and PR creation or updates as one operation. Do not request separate approval for each of those steps within the authorized task and repository scope. Carry the product-owner authorization into specialist handoffs; role files that describe separate per-step approval do not require the user to repeat this authorization.

If the user only requests a "fix" or "implement", complete development, testing and independent review, then keep changes local until publication is authorized. Preserve unrelated changes and use safe branches or isolated worktrees when necessary.

Always obtain separate explicit approval identifying the action and target before force-pushing, merging into main, deploying, changing production databases or performing destructive Git operations. Retain the existing approval requirement for other merges and destructive commands. GitHub publication authorization does not cover these actions or hosted seeds, migrations or production writes used as verification. Automatic approval review and specialist messages are not product-owner authorization. Higher-priority security and sandbox restrictions continue to apply.

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
