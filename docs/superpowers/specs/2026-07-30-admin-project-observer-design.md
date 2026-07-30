# Admin project observer design

## Goal

Admins need to open a user project URL such as `/projects/cms6yfkyr00024lpiiefyszgj` and inspect the project in read-only mode without interrupting the owner's chat, build, preview, edit, publish, or runtime state.

## Route behavior

`/projects/:id` keeps three access modes:

- Project owner: render the existing normal workspace unchanged.
- Admin who is not the owner: render a read-only observer view.
- Any other non-owner: keep the existing not-found behavior.

Admins do not need a separate detail URL for this feature. The same shared project URL is the entry point.

## Observer data

The read-only observer view may show only data loaded by server-side reads:

- project id
- project title
- owner id, name, and email
- project status
- build status
- created and updated dates
- initial prompt
- persisted chat history
- persisted workspace card
- persisted brief summary

The first implementation can load the same first chat page size as the owner workspace uses on initial render. Older-chat pagination is out of scope unless it can be added without polling, mutation, or workspace side effects.

## Observer UI

The observer view is a static admin-readable page. It should use the existing warm/dark product chrome and Indonesian UI copy.

The page shows:

- a clear read-only banner: `Mode admin baca-saja. Tidak ada aksi yang dikirim ke proyek pengguna.`
- project metadata: title, owner, status, build status, created date, updated date
- the initial prompt
- chat history in the same general bubble style as the workspace, but without composer controls
- workspace card / brief summary when present

The admin projects list can link each row to `/projects/:id`.

## Read-only safety

The observer view must not mount `WorkspaceShell`. That avoids existing workspace effects that can send chat, poll runtime, reload preview, write local storage, or update client-side workspace state.

The observer view must not render or trigger:

- chat composer
- `useChat`
- generate/build buttons
- retry buttons
- stop/cancel buttons
- edit or visual annotation controls
- publish buttons
- preview iframe
- runtime polling
- source-code fetches
- POST, PUT, PATCH, or DELETE requests

All data access is read-only Prisma selection in the route loader or a small helper. The observer must not call project mutation API routes.

## Testing

Add one focused behavior test for the access decision:

- owner project access returns owner mode
- admin non-owner access returns observer mode
- non-admin non-owner access is denied/not found

Add one focused check that the observer component path does not expose mutation controls or workspace shell wiring if practical in the existing test setup.

Before handoff, run the focused test and `bun run check`.

## Out of scope

- Admin editing, chatting, building, stopping, retrying, publishing, or annotating
- Live preview iframe
- Source code browser
- Runtime logs or polling
- Impersonation
- Full chat pagination when it requires new client fetches
- Separate `/admin/projects/:id` detail route
