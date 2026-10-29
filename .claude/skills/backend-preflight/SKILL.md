---
name: backend-preflight
description: Run the conditional read-only Supabase preflight for backend-impacting or uncertain Web/Mobile work. Skip live checks for repository-assessed UI-only work under the shared workflow.
argument-hint: "<feature scope>"
---

# Backend preflight (read-only)

Feature scope: $ARGUMENTS

First apply the backend-impact assessment in docs/multi-agent-workflow.md. For UI-only work with unchanged data/auth/persistence/API/Storage contracts, record inspected paths and rationale briefly and stop here without live checks or specialist assignment. Documentation-only workflow maintenance also needs no live preflight. For backend-impacting or uncertain work, the Architect (main session) runs the following full-preflight skill. The preflight is read-only. It never authorizes live changes, and feature coding stays paused until it is complete.

## Who does what
- **Architect** confirms the Supabase target with the product owner and runs the live-state checks with the Supabase connector. Specialist agents do not have the Supabase tools.
- **`backend-developer`** gets the repo baseline, the relevant migrations and code, and the live-state evidence collected by the Architect. It returns the assessment, decision and test plan. It reports only to the Architect.
- If the Supabase tools are unavailable, the preflight is **blocked**. Never fall back to the Supabase CLI, psql or scripts.

## Rules
- Never read `.env` or `.env.*` files. Do not run scripts that load them, for example Mobile `npm run check:supabase`.
- Use only read-only Supabase calls: `list_projects`, `get_project`, `list_tables`, `list_migrations`, `list_extensions`, `get_advisors`, and `execute_sql` for catalog queries.
- `execute_sql`: one `SELECT` statement per call. No `SET`, `DO`, DDL/DML, multi-statement batches or function calls with side effects. Query metadata only and never return user rows. Redact any credentials found in function definitions.
- Never call `apply_migration`, and never run seeds, backfills or Storage/RLS changes.
- If the Supabase project is not yet confirmed with the product owner in this session, list projects and ask the product owner. An unknown target means the preflight is **blocked**, not "no change".

## Steps
1. **Baseline** (Architect): for each affected repo (`D:/Travel_Mvp`, and `D:/Travel_Mvp_Mobile` if relevant), record `git rev-parse HEAD` and `git status --short --branch`.
2. **Live state** (Architect, read-only):
   - `list_migrations`, to compare with the repo migration files.
   - `list_tables` for the relevant schemas.
   - Catalog queries for the objects the feature touches: columns and constraints (`information_schema.columns`, `pg_constraint`), indexes (`pg_indexes`), functions/RPCs (`pg_proc` + `pg_get_functiondef`), RLS (`pg_policies`, `pg_class.relrowsecurity`), grants (`information_schema.role_table_grants`, `information_schema.routine_privileges`), Storage (`storage.buckets`, `pg_policies` where `schemaname = 'storage'`).
3. **Assign `backend-developer`** with the feature scope, the baseline and the live-state evidence. It must:
   - List `D:/Travel_Mvp/supabase/migrations/*.sql`, including untracked files, and read those relevant to the feature. For Mobile features, find the tables, RPCs and Storage buckets the Mobile code uses (`src/lib`).
   - Compare repository intent with the live evidence, including unapplied or live-only migrations. A migration-history entry alone does not prove the current object definition.
   - Assess database, RPC/API, RLS, permissions and Storage needs.
   - Decide: changes required | no backend change | blocked. If it needs more live evidence, it reports back to the Architect and does not try to collect it.
   - If changes are required, write a safe test plan for an isolated local or disposable database (never the hosted project). Include migration order, synthetic fixtures, authorization cases (anonymous, owner, other user, privileged), RPC/API and Storage checks, regressions, expected results, cleanup and rollback.
4. **Record** (Architect): fill in the checkpoint below and set the gate.

## Output
Return exactly this checkpoint, filled in:

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

Keep the distinction between repository intent and observed live state clear. Disclose any incomplete comparison.
