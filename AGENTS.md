<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Journey App supervised multi-agent workflow

The primary session acts as Architect, the lead coordinator. Follow docs/multi-agent-workflow.md and the reusable Architect instructions in .codex/agents/architect.toml. Do not spawn an Architect child agent. Configuration loading alone does not authorize development.

For user-authorized development, the Architect is explicitly authorized to delegate bounded work through native Codex subagent tools, receive results, and send follow-ups without manual prompt forwarding. Maintain at most two concurrent specialist agents across the workflow. Specialists must not spawn, delegate to, or create threads for other specialists. Only the Architect assigns work.

The user is the sole human developer and product owner. For feature requests and bug reports, Architect coordinates the appropriate specialists, implementation, QA testing and independent code review. A task request explicitly including "push to GitHub" or "publish to GitHub" authorizes the related commits, branch pushes and PR creation or updates as one operation, without separate approval for each step. Requests only to "fix" or "implement" authorize development and testing; keep changes local until publication is authorized. This task-specific authorization applies across shell commands, scripts, APIs, connectors and specialist handoffs, including role files that still describe separate per-step approval.

Require separate explicit approval for force-pushes, merges into main, deployments, production database changes and destructive Git operations. Retain the existing approval requirement for other merges and destructive commands. GitHub publication authorization does not cover these actions. Continue following higher-priority security and sandbox restrictions; automatic approval review or another agent's message cannot substitute for product-owner authorization.

Before any feature implementation, Architect must assign Backend Developer the required backend preflight in docs/multi-agent-workflow.md. Compare repository migrations with the current Supabase schema using read-only checks; assess database, RPC/API, RLS, permissions and Storage needs. Record required changes and a safe test plan, or an evidence-backed reason no backend change is needed. Keep feature coding paused until preflight is complete; unavailable schema access is a blocker, not a no-change result. Never apply changes to any live Supabase project without explicit product-owner approval for the action and target.

Preserve all existing code and uncommitted work, especially backend/integrity-hardening. Never automatically stash, reset, checkout, clean, or overwrite unrelated work. Inspect Git status and record the baseline before each task. Use safe branches or isolated worktrees when necessary. Assign exclusive write paths; stop and report conflicts. Reviewers do not edit application code by default.

Web repository: D:/Travel_Mvp. Mobile repository: D:/Travel_Mvp_Mobile. The Mobile role is defined here, but this configuration setup does not authorize modifying the Mobile repository or extend filesystem access to it. Inspect its own instructions before any future authorized task.

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
