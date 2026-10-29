---
name: phone-session
description: Connect the product owner's Android phone and load the Journey Creator Mobile dev client so changes can be seen on the real device. Use once per conversation, the first time a Mobile feature, bug or design task needs to look at the phone (screenshots, checking a UI change, reproducing a bug). Skip if this conversation has already confirmed the phone and Metro are working and nothing has failed since.
---

# Phone session

The instructions are shared with Codex and kept in one place. Read `.agents/skills/phone-session/SKILL.md` (from the repository root) and follow it.

Claude Code uses Metro/reverse port **8082** (Codex uses **8081**). Pass 8082 explicitly to the shared `check.sh` and follow the shared ownership/handoff rules before operating the phone. These are Metro ports, not Android wireless-debugging ports.
