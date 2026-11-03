# Journey App supervised multi-agent workflow

## Scope and session startup

AGENTS.md is the shared policy source for roles, repositories, approvals, preservation, secrets, backend gates, task tiers, commands, skills and final reports. Apply its startup pointer and Roles and delegation section.

## Proportional verification and agent budget

See [AGENTS.md: Task tiers and checks](../AGENTS.md#task-tiers-and-checks) for tier examples, verification requirements, proportional records and check/context budgets.

## Delegation procedure

Use named roles when the active interface supports them. If it accepts only a task/message, include the corresponding role instructions in the brief. If delegation is unavailable, disclose the limitation before assigning work. Do not create separate sidebar chats as a substitute without the user's request. Apply AGENTS.md: Roles and delegation for authorization and concurrency.

## Ownership

Use each role's instructions for its default scope, narrowed by every assignment. API handlers under src/app belong to Backend when assigned, not automatically Web. Apply AGENTS.md: Preserving work for shared-file ownership and conflicts, and Repositories for Mobile authorization, access and target instructions.

## Task handoff

Apply AGENTS.md: Preserving work to the recorded baseline and worktree selection.

If Git reports dubious repository ownership in the sandbox, use a command-scoped exception for read-only inspection, for example `git -c safe.directory=D:/Travel_Mvp status --short --branch` or `git -c safe.directory=D:/Travel_Mvp rev-parse HEAD`. This trusts the explicitly named repository for that invocation only. Do not change global Git settings or use a wildcard trust exception. This workaround does not authorize Git writes or other gated actions.

Architect supplies each specialist:

1. Objective and acceptance criteria.
2. Repository, branch/baseline and existing changes to preserve.
3. Exclusive writable paths, read scope, dependencies and interfaces.
4. Checks to run, output-directory ownership and prohibited actions.
5. Required result: summary, exact changed files, check results, limitations, open decisions and requested approvals.

Apply AGENTS.md: Preserving work and the generated Next.js instructions to the assigned paths. Architect resolves interface changes and conflicts.

When the selected tier requires QA or independent review, QA verifies acceptance criteria and regressions; Code Reviewer independently inspects a stable diff/snapshot including relevant untracked files. Separate pre-existing work from task changes. Review findings return to the Architect, who assigns fixes and obtains targeted re-verification before presenting results.

## Backend-impact assessment and conditional live preflight

Apply AGENTS.md: Backend-impact gate in either repository. The shared [backend-preflight skill](../.agents/skills/backend-preflight/SKILL.md) contains the detailed connector procedure, migration/schema comparison, isolated test plan, assessment checkpoint and release record. Its division of responsibilities keeps live collection with Architect and evidence assessment with Backend Developer.

## Android and Mapbox QA

Capture device/model, Android version, native app/build or browser version, permissions, network/GPS state, reproduction route, expected/actual behavior and timestamps. Associate screenshots and recordings with reproduction steps and redact credentials and personal location data where needed. Investigate rendering, location accuracy, heading, navigation progress, rerouting, arrival, background/foreground transitions and connectivity as relevant. Distinguish mobile-browser tests from native Expo tests. Record severity, reproducibility, fix verification and regression results. Apply AGENTS.md: Task tiers and checks to device-verification claims.

## Product-owner approvals

Apply AGENTS.md: Approvals; carry the exact authorized action/target scope into handoffs and records.

### Vercel deployment budget

The Web repository is connected to the Vercel project `travel-mvp` through the GitHub integration on the Hobby plan. Deployment approval effects are defined in AGENTS.md: Approvals. Each Git-triggered deployment uses a build and counts toward the plan's daily deployment limit (see https://vercel.com/docs/limits), and Hobby allows one concurrent build.

Use AGENTS.md: Approvals for publication and deployment authorization.

- When asking for merge approval, explicitly state that it will deploy to production.
- Recommend or request a merge only when production deployment is needed; include related documentation-only work in the authorized batch.
- Apply AGENTS.md's one-push policy at task completion; avoid intermediate PR pushes.
- Use local checks (`npm run typecheck`, `npm run lint`, `npm run build`) for verification instead of pushing to trigger a Vercel build. If a local build needs missing environment variables, report it rather than pushing to work around it.
- If a deployment limit is reached, report it as a blocker; do not work around it with CLI deployments or project-setting changes without explicit approval.

Project-setting examples covered by AGENTS.md's approval gate include ignored build steps and disabling Git deployments.

## Configuration validation

Use the tool-specific notes identified in AGENTS.md for configuration validation and session startup. Report checks actually completed and any unavailable interfaces. Do not infer effective settings from file contents alone.

## Agent activity reporting

GitHub Issues and PRs are the durable development record for published work in `jithu810/Travel_Mvp` and `jithu810/Travel_Mvp_Mobile`. Use the repository issue and PR Markdown templates for future authorized reporting. Apply AGENTS.md: Approvals to PR publication. This workflow alone does not authorize creating issues, posting standalone comments or updating Notion; those actions require an authorized reporting scope. The Architect publishes only within an explicitly authorized reporting scope and confirms the resulting URL and timestamp before claiming publication. Never infer GitHub or Notion visibility from a local agent message or file edit.

### Ownership and checkpoints

Architect owns reporting and coordination. Each assignment names one responsible role: Architect, Web Developer, Mobile Developer, Backend Developer, QA Tester or Code Reviewer. GitHub assignees identify real accounts; role ownership belongs in the record body. Use AGENTS.md: Repositories and Preserving work for branch conventions and ownership. The checkpoint records exclusive paths, acceptance criteria, repository, branch, starting revision/dirty baseline, dependencies and next handoff owner.

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

For local snapshots, identify the base revision plus changed/untracked paths and a reproducible snapshot identifier (for example, content hashes); a branch name alone does not identify tested contents. QA evidence and reviewer findings must identify the actual snapshot inspected. Apply AGENTS.md: Task tiers and checks and Secrets to re-verification and device/evidence limitations.

### Cross-repository records and completion

When a feature spans repositories, use one canonical issue per affected repository and link both issues and their repository-specific PRs using full URLs. Name the integration dependency and handoff owner in each record; avoid ambiguous bare issue numbers across repositories. Feature-level context can link these records from the existing Feature Backlog page. A PR may close its own repository issue after its acceptance criteria are met; do not automatically close the other repository's work. Do not create records for an untouched repository merely to mirror activity.

Completed assignment describes the bounded task only. Record commit, push, merge, deployment and production verification separately, with evidence for each. A GitHub-published report may describe local/unpublished code; distinguish report visibility from code visibility. A local artifact path is not a remotely accessible evidence link. Report missing or stale evidence explicitly rather than assuming success.

At completion, follow AGENTS.md: Final report and the shared task-report skill.

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

Record the product-owner authorization reference and scope; apply AGENTS.md: Approvals. Preparing records or evidence grants no additional authorization.
