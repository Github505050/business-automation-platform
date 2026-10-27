# QA verification — October 27, 2026

## Verified

- `npm run check`: both server and frontend JavaScript syntax passed.
- `npm test`: **8/8 Node integration tests passed**.
- All CRUD operations on leads, customers, projects, tasks tested with actual SQLite storage.
- Cross-visitor access to another visitor's record returns 404, and independent visitors keep isolated records.
- Lead capture success and disabled-capture rejection verified.
- Conversion duplicates prevented on repeated Won status.
- Manual follow-up executes backend workflow and second invocation produces no duplicate tasks.
- Server-side scheduler tick produces a scheduled-mode execution without duplicate tasks.
- Project completion requires at least one task and all tasks Done; reopening a task reopens the project.
- Validation rejects missing email, invalid date, and reset without confirmation.
- Reset restores clean fictional data and clears execution history for that visitor.
- Rendered actual UI code at 1440×950 desktop, 820×1040 tablet, and 390×844 mobile sizes without JS errors or whole-page horizontal overflow.
- Mobile navigation opens and the Tasks page appears correctly.
- Modal inquiry form opens and is keyboard-focusable.
- A browser-UI→real-Node-API bridge test submitted a new inquiry, moved count from 9 to 10, confirmed persisted lead and capture log, and executed an actual manual follow-up with a saved log, without browser runtime errors.

## Limitations & not yet verified

- Repository creation/publishing cannot be completed with currently exposed GitHub connector actions.
- Live production deployment and externally reachable public URL are not configured.
- Browser environment blocks direct localhost navigation; browser rendering was tested via inline loading of the actual CSS/JS, and end-to-end UI→server logic via an API bridge. This is **not** equivalent to a normal browser test at a real public URL.
- External real-browser cross-platform QA, load tests, monitored scheduling, and formal penetration tests are not completed.
- An always-on Node process and durable storage volume are required for reliable scheduled jobs and persistence in deployment.

## Technical note

Seeded fictional sample records appear in charts and activity with demo labeling. Execution history is empty until a real workflow call creates it. The UI does not present static fake execution success records.