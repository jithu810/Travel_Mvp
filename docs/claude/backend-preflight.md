# Backend preflight (read-only)

Used by the workspace `travel-backend-preflight` skill. The caller supplies the feature scope.

First apply the backend-impact gate in [CLAUDE.md](../../CLAUDE.md). For UI-only work with unchanged
data/auth/persistence/API/Storage contracts, record inspected paths and rationale briefly and stop:
no live checks, no backend-dev. Documentation-only workflow maintenance also needs no preflight.
For backend-impacting or uncertain work, run the full preflight below. It is read-only, never
authorizes live changes, and affected feature coding stays paused until it is complete.

## Who does what
- **Lead (Architect)** confirms the Supabase project with the user and collects live state with the
  claude.ai Supabase connector (`mcp__claude_ai_Supabase__*`). Specialists don't use those tools.
- **`backend-dev`** gets the repo baseline, the relevant migrations/code and the Lead's live evidence,
  and returns the assessment, decision and test plan to the Lead.
- If the connector is unavailable the preflight is **blocked**. Never fall back to the Supabase CLI,
  psql or scripts against the hosted project.

## Rules
- Never read `.env` / `.env.*`; don't run scripts that load them (e.g. mobile `npm run check:supabase`).
- Read-only calls only: `list_projects`, `get_project`, `list_tables`, `list_migrations`,
  `list_extensions`, `get_advisors`, and `execute_sql` for catalog queries (each `execute_sql` call
  asks the user — that is expected).
- `execute_sql`: one `SELECT` per call. No `SET`, `DO`, DDL/DML, multi-statement batches or functions
  with side effects. Metadata only — never return user rows. Redact credentials found in function
  definitions.
- Never call `apply_migration`; never run seeds, backfills, Storage or RLS changes.
- Project not yet confirmed with the user in this session → list projects and ask. Unknown target =
  **blocked**, not "no change".

## Steps
1. **Baseline** (Lead): for each affected repo (this one, and `../travel-mvp-mobile` if relevant)
   record `git rev-parse HEAD` and `git status --short --branch`.
2. **Live state** (Lead, read-only):
   - `list_migrations`, to compare with `supabase/migrations/*.sql`.
   - `list_tables` for the relevant schemas.
   - Catalog queries for the objects the feature touches: columns/constraints
     (`information_schema.columns`, `pg_constraint`), indexes (`pg_indexes`), functions/RPCs
     (`pg_proc` + `pg_get_functiondef`), RLS (`pg_policies`, `pg_class.relrowsecurity`), grants
     (`information_schema.role_table_grants`, `information_schema.routine_privileges`), Storage
     (`storage.buckets`, `pg_policies` where `schemaname = 'storage'`), roles/ownership.
3. **Assign `backend-dev`** with the scope, baseline and live evidence. It must:
   - List `supabase/migrations/*.sql` in this repo, including untracked files, and read those relevant
     to the feature. For mobile features, find the tables, RPCs and Storage buckets the mobile code
     uses (`../travel-mvp-mobile/src/lib`).
   - Compare repo intent with live definitions (not migration history alone), including unapplied or
     live-only migrations.
   - Assess database, RPC/API, RLS, permissions and Storage needs.
   - Decide: changes required | no backend change | blocked. If it needs more live evidence, it asks
     the Lead and does not collect it.
   - If changes are required: a safe test plan for an isolated local/disposable database (never the
     hosted project) — verify isolation first; migration order and compatibility; synthetic fixtures;
     authorization cases (anonymous, owner, other user, privileged); RPC/API and Storage checks;
     regressions; expected results; cleanup, rollback and recovery.
4. **Record** (Lead): fill in the checkpoint and set the gate. Keep it in the local task record (or the
   PR/issue only when publishing is approved).

## Output

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
Lead gate: paused | released (report and test-plan reference):
Live Supabase changes: not authorized | explicit user approval for action + target (reference):
```

Keep repo intent and observed live state clearly separate; disclose any incomplete comparison.
