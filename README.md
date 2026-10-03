# Alfagift QA Workspace

Angular 21 frontend for the approved QA monitoring dashboard. It has four routes: Projects, Workflow, Workload, and Bugs. **Demo mode** keeps the approved sample design. **API mode** reads stored data and sync history from the Go backend; errors never substitute demo numbers.

## Run locally

```bash
npm ci
npm start
```

Open `http://localhost:4200/projects`. The Angular dev proxy forwards `/api/v1` to the existing Go server at `http://127.0.0.1:3002`; change `proxy.conf.json` if the backend uses another port. The Go API and PostgreSQL must be running for API mode. Select **API MODE** in the top bar. Enter the manager API key only when adding a project mapping or queuing a manual sync; the FE holds this key in memory and does not persist it. Jira and Qase credentials belong exclusively in the Go backend environment.

```bash
npm run build
npm test -- --watch=false
```

## Structure

- `src/app/app.*`, `app.routes.ts`: shell, sidebar, header, routing.
- `src/app/core/`: typed Go HTTP client, live state, reusable demo state and fixtures.
- `src/app/pages/`: approved Projects, Workflow, Workload, Bugs demo pages.
- `src/app/shared/dashboard-dialogs/`: shared project and QA detail dialogs.
- `src/app/shared/live-dashboard/`: API-backed pages, project detail, sync history and job event log.
- `docs/FRONTEND-ARCHITECTURE.md`, `docs/BACKEND-MVP-GO.md`, `docs/SYNC-RUNBOOK-JIRA-QASE.md`: architecture and sync contract.

The backend accepts the temporary JQL file provided by the project owner through environment configuration. Accurate cross-system counts still require Jira base URL, a verified INIT-to-bug relationship, and explicit INIT-to-Qase project mappings. Qase platform run labels such as AOS, IOS, BO, DB, and APO are independent from the Staging/Beta environment.
