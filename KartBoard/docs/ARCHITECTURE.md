# KartBoard architecture

## Design goals

- The KAC workflow remains usable on touch and pointer devices.
- Rotation edits never reset or alter the active session timer.
- Public displays recover automatically after temporary connection loss.
- Existing saved state migrates without manual intervention.
- Domain behavior is testable without starting an HTTP server or a Worker.
- The same reducer runs locally and on Cloudflare.

## Runtime topology

```text
Public board ── GET state / SSE ─────────────┐
                                             │
KAC browser ── code login, then POST actions ┼── Node server (LAN) ── file repository
                                             │                         kartboard-state.json + access codes
                                             │
Admin browser ── Access JWT, then code API ──┴── Cloudflare Worker ── Durable Object KartBoardRoom
      /auth/apps/kartboard-admin*                  /auth/apps/kartboard*     SQLite storage + SSE clients
```

The server, whether Node or the Durable Object, is the sole authority for the practice-day state. Browsers calculate the countdown from server timestamps. They do not send a request every second.

Hosted pages live at `https://designacle.au/auth/apps/kartboard/`. Admin lives at `https://designacle.au/auth/apps/kartboard-admin/` so it stays on the existing Access application. The browser resolves `styles.css`, `api/state`, and `api/events` from the document URL, so the same files work at the local server root. `/auth/apps/kartboard` redirects to `control.html`.

The only clock is the current session. `+ 1 minute` moves `startedAt` later while running, or adds to `pausedRemainingMs` while paused, so more time remains. **Advance by 1 minute** uses those same fields with the opposite sign, so the countdown ends one minute sooner and the next class can be started earlier. Remaining time stops at zero. The next class does not store its own start time; it starts when the controller taps the main button. Both actions go through `POST /api/action` with the session, Origin header, and `expectedRevision`. The public board reads the updated `startedAt` from the next state event.

## Server boundaries

### `src/domain/state.js`

Owns schema v2, state normalization, legacy migration, stable class identities, and read-only selectors. Class entries use `{ id, name }`.

The scheduling invariant is:

- `currentClass` is a snapshot of the class currently on track.
- `nextIndex` identifies the next entry in `rotation` that will run.
- `rotation` represents future cyclic order and may exclude `currentClass`.

### `src/domain/reducer.js`

Pure state transitions. It does not read files, access HTTP, or broadcast. Every accepted action except `reset` returns a new state with an incremented revision. `reset` returns the default day.

### `src/infrastructure/file-state-repository.js`

Local load, migrate, save, backup, and recovery. `updatedBy` is kept on the JSON even though the domain normalizer does not interpret it. Used by `npm start`. Not used on Cloudflare.

### `src/infrastructure/durable-state-repository.js`

The same load/migrate/save contract over a key-value storage object (`get` / `put`). The Worker Durable Object passes `ctx.storage`. Tests use an in-memory storage. Legacy rotations are migrated on load.

### `src/infrastructure/sse-hub.js`

Web `ReadableStream` Server-Sent Events: an immediate `state` event, `retry: 1500`, and a 20-second heartbeat while anyone is connected. The Node server writes that stream to the HTTP response. The Durable Object returns it directly.

### `src/application/coordinator.js`

Loads state once, applies a synchronous mutation, saves, then publishes the public view. The revision check and the reducer run before any `await`, so two controllers cannot both pass the same `expectedRevision`.

### `src/http/handle-request.js`

Shared router for the Node server and the Durable Object. It understands the base path, the admin base path, read-only routes, code login, session cookies, Origin and `X-KartBoard-Request` checks, required `expectedRevision`, admin code routes, and static files.

### `src/http/create-server.js` and `server.js`

Node composition root. Importing the HTTP module does not listen. `server.js` loads config, the user file, and the session secret, then listens.

### `worker/index.mjs` and `worker/room.mjs`

The Worker serves embedded static files for `/auth/apps/kartboard` and `/auth/apps/kartboard-admin`, verifies the Cloudflare Access JWT before admin HTML or `/api/admin/*`, and forwards API requests to one Durable Object named `practice-day`. The Durable Object checks the JWT again. `workers.dev` and preview URLs are disabled in `wrangler.jsonc`.

## Browser boundaries

- `public/js/api.js`: HTTP and SSE against the document URL, JSON posts with `X-KartBoard-Request: 1`.
- `public/js/pin-gate.js`: one access-code field. No name picker.
- `public/js/help-topics.mjs` and `public/js/show-me.mjs`: Show me notes and the fetch guard. `help.html` is the written guide.
- `public/admin.html`: create, list, revoke, and regenerate codes. The code is shown once.
- `public/js/selectors.js`, `rotation-editor.js`, `dom.js`, `toast.js`: display and editing.
- `public/control.js`: KAC workflow. Every mutation sends `expectedRevision`. HTTP 409 closes edit mode, reloads state, and shows the refresh banner.
- `public/board.js`: read-only.

## API

All paths below are under the base path. Locally that is empty. Hosted, it is `/auth/apps/kartboard`.

### `GET /api/meta`

API version 2, schema version, and accepted actions. Public.

### `GET /api/state`

Current public state, including `updatedBy` (empty string if nobody has changed it yet). Public.

### `GET /api/events`

SSE `state` events. Public and read-only.

### `GET /api/session`

`{ authenticated, user, users }`. `users` is the merged name list for callers that still read it. The controller screen does not show it. Hashes are not returned.

### `POST /api/login`

`{ "code": "k7m2p9qa" }`. The server finds the name. `{ "name": "Controller", "pin": "2468" }` still works for older callers. Requires same-origin JSON and `X-KartBoard-Request: 1`. Sets the session cookie, including the code id and version. Failures are rate limited per IP and per name, or per code when no name is sent.

### Admin, under `/auth/apps/kartboard-admin` or the local server

`GET /api/admin/codes` lists name, created time, last used, and `source` (`managed` or `seed`). `POST /api/admin/codes` with `{ "name": "Controller" }` returns the new code once. `POST /api/admin/codes/revoke` and `POST /api/admin/codes/regenerate` take `{ "name" }`. Hosted calls need a valid Access JWT. Local calls need loopback, or `Authorization: Bearer` when `KARTBOARD_ADMIN_TOKEN` is set. Mutations use the same Origin and `X-KartBoard-Request` checks.

### `POST /api/logout`

Clears the cookie. Same request checks as login.

### `POST /api/action`

Requires a valid controller session, the same request checks, and an integer `expectedRevision`.

```json
{
  "action": "updateRotation",
  "payload": { "rotation": [{ "id": "class-id", "name": "Cadet" }] },
  "expectedRevision": 12
}
```

Errors use `{ "error": { "code": "...", "message": "..." } }`. `REVISION_REQUIRED` is 400. `REVISION_CONFLICT` is 409. `AUTH_REQUIRED` is 401. `CROSS_ORIGIN` is 403. `RATE_LIMITED` is 429.

## Access

See [ACCESS.md](ACCESS.md). The public board and its read API are unauthenticated. The controller is a code plus a signed cookie. Cloudflare Access must bypass `designacle.au/auth/apps/kartboard` and `auth/apps/kartboard/*` without swallowing `kartboard-admin`. Admin verifies the Access JWT and fails closed when `ACCESS_AUD` is missing.

## Known limits

- One practice day and one venue per deployment.
- Local file persistence assumes a single Node process.
- The hosted object is the concurrency boundary for the club.
- Controller login is deliberately small. It is not a substitute for Access on admin or on other apps.
- No audit log beyond `updatedBy` and the local backup file.
- No offline mutation queue.
- Client clocks are assumed to be roughly aligned with the server. There is no clock-offset correction.
- Everyday actions now send `expectedRevision`. Two controllers can no longer silently overwrite each other; the later one gets 409 and must refresh.
