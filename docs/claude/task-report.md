# Task report

Used by the workspace `travel-report` skill for web and mobile tasks.

Build the report only from evidence in this session: real command output, agent reports and verified
URLs. Never claim a check, push, PR or device test that did not happen. Don't post it to GitHub
unless the user approved that.

## Gather
1. Each affected repo: `git rev-parse --short HEAD`, `git status --short --branch`, changed files
   (`git diff --stat` + untracked files).
2. Backend preflight decision and its reference.
3. Checks actually run and results (web/mobile checks or agent reports).
4. `tester` and `reviewer` results when the tier needs them (snapshot, severity, disposition);
   otherwise "not required" and why.
5. Branch, commit or PR URLs — verify with `gh pr view` / `git ls-remote` before listing.

## Output
Small tasks: one short paragraph — change, checks/skips, review not required, blockers, publication
state. Don't query GitHub when nothing was published.

Material tasks: a 2–4 line plain summary, then:

```text
Timestamp (Asia/Kolkata):
Lead / responsible agent / next owner:
Task status: planned | in progress | blocked | awaiting QA | awaiting review | awaiting approval | completed assignment
Repository / branch / base revision / changed files:
Issue and PR full URLs: <urls> | none
Backend preflight: decision + reference
Checks actually run / results / not run + why:
QA (snapshot inspected): result / limitations
Code review (snapshot inspected): findings + severity + disposition | no findings
Physical-device verification: pending | done (evidence) | not applicable
Blockers / next action / owner:
Approvals: exact action + target / pending or granted | none
Code publication: local/unpublished | pushed + confirmed branch URL and revision
```

Say clearly what is local only. Merges to `main` (= production deploy for web), deployments and live
Supabase changes always need separate explicit approval.
