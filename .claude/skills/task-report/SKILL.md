---
name: task-report
description: Write the end-of-task summary for the product owner in the Journey App checkpoint format (implementation, checks, QA, review, GitHub links, approvals, publication state). Use when a Web or Mobile task finishes or is blocked.
argument-hint: "[optional: task name]"
---

# Task report

Task: $ARGUMENTS

Build the report only from evidence gathered in this session: real command output, agent results and confirmed URLs. Never claim a check, push, PR or device test that did not happen. Do not publish this report to GitHub or Notion unless the product owner authorized that reporting scope.

## Gather
1. For each affected repo: `git rev-parse --short HEAD`, `git status --short --branch`, and the changed files (`git diff --stat` plus untracked files).
2. The backend preflight decision and its reference.
3. Checks actually run and their results (from `/web-checks`, `/mobile-checks` or agent reports).
4. QA Tester result and Code Reviewer findings, with the snapshot they inspected, severity and disposition.
5. Any branch, commit or PR URLs. Verify them with `gh pr view` or `git ls-remote` before listing them.

## Output
Start with a short plain-language summary of what changed (2–4 lines), then:

```text
Timestamp (Asia/Kolkata):
Architect coordinator / responsible role / next owner:
Task status: planned | in progress | blocked | awaiting QA | awaiting review | awaiting approval | completed assignment
Repository / branch / base revision / changed files:
Canonical issue / related issue and PR full URLs: <urls> | none
Backend preflight: decision + reference
Checks actually run / results / not run + why:
QA (snapshot inspected): result / limitations
Code review (snapshot inspected): findings + severity + disposition | no findings
Physical-device verification: pending | done (evidence)
Blockers / next action / owner:
Human approvals: exact action + target / pending or granted / approval reference | none
Code publication: local/unpublished | pushed + confirmed branch URL and revision
Report publication: local/unpublished | published + confirmed URL and timestamp
```

State clearly what is local only. Merges into main, deployments and live Supabase changes always need separate explicit approval.
