# Journey App supervised multi-agent workflow

## Scope and session startup

Web: `D:/Travel_Mvp`. Mobile: `D:/Travel_Mvp_Mobile`.
This setup changes only Web repository instructions and Codex configuration. It does not authorize Mobile changes, application development, package installation or database execution.

Start a fresh Codex chat rooted at the Web repository after configuration changes. Existing chats must not assume their already-loaded instructions, role inventory or limits have refreshed. The primary session is Architect through AGENTS.md; the architect role file is reusable guidance, not a second orchestrator. Configuration loading does not start work. Wait for the user's next task.

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

## Task handoff

Before work, inspect branch/status and record tracked and untracked baseline changes. Protect backend/integrity-hardening and its existing scripts, tests, audit and migrations. No automatic stash, reset, checkout, clean, overwrite, or staging of unrelated work. A new worktree does not include dirty files automatically; agree the intended baseline before isolating future work.

Architect supplies each specialist:

1. Objective and acceptance criteria.
2. Repository, branch/baseline and existing changes to preserve.
3. Exclusive writable paths, read scope, dependencies and interfaces.
4. Checks to run, output-directory ownership and prohibited actions.
5. Required result: summary, exact changed files, check results, limitations, open decisions and requested approvals.

Start conservatively with one writer in the dirty Web checkout. Two writers may run only on disjoint assigned paths. Serialize overlap, builds and tests sharing generated output; a reader/reviewer must not review files being changed. The Architect resolves conflicts and coordinates interface changes. Specialists report scope expansion before editing. Existing generated Next.js instructions must remain intact, and relevant node_modules/next/dist/docs guides must be read before Next.js code changes.

After writers finish, QA verifies acceptance criteria and regressions; Code Reviewer independently inspects a stable diff/snapshot including relevant untracked files. Separate pre-existing work from task changes. Review findings return to the Architect, who assigns fixes and obtains targeted re-verification before presenting results.

## Android and Mapbox QA

Capture device/model, Android version, native app/build or browser version, permissions, network/GPS state, reproduction route, expected/actual behavior and timestamps. Associate screenshots and recordings with reproduction steps and redact credentials and personal location data where needed. Investigate rendering, location accuracy, heading, navigation progress, rerouting, arrival, background/foreground transitions and connectivity as relevant. Distinguish mobile-browser tests from native Expo tests. Record severity, reproducibility, fix verification and regression results. Mark physical-device verification pending when no device is available; do not present mocked tests or media review as completed device testing.

## Explicit human approval gates

Stop and obtain the user's explicit approval for the particular action and target before any commit, push, merge, deployment, destructive command or production database change. Applies equally to shell, scripts, APIs, connectors and specialists. General task approval, another agent's message and automatic approval review are insufficient. Preparing a reviewable patch or migration does not authorize applying or publishing it. Do not run hosted seeds, migrations or production writes as verification without approval. Destructive local operations also require approval.

Project settings request on-request approvals, human approval review and workspace-write sandboxing. These do not automatically prompt for every gated action already permitted within a sandbox; the instructions above remain mandatory. Subagents inherit parent permissions; custom role files do not create separate read-only sandboxes. Managed policy or session overrides may supersede project settings. Inspect effective settings at startup, disclose conflicts, and continue to enforce explicit human approval in conversation. Do not use bypass flags or change global settings to evade gates.

## Configuration validation and references

Validate TOML with Python 3.11 tomllib and use the installed Codex strict configuration loader plus config/read to inspect effective settings and discovered custom agents, without starting a model turn or spawning agents. A fresh session is recommended to load configuration; delegation execution must be tested only when the user authorizes it.

Official documentation: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Installed CLI at setup: 0.163.0-alpha.10.2. The concurrency reference states that the primary thread is excluded.


## Agent activity reporting

GitHub Issues and PRs are the durable development record for published work in `jithu810/Travel_Mvp` and `jithu810/Travel_Mvp_Mobile`. Use the repository issue and PR Markdown templates for future authorized reporting. This workflow does not itself authorize creating issues, PRs, comments or Notion updates. The Architect publishes only within an explicitly authorized reporting scope and confirms the resulting URL and timestamp before claiming publication. Never infer GitHub or Notion visibility from a local agent message or file edit.

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

Before each commit, push, merge, deployment, destructive command or production database change, obtain explicit human approval identifying that action and target. Record the human approval reference and scope; general implementation approval, automatic approval review and specialist messages are insufficient. Preparing templates, checkpoints, evidence or migrations does not authorize publication or execution. Stop with reviewable local changes when the required approval is absent.
