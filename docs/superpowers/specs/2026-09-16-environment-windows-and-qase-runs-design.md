# Environment Windows and Qase Test Runs

## Goal

Represent the Staging and Beta QA schedules independently and show each project's own Qase test runs in its detail view.

## Data model

Replace the generic project `start` and `end` fields with:

- `stagingStart` and `stagingEnd`
- `betaStart` and `betaEnd`

Add a project-owned `testRuns` array. Each test run contains an ID, name, environment (`STAGING` or `BETA`), scope such as iOS/AOS/DB/BO/Desktop/API, and passed, failed, blocked, and total counts. The Angular demo keeps this data in memory with the existing project fixtures; no new service or dependency is needed.

## Add Project

The form groups four native date inputs under Staging and Beta. All four dates are required. Submission rejects either environment when its end date is earlier than its start date. A new draft project starts with an empty `testRuns` array.

## Overview and Projects

The Overview project-monitoring table shows both Staging and Beta date windows instead of one generic deadline. The Projects cards show the matching date window inside each environment section. Existing status and progress displays remain unchanged.

## Project detail

The Testing tab lists only the selected project's test runs, grouped by Staging and Beta. Each row identifies the Qase run, its scope/platform, numeric result totals, and completion percentage. An environment with no configured runs shows `No test runs`.

This is project-specific mock data. It models the response shape needed from Qase, but does not add live Qase API access to this frontend-only prototype.

## Validation and compatibility

All existing fixture projects are migrated to the four environment date fields and receive representative project-specific runs. No legacy generic dates remain, avoiding two competing schedule sources.

## Verification

Update the Angular tests to cover:

- rejection of an invalid Staging or Beta range;
- successful creation with four valid dates;
- a new project's empty test-run collection;
- rendering project-specific run scopes in the selected project detail.
