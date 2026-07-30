# Admin workspace read-only design

## Goal

Admins need to open the normal project URL (`/projects/:id`) for another user's project and see the same workspace experience the owner sees, including chat, preview, and code panels, without being able to mutate or interrupt the user's project.

## Access model

`/projects/:id` has three modes:

- owner: existing full workspace behavior
- admin non-owner: same workspace shell in read-only mode
- non-owner non-admin: not found

Admin read-only mode is only for authenticated admins from `ADMIN_EMAILS`.

## Read-only workspace behavior

The admin read-only workspace reuses the same visual shell as the owner workspace, but all actions that can mutate project data, start/stop work, publish, or write client-side state are blocked or hidden.

Allowed in admin read-only mode:

- render chat history
- render workspace card and brief state
- render preview iframe
- render code/source tab as read-only
- poll/read runtime state if the existing preview/code UI requires it
- read thumbnails
- navigate back/admin list/detail links

Forbidden in admin read-only mode:

- sending chat messages
- auto-sending the initial prompt
- generating/building/retrying
- stopping/canceling work
- publishing
- editing title
- editing preview
- visual annotations
- adding attachments
- source writes
- support/energy/history actions that imply owner controls
- any POST/PUT/PATCH/DELETE from the read-only path
- any server mutation API route accepting admin non-owner access

## API access

Admin non-owner access may be added only to read endpoints needed by the same workspace view:

- project loader for `/projects/:id`
- `GET /api/projects/:id/runtime`
- `GET /api/projects/:id/source`
- `GET /api/projects/:id/preview`
- `GET /api/projects/:id/chat`
- `GET /api/projects/:id/thumbnail`
- `GET /api/projects/:id/workspace`

Mutation routes remain owner-only:

- generate
- edit
- stop/cancel
- publish
- title update
- snapshots restore
- any POST chat/preview route

Admin read endpoints must select only fields needed for display. They must not expose secrets, raw provider payloads, credentials, environment values, private logs beyond already owner-visible display data, or unrelated users' projects.

## UI affordance

Admin read-only mode shows a persistent banner:

`Mode admin baca-saja. Kamu melihat proyek seperti pengguna, tanpa izin mengubah atau mengirim aksi.`

Controls that would mutate are hidden or disabled with clear read-only copy. Prefer hiding action buttons where possible to avoid accidental clicks.

## Safety checks

Implementation must include focused tests proving:

- owner gets normal editable mode
- admin non-owner gets read-only mode
- non-admin non-owner is denied
- read-only workspace props suppress chat auto-send/build auto-start
- admin non-owner can read required GET endpoints
- admin non-owner cannot call mutation endpoints

Before handoff, run focused tests and `bun run check`.

## Out of scope

- impersonation
- admin edits
- admin chat messages
- audit log UI
- live collaborative cursor/presence
- changing owner workspace behavior
