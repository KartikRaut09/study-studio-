# GATE DA Study Studio

A personal GATE DA 2027 preparation tracker with a four-month timetable, syllabus checklists, module deadlines, notes, and study-hour summaries.

**Plan:** 6 October 2026–5 February 2027 · 123 days · 789 study sessions · 29 modules · 150 syllabus items. Daily sessions begin at 10 am; Sundays and mock days have their own schedules.

## What is included

| View | Purpose |
| --- | --- |
| Today | Dated timetable, session checkboxes, past-due tasks, actual hours and notes |
| Syllabus | Search and subject filters; Lesson, Practice, PYQs and Revision for each topic |
| Modules | Target dates, lesson counts and completion percentages |
| Progress | Overall completion, subject progress and actual hours by month |

There are **two ways to run the same interface**:

| Version | Location | Storage | Intended use |
| --- | --- | --- | --- |
| Web app | `app/`, `db/`, `build/` | Cloudflare D1, keyed by authenticated user | Private hosted app using the Sites authentication/runtime integration |
| Local app | `local-app/` | SQLite file on your computer | Ready-to-run personal app using Python, without Node or hosting |

**Hosting status:** the online app has not been deployed. This repository is source code, not a live deployment. The local app is functional. GitHub Pages alone cannot run the database API or authentication.

## Quick start: local app

Requires Python 3.10 or newer. The Python server uses only the standard library. Prebuilt browser assets are included, so Node is unnecessary for this option.

```sh
git clone https://github.com/KartikRaut09/study-studio-.git
cd study-studio-
python local-app/server.py --open
```

If your platform uses `python3`, substitute that command. Open **http://127.0.0.1:8768**. The server listens only on this computer. Keep the terminal running; Ctrl+C stops it. Closing a browser tab does not erase progress.

On Windows you can also double-click `local-app/Open Study Studio.cmd`; it starts the server in the background. Its launcher can use the bundled Codex Python runtime or an installed `pythonw`. Run the command above if you prefer visible errors and an easy Ctrl+C shutdown.

### Where your checks are saved

The local app creates `local-app/study-progress.sqlite3`. Each successful save writes to this file. Reopening the same app folder restores your checks, notes and hours. Wait for **Saved on this computer** before closing.

The database is deliberately excluded from Git. A fresh clone starts empty. Moving to another computer or another folder requires moving your progress database too. The local version has no account login, cloud sync, or automatic Excel sync. Do not expose its Python server to the internet.

### Back up and restore

Create a consistent backup, even while the server is running:

```sh
python local-app/backup.py
```

Backups go to `local-app/progress-backups/` and are excluded from Git. To restore, stop all running local app servers, keep a copy of the current database, copy the chosen backup into `local-app/` as `study-progress.sqlite3`, and restart. Do not delete your database to fix a startup problem.

Existing progress from the originally delivered desktop folder is not included in this repository. Copy its database into this clone's `local-app/` before starting if you want to continue that progress. Local and hosted databases are separate; automatic migration between them is not implemented.

## Development: web app

Requires Node.js **22.13 or newer**, npm and Git. The stack is React 19, TypeScript, Vinext/Vite, Cloudflare Workers and D1, with Drizzle migrations. `package-lock.json` pins the dependency tree.

```sh
npm run install:ci
node scripts/migrate-local.mjs
npm run dev
```

The development server normally starts at **http://localhost:5173**; use the URL it prints. The migration helper applies the checked-in migrations to a local D1 database under `.wrangler/state`. It uses the same database identifier as `vite.config.ts`. It does not touch a hosted database.

Local development provides a mock sign-in at `/signin-with-chatgpt?return_to=/`. This is a development identity, not a real ChatGPT account. Mock authentication is restricted to loopback development and is not production authentication.

Useful commands:

```sh
npm run typecheck        # TypeScript checks
npm run lint             # ESLint
npm run db:generate      # Generate migrations after editing db/schema.ts
npm run build            # Build the Worker-based web application
npm start                # Preview the built Worker locally; does not publish
npm run build:local      # Rebuild the local app's JS/CSS/plan from shared source
npm run test:local       # Python persistence and validation tests
```

For systems where only `python3` exists, run `python3 -m unittest discover -s tests -v` instead of `npm run test:local`.

`npm start` does not simulate sign-in. Use `npm run dev` for the mock-auth development workflow. Build and dependency installation need an environment that permits Node child processes; the restricted environment used during initial authoring blocked those operations.

## Hosting and permanent online progress

The web app already has per-user database reads and writes. `app/page.tsx` requires sign-in; `/api/progress` also requires an authenticated user. It reads the user's saved rows on load and upserts changes using the composite key `(user_id, item_id)`. Reloading the page does not initialize or clear that database.

### Existing Sites integration

The current web project was created for OpenAI Sites:

- `.openai/hosting.json` declares the registered project and the logical D1 binding **DB**.
- `app/chatgpt-auth.ts` reads user identity supplied by the trusted Sites runtime and uses its sign-in routes.
- `db/store.ts` accesses the **DB** binding.
- `drizzle/` contains the schema migration and migration metadata.
- The build copies hosting metadata and migrations into `dist/.openai/`.
- The registered project is private and has not been published.

To publish through Sites, use the Sites plugin with this checkout and the existing project ID. Install dependencies, generate migrations if the schema changes, build/package the Worker output, then use the plugin's source/version/deployment workflow. GitHub push by itself does not publish to Sites. No publishing credential is stored in this repository.

Keep the same hosted D1 database on future deployments. Apply schema migrations to it; do not recreate the database or import an empty database each deployment. Back it up before schema changes. Use the same account when reopening the app so it loads that account's records.

### Hosting with another provider

This is **not currently a provider-neutral, one-click deployment**. Before publishing elsewhere:

1. Configure a Cloudflare Workers-compatible deployment with a persistent D1 binding named `DB`, or port the database layer to your chosen backend.
2. Apply the SQL migrations in `drizzle/` to that production database.
3. Replace the Sites-specific authentication with a trusted, server-verified authentication/session system for your host. Implement sign-in/sign-out and map a stable user ID into the progress API.
4. Never trust user-supplied `oai-authenticated-user-*` headers on a generic public deployment. Those headers are trusted only behind the intended Sites runtime.
5. Verify that two accounts cannot read each other's records, that checks and notes survive reload/sign-out/sign-in, and that a new deployment preserves the database.

There is no Render, Railway, Vercel or standalone Cloudflare production configuration included. The local Python app is a personal loopback server, not the hosted backend. A GitHub Pages/static-only deployment would need a separately hosted authenticated API and database to provide the requested account-based persistence.

## Completion and hour calculations

- **Lesson coverage:** topics with Lesson checked / 150.
- **Full syllabus completion:** topics with all four stages checked / 150.
- **Module completion:** fully completed topics in that module / topics in that module.
- **Daily completion:** checked sessions for the selected date / sessions scheduled that date.
- **Actual hours:** sum of hours entered in daily-session forms. A checkbox never invents study time.
- **Planned hours:** the scheduled durations in `app/plan.json`.

Every topic counts equally. Daily tasks and syllabus stages are intentionally separate: one session can cover several topics, so checking a session does not automatically check syllabus stages. Unticking an item recalculates the totals. For topics without a direct previous-year question, use relevant exam-style practice.

Percentages measure tracked preparation, not a predicted GATE score. Module dates are study targets rather than verified GO Classes lecture durations. The plan is fixed to the dates above; it does not automatically reschedule missed sessions or follow later exam-date changes.

## Syllabus and plan data

`app/plan.json` is the shared source of truth. It contains `modules`, `topics` and `tasks`, each with stable IDs. Do not change existing IDs casually: saved progress is attached to them. Rebuild the local app after changes so its embedded plan and server validation data match.

The plan was imported from the accompanying spreadsheet. Syllabus topics are grouped into preparation modules, with 132 DA items and 18 General Aptitude items.

- [Official GATE 2027 DA syllabus](https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/DA_GATE2027_Syllabus.pdf)
- [Official GATE 2027 General Aptitude syllabus](https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/GA_GATE2027_Syllabus.pdf)

The app does not contain GO Classes videos or course materials and is not affiliated with that provider.

## Project map

```text
app/
  tracker.tsx             Shared interactive study interface
  plan.json               Four-month plan and syllabus items
  globals.css, tracker.css Responsive styles
  page.tsx                Authenticated web entry
  chatgpt-auth.ts          Sites identity helpers
  api/progress/route.ts    Authenticated GET/PUT API
db/                       D1 access and Drizzle schema
drizzle/                  SQL migration and schema snapshots
build/                    Worker entry and Sites/Vite integration
scripts/                  Install, build and local migration helpers
local-app/                Python server, launcher, backup utility, prebuilt UI
tests/                    Local persistence/validation and schema tests
public/                   Favicon and static assets
.openai/hosting.json       Existing Sites project identity and binding
```

`components/`, `hooks/`, `lib/`, `vendor/` and `examples/` contain retained starter infrastructure. Third-party license files remain with the vendored/prebuilt code.

## Validation and known limits

During development, TypeScript checks passed, the local browser bundle was generated, and local HTTP tests verified saving/reloading ticks, hours and notes, validation, request-origin checks and asset delivery. SQLite tests verified the schema and separation of user records. Run the checked-in tests again in your environment.

The complete production framework build and hosted end-to-end flow have not been verified. Automated visual browser testing was unavailable in the authoring environment. The local app's compiled assets are provided, but responsive styling should still be visually reviewed on your target devices.

Saves show an in-progress state and roll back failed checkbox changes. Failed note saves retain the typed text for retry. Avoid simultaneous edits to the same item in multiple tabs: the last successful write wins. There is no offline cloud-write queue, automatic cross-tab conflict resolution, live Excel synchronization or mobile installation package.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Local page unavailable | Start `python local-app/server.py --open`; keep the server running |
| A new clone has no checks | Personal databases are excluded from Git; restore/copy your local database |
| Cannot save locally | Ensure `local-app/` is writable and the database is not locked by another tool |
| Port 8768 in use | Reuse the running Study Studio instance, or stop the other process; do not start another copy with different data |
| Web API says sign-in required | Complete the development sign-in or configure real production authentication |
| Web API cannot load progress | Check the `DB` binding, schema migration and server logs |
| Build/install reports subprocess permission errors | Run in your normal development terminal with the permissions needed by Node and build tools |
| Hosting elsewhere redirects to missing sign-in routes | Replace the Sites-specific authentication as described above |

Credentials, `.env` files, dependency directories, personal SQLite files, backups and generated caches must remain out of Git. Do not add API keys or private progress to the repository.
