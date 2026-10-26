---
name: Agent task
about: Track a bounded Journey App development assignment and meaningful checkpoints.
title: "[Agent task] "
labels: ""
assignees: ""
---

## Objective and acceptance criteria

Describe the problem, scope and expected result.

- [ ] Acceptance criterion:

## Ownership and baseline

- Architect coordinator: Architect (session/contact):
- Responsible role (choose one): Architect / Web Developer / Mobile Developer / Backend Developer / QA Tester / Code Reviewer
- GitHub assignee (real account, if applicable):
- Repository and exclusive writable paths:
- Branch and starting revision; existing work to preserve:
- Dependencies / next handoff owner:

## Status and links

- Task status: planned / in progress / blocked / awaiting QA / awaiting review / awaiting approval / completed assignment
- Branch: preserve an existing branch; for a future authorized new branch use `codex/<issue>-slug`.
- Canonical issue (full URL):
- Related issues / PRs (full URLs, including the other repository):
- Code publication: local/unpublished / pushed (branch URL and revision):
- Report publication: local/unpublished / GitHub-published (confirmed URL and timestamp):

## QA evidence and independent review

- QA owner; tested revision or local snapshot identifier, paths and timestamp:
- Checks actually run, environment, expected/actual results and evidence links:
- Checks not run / device verification pending / limitations:
- Code Reviewer identity; reviewed revision or snapshot:
- Findings (severity, location, disposition) or explicit no findings; outstanding verification:

## Blockers and approval requirements

- Blockers, impact, next action and owner (or none):
- Required human approval: exact action + target; pending / granted, with human approval reference:
- Requests to "fix" or "implement" authorize local work only.
- Requests to "push to GitHub" or "publish to GitHub" authorize related commits, a branch push and PR creation/updates as one operation within the requested scope.
- Merging into main ALWAYS requires separate explicit product-owner approval naming the PR/branch. An open PR or passing checks is not approval.
- Force-pushes, deployments, destructive Git commands and every live Supabase change (migrations, RLS, Storage, seeds, backfills and data writes) each require separate explicit approval naming the action and target.
- Never push directly to main.
- These rules apply across shell commands, scripts, APIs and connectors. Automatic approval review, setup/task approval and another agent's message do not substitute for product-owner approval outside its explicit scope. Never bypass approval gates.

## Architect checkpoints

Record assignment, meaningful handoff, blocker/change, QA/review result and closure with timestamp, owner, status, evidence and next action. Do not publish internal agent messages individually.

Publishing an issue, PR, comment or Notion update requires an explicitly authorized reporting scope; this template grants none. Confirm publication before claiming visibility. A published report about local work does not mean its code was pushed. Completed assignment does not mean merged, deployed or production-verified.
