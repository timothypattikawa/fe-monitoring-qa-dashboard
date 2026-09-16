# Environment Windows and Qase Test Runs

## Goal

Represent the Staging and Beta QA schedules and forecasts independently, show each project's own Qase test runs, and present project-specific Jira defects in its detail view.

## Data model

Replace the generic project `start` and `end` fields with:

- `stagingStart` and `stagingEnd`
- `betaStart` and `betaEnd`
- `stagingEta` and `stagingDaysLeft`
- `betaEta` and `betaDaysLeft`

Add a project-owned `testRuns` array. Each test run contains an ID, environment (`STAGING` or `BETA`), scope exactly as supplied by Qase (such as iOS/AOS/DB/BO/Desktop/API), and passed, failed, blocked, and total counts. The UI does not invent run names or health badges.

Extend the Jira defect fixture with environment, reporter, assignee, age, status, severity, and issue key. The Angular demo keeps this data in memory; no new dependency is needed.

## Add Project

The form groups four native date inputs under Staging and Beta. All four dates are required. Submission rejects either environment when its end date is earlier than its start date. A new draft project starts with an empty `testRuns` array.

## Overview and Projects

The Overview project-monitoring table shows both Staging and Beta date windows and their separate ETAs. The Projects cards show the matching date window, ETA, and remaining/overdue value inside each environment section. Workload/member timelines and every other schedule reference use the appropriate environment fields; no generic project ETA or days-left value remains.

## Project detail

The Testing tab keeps the Passed, Failed, Blocked, and Not run text totals and the Execution/Pass rate explanation. It adds a CSS donut chart derived from those same four values, without a chart dependency.

The tab lists only the selected project's test runs, grouped by Staging and Beta. Each row identifies the Qase run ID and Qase scope/platform plus numeric result totals and completion percentage. It does not display invented run titles or Behind/Blocked status badges. An environment with no configured runs shows `No test runs`.

The Bugs tab provides Staging/Beta controls and a Jira-style board grouped by reporter. Each issue card shows Jira key, severity, title, assignee, age, and status. Only issues linked to the selected INIT and selected environment appear. Live Jira access remains a backend responsibility so credentials are not exposed in Angular.

This is project-specific mock data. It models the response shapes needed from Qase and Jira, but does not add live API access to this frontend-only prototype.

## Validation and compatibility

All existing fixture projects use environment-specific dates, ETAs, days-left values, Qase runs, and Jira defects. No legacy generic date, ETA, or days-left fields remain, avoiding competing schedule sources.

## Verification

Update the Angular tests to cover:

- rejection of an invalid Staging or Beta range;
- successful creation with four valid dates;
- a new project's empty test-run collection;
- rendering project-specific run scopes in the selected project detail;
- environment-specific ETA rendering in every related view;
- donut segments and retained text totals;
- Qase scope-only rows without invented names or status badges;
- Jira defects filtered by selected project and environment, grouped by reporter.
