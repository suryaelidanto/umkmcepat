# Admin projects design

## Goal

Admins need a read-only view of user projects from `/admin` without interrupting project generation, preview, edit, publish, or runtime work.

## Scope

Add one admin tab and route:

- Tab label: `Proyek`
- Page route: `/admin/projects`
- API route: `GET /api/admin/projects`

The page shows the 50 most recently created projects globally, ordered by `createdAt` descending.

## Data

`GET /api/admin/projects` requires the existing admin auth gate. Non-admin responses keep the existing admin API behavior: `401` for unauthenticated users and `403` for authenticated non-admin users.

The API returns only read-only display fields:

- project `id`
- project `title`
- project `status`
- project `buildStatus`
- project `createdAt`
- project `updatedAt`
- owner `id`
- owner `name`
- owner `email`

No generated source, prompt, chat messages, build logs, artifacts, secrets, or runtime controls are returned.

## UI

`/admin/projects` follows the existing dark admin chrome and tab pattern. The page renders a dense list/table with newest projects first.

Each row shows:

- project title
- owner name/email
- project status
- build status
- created date
- updated date

The page is read-only. It must not render stop, edit, delete, retry, publish, or any other mutating action.

Empty state copy: `Belum ada proyek.`

Streamer mode masks project title, owner name, and owner email using the existing admin masking pattern.

## Safety

This feature observes database rows only. It does not touch generated project workspaces, runtime supervisors, build queues, snapshots, assets, deployments, or active operation tokens.

## Verification

Implementation must include one focused behavior check for the newest-first admin project listing. Before handoff, run the targeted check and `bun run check`.

## Out of scope

- Pagination beyond the first 50 rows
- Search/filter/sort controls
- Per-user drilldown pages
- Links into workspaces
- Any mutation from the admin projects page
