# Codex session notes

Read this file before work as directed by AGENTS.md. Follow `.codex/agents/architect.toml` as the primary-session role; that reusable file does not automatically select the parent role.
Use native Codex subagent spawn, messaging, follow-up, status, wait and interruption tools. Use the named roles when available; otherwise follow the shared role-instruction fallback. Branch prefix: `codex/`.
Metro/reverse port: **8081**; pass it explicitly to the shared phone-session helper.

## Configuration and startup

Start a fresh Codex chat rooted at the intended Web checkout after configuration changes. Existing chats must not assume loaded instructions, roles or limits refreshed.
Before assigning work, confirm repository trust and inspect effective configuration plus managed/session overrides: available agents, thread limits, filesystem access and approval review. Confirm `web_developer`, `mobile_developer`, `backend_developer`, `qa_tester` and `code_reviewer` are discoverable. Disclose startup checks that cannot be completed; startup inspection grants no development or delegation smoke-test authorization.
Project-local `.codex/config.toml` requests `approval_policy = "on-request"`, `approvals_reviewer = "user"`, `sandbox_mode = "workspace-write"` and `agents.enabled = true`; global settings are unchanged. `agents.max_concurrent_threads_per_session = 2` excludes the primary thread. Apply AGENTS.md's shared concurrency policy to open/paused specialists too.
`sandbox_workspace_write.writable_roots = ["D:/Travel_Mvp_Mobile"]` requests additional Mobile write access when honored by effective policy; it is not task authorization. With a separate worktree, verify that checkout's effective access too.
Standalone `.codex/agents/*.toml` use `name`, `description` and `developer_instructions`; models inherit current session settings and no legacy multi-agent flag is needed. Subagents inherit parent permissions; role files do not establish separate read-only sandboxes. Managed/session policy can override project settings. Settings may not prompt for every gated sandbox-permitted action: enforce AGENTS.md regardless, disclose conflicts and never use bypass flags or global-setting changes to evade gates.

## Validation and fresh-session loading check

Parse configuration TOML with Python 3.11+ `tomllib`. Use the installed strict configuration loader and `config/read` to inspect effective settings/discovered custom agents without starting a model turn or spawning agents; disclose unavailable validation interfaces. Delegation execution needs task authorization.
In a fresh session rooted at this checkout, request a read-only startup audit. Confirm its trace shows `.codex/CODEX.md` read before task work, then check its summary cites the primary Architect role file, specialist limit and Metro 8081. File existence or a pointer alone does not demonstrate loading; report this check pending until observed. Do not start work just to test loading.

Setup reference: CLI version recorded previously was `0.163.0-alpha.10.2`; this is historical, not a current-version assertion. Official references: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [AGENTS.md discovery](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide).
