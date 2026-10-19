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

Preserve all existing code and uncommitted work, especially backend/integrity-hardening. Never automatically stash, reset, checkout, clean, or overwrite unrelated work. Inspect Git status and record the baseline before each task. Use safe branches or isolated worktrees when necessary. Assign exclusive write paths; stop and report conflicts. Reviewers do not edit application code by default.

Web repository: D:/Travel_Mvp. Mobile repository: D:/Travel_Mvp_Mobile. The Mobile role is defined here, but this configuration setup does not authorize modifying the Mobile repository or extend filesystem access to it. Inspect its own instructions before any future authorized task.

At completion, provide a concise summary of implementation, test results, independent review findings, GitHub links and remaining blockers. Identify unpublished work clearly.

Retain the generated Next.js instruction block above and read the relevant installed documentation before writing Next.js code. Do not infer APIs from prior Next.js experience.
