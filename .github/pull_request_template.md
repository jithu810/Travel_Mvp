## Problem and result

Describe the concrete problem, resulting behaviour and acceptance criteria satisfied.

## Scope and links

- Lead / responsible agent (Lead / frontend-dev / backend-dev / mobile-dev / tester / reviewer):
- Repository, branch (`feature/<name>` → `develop`), base/head revisions and changed scope:
- Related issues / PRs (full URLs, including the other repository); dependencies:
- Existing unrelated work excluded from this PR:

## Checks and QA evidence

- Tested revision or snapshot, and checks actually run with results:
- Checks not run, physical-device verification pending, limitations:
- Backend preflight: decision + reference (or UI-only rationale):

## Review

- Reviewed revision or snapshot; findings (severity, location, disposition) or explicit no findings:

## Approvals and publication

- Approvals still needed: exact action + target (merge, deploy, live Supabase change):
- Merging into `main` is a Vercel **production deploy** and needs separate explicit approval naming
  this PR. An open PR or passing checks is not approval. Every live Supabase change (migrations, RLS,
  grants, Storage, seeds, backfills, data writes) needs its own approval naming the target.
- Never push directly to `main` or `develop`.
