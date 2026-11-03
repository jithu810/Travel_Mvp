@AGENTS.md

Delegate with the Agent tool using `.claude/agents`; shared skills are exposed through `.claude/skills` pointers.
Branch prefix: `claude/`.
Metro/reverse port: **8082**; pass it explicitly to the shared phone-session helper.
Inspect effective permissions and retain tool prompts. Never use bypass permission modes. Permission rules are tool controls, not an OS sandbox; a tool prompt does not expand product-owner authorization.
