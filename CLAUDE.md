@AGENTS.md

## Architect and shared process
The main session acts as Architect: it plans, assigns exclusive paths, delegates, integrates and reports; it may implement small/focused tasks directly under the shared proportional verification policy. One Architect, at most two specialists at once, only the Architect delegates. Specialists never delegate. Do not create an Architect child agent.
Follow `docs/multi-agent-workflow.md` for the shared process, including proportional verification, the conditional backend-impact/preflight gate, preservation of existing work and tier-appropriate QA/review. Configuration/documentation-only workflow maintenance does not require a live schema check. Missing current-schema evidence blocks backend-impacting or uncertain feature coding; preflight never authorizes live changes.

## Repository and assigned paths
Infer the target repository from the user's request and the existing architecture: Web is `D:/Travel_Mvp`; the separate Expo/React Native Mobile app is `D:/Travel_Mvp_Mobile`. Ask only when the target is ambiguous or the work would expand into another repository. State the repository and each specialist's assigned paths before editing. Existing architecture is context, not permission to expand scope. Read the target repository's own AGENTS.md and CLAUDE.md before authorized work there; do not create a mobile app inside Web.

## Web commands
Use the current `package.json` scripts. Run only relevant, authorized commands and report checks actually run; listing a command does not execute or authorize it.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the lockfile's dependency versions; do not automatically fix or upgrade dependencies. |
| `npm run dev` | Start the local Next.js development server. |
| `npm run typecheck` | Generate Next.js types and run TypeScript checking. |
| `npm run lint` | Run ESLint with zero warnings allowed. |
| `npm run build` | Build the Web app locally; this does not authorize deployment. |
| `npm run test:db` | Run the historical schema, creation and track suites with synthetic local fixtures. |
| `npm run test:creation` | Run the Playwright creation integration suite. |
| `npm run test:e2e` | Run the Playwright end-to-end suite. |

Before any Next.js changes, read the relevant installed guides under `node_modules/next/dist/docs/` and heed deprecation notices; do not infer APIs from prior Next.js experience. Test tooling must use an isolated target and synthetic fixtures as required by the shared workflow. Do not run hosted SQL, migrations, seeds or backfills as verification. Physical-device verification is distinct from browser tests, mocks or exports.

## Claude permissions and specialist tools
Follow AGENTS.md's unified product-owner approval, preservation and secret-access rules. Never push directly to main. GitHub publication authorization covers related commits, a branch push and PR creation/updates within scope; merges, force-pushes, deployments, destructive commands and every live Supabase change require separate explicit approval naming the action and target.
Claude permission rules are tool controls, not an OS sandbox. Inspect effective permissions, retain tool prompts and do not use bypass modes. Existing product-owner authorization remains valid within its explicit scope; a tool prompt does not expand it. Never read .env or .env.* files, including nested or other-repository files, through file tools, shell commands, interpreters, search or indirect workarounds. Use variable names only; never expose secrets.
QA Tester and Code Reviewer have read-only tools by default. They inspect supplied evidence and return findings or a test plan; obtain a narrowly approved capability/scope change before running commands or writing tests, fixtures or evidence. Do not bypass tool limits. For major/sensitive changes, obtain QA and independent review against a stable identified snapshot; for other tasks follow the selected tier, resolve findings and rerun affected checks before authorized publication. Report exact files, checks, limitations, unpublished work and any approvals still needed.

## Check and context budget
Use the shared proportional verification policy for both repositories. Small cosmetic tasks use one session, diff/visual checks and a concise report; focused tasks use affected tests and static checks as needed. Major/sensitive tasks retain specialist implementation, QA and independent review. Do not launch agents, run all checks or load full conversation/repository context by default. Pass compact briefs and relevant paths/evidence; rerun only affected checks after changes. Explicit requests for broader checks take precedence.
