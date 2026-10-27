# Northstar Ops — Business Operations & Workflow Automation

A **real full-stack** business operations portfolio demonstration for fictional digital agency **Northstar Studio**. It has a responsive SaaS-style frontend, Node HTTP API, SQLite data persistence, four server-driven workflows, audit logs, and isolated visitor sessions. It requires **no third-party API keys**.

> **Independent portfolio project**, not a commercial client implementation. Names, company records, financial figures, and analytics are fictional demonstration data. No commercial outcomes or testimonials are claimed.

## Free public portfolio demo — $0 hosting

**Recommended:** GitHub Pages hosts a browser-only interactive showcase at
`https://github505050.github.io/business-automation-platform/`.

It uses the same frontend design with a separate offline adapter (`public/offline-api.js`),
localStorage persistence and isolated per-browser fictional data. Lead/customer/project/task
CRUD, status updates, charts, triggered workflow simulations, manual due-date checks,
notifications and reset work without an account or server. No emails are sent.

**Important distinction:** Public Pages mode is **not the full-stack backend** and does
**not** run autonomous scheduled jobs, store data in SQLite, or share records across devices.
The real Node + SQLite server is included separately in `server/index.mjs`, tested locally,
and can be run on a suitable host later if a client requests it.

### Publish it on GitHub Pages

1. In the repository **Settings → Pages**, select **Source: GitHub Actions**.
2. Select **Actions → Publish free portfolio demo on GitHub Pages → Run workflow**
   if it has not run automatically after the push.
3. After a green deploy, open
   `https://github505050.github.io/business-automation-platform/` and test the demo.

The GitHub Actions deployment runs tests first, builds `_site` using
`npm run pages:build`, and publishes the static assets. **No card or paid hosting is required.**
Do not upload real client information to this fictional demo.

---

## Run the full-stack backend locally in two steps

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

## Alternative backend hosting (optional)

The **public free demo** needs only GitHub Pages (see above). The separate full-stack
Node/SQLite backend needs a server and durable storage for true production persistence
and uninterrupted scheduling. GitHub Pages does not run Node servers.

`render.yaml` is an **optional free Render preview** with no paid disk and with its
automatic scheduler disabled. SQLite changes can disappear on restart or idle spin-down;
do not use the free Render preview as a durable customer database. Render may suspend
free services that exhaust included usage. No Render account is required for the
recommended Pages portfolio demo.

## Test commands and verification

```bash
npm run check
npm test
```

Eight backend test suites and eight browser demo suites cover session isolation, persistence, validation, disabled rules, conversion idempotency, repeat follow-ups, project completion, task reopening, and reset.

UI layout snapshots are in `docs/` and `public/images/`. Chrome viewport layouts at 1440×950, 820×1040, and 390×844 were checked for page-level horizontal overflow and runtime JS errors. An interactive browser check connected the inquiry form and manual follow-up button to the actual backend API through a testing bridge (the browser environment blocked direct localhost navigation); both generated actual database records and execution logs.

Not yet verified: **public hosted deployment**, hosting credentials/billing, independent external QA in real client browsers, load/penetration tests, external scheduler uptime.

## Portfolio presentation

Open `/case-study.html` to view the project story, honest screenshots, workflows, and technology. Use only real screenshots of this running UI and say it is an independent demonstration. See `docs/UPWORK-CASE-STUDY.md` for copy-ready listing details.

## Learning resource

See `docs/CUSTOMIZATION-GUIDE.md` for the plain-English database, automation trigger and client customization walkthrough.