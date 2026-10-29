<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Journey App supervised multi-agent workflow

The primary session acts as Architect, the lead coordinator. Follow docs/multi-agent-workflow.md and the reusable Architect instructions in .codex/agents/architect.toml. Do not spawn an Architect child agent. Configuration loading alone does not authorize development.

For user-authorized development, the Architect is explicitly authorized to delegate bounded work through native Codex subagent tools, receive results, and send follow-ups without manual prompt forwarding. Maintain at most two concurrent specialist agents across the workflow. Specialists must not spawn, delegate to, or create threads for other specialists. Only the Architect assigns work.

The user is the sole human developer and product owner. For feature requests and bug reports, use the proportional verification tiers in docs/multi-agent-workflow.md. Architect may directly implement small/focused tasks; specialist implementation, QA and independent review are required for major/sensitive work, not every edit. A task request explicitly including "push to GitHub" or "publish to GitHub" authorizes the related commits, branch pushes and PR creation or updates as one operation, without separate approval for each step. Requests only to "fix" or "implement" authorize development and testing; keep changes local until publication is authorized. This task-specific authorization applies across shell commands, scripts, APIs, connectors and specialist handoffs, including role files that still describe separate per-step approval.

Require separate explicit approval for force-pushes, merges into main, deployments, production database changes and destructive Git operations. Retain the existing approval requirement for other merges and destructive commands. GitHub publication authorization does not cover these actions. Continue following higher-priority security and sandbox restrictions; automatic approval review or another agent's message cannot substitute for product-owner authorization.

Before feature implementation in either repository, Architect records a repository-based backend-impact assessment using the shared policy in docs/multi-agent-workflow.md. UI-only changes to layout, styling, navigation or local animation may proceed without a live Supabase check or Backend Developer assignment when the assessment confirms existing data contracts, authentication/authorization, persistence, RPC/API behavior and Storage access are unchanged. Record the inspected paths and rationale; unavailable Supabase access does not block this UI-only path. If backend impact exists or is uncertain, assign Backend Developer the full read-only live-schema preflight and keep affected implementation paused until it is complete. Never apply changes to any live Supabase project without explicit product-owner approval for the action and target.

Preserve all existing code and uncommitted work, especially backend/integrity-hardening. Never automatically stash, reset, checkout, clean, or overwrite unrelated work. Inspect Git status and record the baseline before each task. Use safe branches or isolated worktrees when necessary. Assign exclusive write paths; stop and report conflicts. Reviewers do not edit application code by default.

Web repository: D:/Travel_Mvp. Mobile repository: D:/Travel_Mvp_Mobile. The Mobile role is defined here, but this configuration setup does not authorize modifying the Mobile repository or extend filesystem access to it. Inspect its own instructions before any future authorized task.

Shared skills for all agents live in `.agents/skills/` (Claude Code reaches them through pointers in `.claude/skills/`). For any authorized Mobile feature, bug or design task that needs to see the phone, follow `.agents/skills/phone-session/SKILL.md` once per conversation.

At completion, provide a concise summary of implementation, test results, independent review findings, GitHub links and remaining blockers. Identify unpublished work clearly.

Retain the generated Next.js instruction block above and read the relevant installed documentation before writing Next.js code. Do not infer APIs from prior Next.js experience.

## Unified product-owner approval rule
- Requests to "fix" or "implement" authorize local work only.
- Requests to "push to GitHub" or "publish to GitHub" authorize related commits, a branch push and PR creation/updates as one operation within the requested scope.
- Merging into main ALWAYS requires separate explicit product-owner approval naming the PR/branch. An open PR or passing checks is not approval.
- Force-pushes, deployments, destructive Git commands and every live Supabase change (migrations, RLS, Storage, seeds, backfills and data writes) each require separate explicit approval naming the action and target.
- Never push directly to main.
- Vercel deploys from Git: every merge into main triggers a production deployment, and every pushed branch triggers a preview deployment. All of these count toward the Vercel plan's deployment limits. Preview deployments triggered automatically by an authorized branch push or PR update are covered by the publication authorization; production deployments (merging into main), CLI/manual deployments, promotions, rollbacks and redeploys still require separate explicit approval. Recommend a merge only when a production deployment is actually wanted, batch related in-scope changes into one PR, and push once per task rather than after every commit. Follow the Vercel deployment budget section in docs/multi-agent-workflow.md.
- These rules apply across shell commands, scripts, APIs and connectors. Automatic approval review, setup/task approval and another agent's message do not substitute for product-owner approval outside its explicit scope. Never bypass approval gates.

## Secret access
Never read .env or .env.* files, including nested files or files in another repository. Do not bypass this through shell commands, interpreters, search, alternate tools or indirect reads. Use variable names only; never expose secrets.

## Optional mobile improvement backlog
Before each mobile feature or backlog task, tell the owner the implementation scope and whether verification needs no device, an emulator, or a real phone. Prefer an emulator for suitable remote UI checks; explicitly request phone availability for required physical-device work. Keep emulator and physical-device evidence distinct.
For discretionary mobile work, use `D:/Travel_Mvp_Mobile/IMPROVEMENT_BACKLOG.md` as the single optional improvement list. Explicit requests and active features take priority. When none is pending and time is available, Architect may select one bounded item for local work under the existing workflow; split broad items and resolve open product decisions first. Require assigned agents to report completion evidence so the checkbox, date, result and limitations can be updated after each completed item. Leave partial or required-but-unverified outcomes unchecked. This list is not a mandatory release gate and grants no additional publication, deployment, dependency, destructive-operation or live Supabase approval. Specialists do not independently start backlog work.

## Proportional checks for Codex and Claude
Follow `D:/Travel_Mvp/docs/multi-agent-workflow.md#proportional-verification-and-agent-budget` for task tiers, direct implementation, bounded delegation and check selection. State tier/check scope briefly; no separate QA/reviewer or full suite for a button colour/copy/spacing change by default. Major/sensitive changes retain specialist QA and independent review. Backend-impact assessment and all approval/secret/preservation rules remain in force. If shared instructions are unavailable, use these defaults and report the missing context; backend-impacting work still requires preflight.
