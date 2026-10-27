# Northstar Ops — Business Operations & Workflow Automation

A **real full-stack** business operations portfolio demonstration for fictional digital agency **Northstar Studio**. It has a responsive SaaS-style frontend, Node HTTP API, SQLite data persistence, four server-driven workflows, audit logs, and isolated visitor sessions. It requires **no third-party API keys**.

> **Independent portfolio project**, not a commercial client implementation. Names, company records, financial figures, and analytics are fictional demonstration data. No commercial outcomes or testimonials are claimed.

## Run locally in two steps

1. Install Node.js **22.13 or newer** (Node 24 LTS recommended).
2. From this directory run `npm start` and open `http://localhost:3000`.

There are **no npm dependencies**. Node's built-in `node:sqlite` is used, so older Node releases do not work. Node 22 may display an experimental SQLite warning; the app still operates.

Optional configuration:

```bash
PORT=3000 SQLITE_PATH=./northstar.sqlite ENABLE_SCHEDULER=1 npm start
npm test
npm run check
```

The database persists to `northstar.sqlite` by default and is excluded from Git. The server serves the frontend and API from the same origin.

## Functioning features

| Area | What works |
| --- | --- |
| Dashboard | Record-derived counters, lead creation chart, pipeline distribution, conversion rate, unread notifications |
| Leads | Add, edit, delete, search, filter, update pipeline stage, set follow-up dates, conversion |
| Customers | Add, edit, delete, search, notes, project relationships, conversion-linked customers |
| Projects | Add, edit, delete, link customers, deadlines, progress from linked tasks, completion |
| Tasks | Add, edit, delete, search, status/priority/due dates, linked projects or leads |
| Automation Center | True enable/disable switches, triggers, manual follow-up execution, last run, execution history |
| Activity | Event history, in-app notifications, logs with automatic/scheduled/manual mode |
| Settings | Browser-saved theme, server-saved notification switch, confirmed private workspace reset |
| Demo | Automatic per-visitor session, fictional seed records, independent persisted workspace, expiry cleanup |
| Case study | `/case-study.html`, authentic product screenshots and technical disclosure |

## The four automations

1. **Inquiry capture** — `POST /api/inquiry` validates the submission, stores a New lead, records an execution, logs activity, and creates a notification. Turning capture off rejects inquiry submissions.
2. **Follow-up** — the server checks due dates every minute while online. It creates a task only if `followup:<leadId>:<date>` has not already been processed. Its manual Run now button invokes the same backend logic. `skipped` means no new due items, not success from imaginary work.
3. **Conversion** — updating a lead to **Won** creates a customer with a unique `source_lead` key. Repeated updates cannot make a duplicate. A disabled conversion workflow never performs conversion.
4. **Completion** — completing the last outstanding task of a nonempty project marks the project Completed, logs execution/activity, and creates a notification. Reopening a task automatically returns that project to In progress.

All demo execution logs are generated **from actual workflow calls**. Seeded workspace initialization is labeled clearly and is not presented as an executed automation.

## Architecture

```
Browser (vanilla JS SPA + responsive CSS + SVG charts)
  │ fetch('/api/...') using same-origin cookie
  ▼
Node.js HTTP server (server/index.mjs)
  │ validatable CRUD requests + business workflows + interval scheduler
  ▼
SQLite file (sessions/workflows/leads/customers/projects/tasks/
             activities/executions/notifications)
```

This stack was selected for **immediate functional testing, no API costs, portability, and minimal setup**. A component-based TypeScript framework and managed cloud DB would be sensible for a larger multi-user commercial application, but are not needed for this self-contained demo.

### API summary

- `GET /health` — simple service health response.
- `GET /api/state` — own session records and settings, without sending session token in JSON.
- `POST /api/inquiry` — validated fictional inquiry.
- `POST /api/{leads,customers,projects,tasks}` — add a record.
- `PATCH /api/{leads,customers,projects,tasks}/:id` — update an owned record.
- `DELETE /api/{leads,customers,projects,tasks}/:id` — delete an owned record.
- `PATCH /api/workflows/:kind` — set `enabled`.
- `POST /api/workflows/followup/run` — actual manual backend run.
- `POST /api/notifications/read` — mark notifications read.
- `PATCH /api/settings` — update notification preference.
- `POST /api/reset` with `{"confirm":true}` — restore own sample workspace.

## Security and demo constraints

- Cryptographically random 256-bit session ID in an **HttpOnly, SameSite=Strict cookie**; `Secure` when `NODE_ENV=production` and served over HTTPS.
- Records are always fetched or mutated with a server-side session ownership filter; no shared editable demo workspace.
- Session token is not returned in `/api/state`; requests include basic origin and JSON checks.
- Server validates required fields, email, lengths, enumerated statuses, amounts, and real calendar dates.
- Basic request throttling: 150 API requests/min/IP and 40 new leads/hour/workspace (suitable for a bounded portfolio demo, not a production WAF).
- Private 7-day session expiry and cleanup; no real customer data or email automation. SQLite uses WAL mode.
- Delete operations require confirmation in UI. Data is fictional and ephemeral after expiry.
- The platform is **not an authenticated CRM for real businesses**. For paid customer use, add identity/authentication, billing/tenant management, a production-grade rate limiter, an audit policy, backups, robust CSRF safeguards, secret management, monitored scheduling, and a managed DB before taking real personal data.

## Hosting and deployment

You **must have a Node hosting service and durable disk**, not GitHub Pages alone. GitHub Pages may host static content, but not these backend automations or SQLite writes.

Practical deployment with Render **paid persistent disk**:

1. Create a new **public GitHub repository** named `business-automation-platform` and upload all source files, excluding any `.sqlite` database file.
2. Connect the repository to a Render **Web Service**, choose an appropriate Node version, no build command required, start command `npm start`.
3. Attach a **paid persistent disk** mounted at `/data`.
4. Set `SQLITE_PATH=/data/northstar.sqlite`, `NODE_ENV=production`, `ENABLE_SCHEDULER=1` and use HTTPS with the Render domain.
5. Test inquiry, follow-up trigger, reload, project completion, and reset on the deployed site.
6. Verify the app's public URL and link it in the Upwork portfolio only **after** testing.

**Important:** Render free web services have no persistent disk; local SQLite would be erased on restart/spin-down. Hosting with no durable volume **does not meet** the persistent demo requirement. The in-process follow-up scheduler needs always-on service: if the host spins down, it doesn't run during that time. The current code does not include an external scheduled job or availability guarantee. Other hosts with durable disks and continuous processes are also suitable. Inspect hosting billing before choosing a plan.

## One-click Render Blueprint deployment (persistent, paid)

`render.yaml` configures an **always-on, paid web service** with a **1 GB attached persistent volume** and Node 24, so SQLite survives redeploys and the scheduler can run while online. Render bills for compute and storage; **review pricing and approve billing yourself** in Render. No costs are incurred from keeping the configuration in the GitHub repository.

1. Upload the **source files and folders from this package** to the repository root (do not upload the zip itself or any `*.sqlite*` files).
2. In Render, create a **New → Blueprint**, connect `Github505050/business-automation-platform`, and review the `render.yaml` plan and charges.
3. If you approve the paid plan, select **Deploy Blueprint**, and note your assigned `onrender.com` URL.
4. Verify `/health`, dashboard records, submitting a sample inquiry, follow-up and lead conversion, and refreshing without losing data. After deployment, check that repeated workflow runs do not create duplicate tasks.

If you only want a no-cost temporary preview, you can instead create a **Free Web Service** using `npm start` with `NODE_ENV=production`; do not attach a disk. SQLite data will be discarded at instance restarts/redeploys and in-process scheduling pauses when Render spins down the service, so **it does not meet this project's persistent automation requirement**. Clearly label such a preview as temporary and resettable.

## Test commands and verification

```bash
npm run check
npm test
```

Eight backend test suites cover session isolation, persistence, validation, disabled rules, conversion idempotency, repeat follow-ups, project completion, task reopening, and reset.

UI layout snapshots are in `docs/` and `public/images/`. Chrome viewport layouts at 1440×950, 820×1040, and 390×844 were checked for page-level horizontal overflow and runtime JS errors. An interactive browser check connected the inquiry form and manual follow-up button to the actual backend API through a testing bridge (the browser environment blocked direct localhost navigation); both generated actual database records and execution logs.

Not yet verified: **public hosted deployment**, hosting credentials/billing, independent external QA in real client browsers, load/penetration tests, external scheduler uptime.

## Portfolio presentation

Open `/case-study.html` to view the project story, honest screenshots, workflows, and technology. Use only real screenshots of this running UI and say it is an independent demonstration. See `docs/UPWORK-CASE-STUDY.md` for copy-ready listing details.

## Learning resource

See `docs/CUSTOMIZATION-GUIDE.md` for the plain-English database, automation trigger and client customization walkthrough.