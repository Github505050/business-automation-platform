# Northstar Ops: practical client customization guide

## 1. How the database works

SQLite stores records in a single persistent file. Each browser receives a secure session cookie (an unguessable visitor token). The API filters every query and mutation by that token. The tables represent leads, customers, projects, tasks, workflows, event logs and notifications. `GET /api/state` returns only the current visitor's records.

## 2. How a workflow is triggered

- **Capture:** An inquiry form sends JSON to `POST /api/inquiry`. The backend inserts the lead then records the execution.
- **Follow-up:** A server process checks stored `follow_up` dates once per minute. It inserts tasks with unique automation keys. The Run now button uses exactly the same code, labeled `manual`.
- **Conversion:** Setting `lead.status` to `Won` runs `convert()` once. A unique `source_lead` database key prevents duplicate customer inserts.
- **Completion:** When a task changes, `checkProject()` determines if all linked tasks are Done. It never auto-completes projects with zero tasks.

## 3. Change a workflow

Edit its function inside `server/index.mjs`. Change the business condition and action, then run `npm test`. Update the public descriptions in the `flows` array in `public/app.js`. Keep server and UI language consistent.

## 4. Add a fifth workflow

1. Add a new workflow ID to `KINDS` in `server/index.mjs`.
2. Define the trigger, condition, actions, duplicate prevention, and logging.
3. Add a clear UI entry in `public/app.js` `flows`.
4. Add a test for success, disabled state, retry/idempotency, and failure.
5. Document whether it is automatic, scheduled, or manual.

## 5. Connect a business website inquiry form

For the portfolio demo, open **Leads → Test inquiry form**. It posts to `/api/inquiry`. For a separate real client's website you must set up securely authenticated cross-site intake (e.g. a dedicated form service or signed API with origin/abuse protections); do **not** just enable all CORS origins or expose an unauthenticated open write endpoint for real customer data. Ask the client for form fields, consent terms, and where their data may be stored.

## 6. Customize the dashboard

The metrics are calculated from actual records in `overview()` in `public/app.js`. Modify summary calculations and chart labels, not fake hardcoded numbers. Seed records are created in `seed()` inside the backend for new visitors only.

## 7. Troubleshooting

- **App won't start:** Confirm Node >=22.13 and that it supports `node:sqlite`.
- **Updates disappear after hosting restart:** Your storage is not on a durable mounted volume; configure `SQLITE_PATH` correctly.
- **Follow-ups never run:** Confirm the rule is enabled, follow-up date is due, and the server/scheduler is running. Use **Run now** to diagnose manually.
- **Duplicate follow-ups:** Inspect `automation_key` uniqueness and the lead's follow-up date. Never remove the uniqueness constraint without adding another idempotency mechanism.
- **Won lead hasn't converted:** Check whether Conversion is enabled. Edit/save the Won lead again to retry.
- **Project is not completed:** It must have at least one linked task and all linked tasks must be Done.
- **Unexpected 404 on editing:** The record may belong to another session or no longer exist.
- **Theme won't persist:** Some privacy-restricted browsers block localStorage. The app falls back safely.

## 8. Update and deploy a customized version

Create a client-specific code branch/repository. Update wording in `public/`, business rules in `server/`, run tests, and deploy to a secure, durable Node host. Configure backups, monitoring, users/authentication and data-handling policies **before accepting real production records**.

## 9. What this prepares you to offer on Upwork

Good entry-level scopes: business dashboard UI, CRM lead tracker, project/task board, inquiry-form integration, simple Node CRUD APIs, workflow prototypes, automation logging, and polishing existing admin panels. More advanced scopes — regulated data, multi-tenant commercial SaaS, high-volume distributed schedulers, payments, complex OAuth connections, guaranteed deliverability, and real production security audits — need additional engineering experience.