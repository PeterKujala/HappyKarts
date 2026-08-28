# KartBoard architecture

## Design goals

- The KAC workflow remains usable on touch and pointer devices.
- Rotation edits never reset or alter the active session timer.
- Public displays recover automatically after temporary connection loss.
- Existing saved state migrates without manual intervention.
- Domain behavior is testable without starting an HTTP server.
- The POC runs without third-party packages or a build tool.

## Runtime topology

```text
KAC browser ──POST actions──┐
                           │
Public boards ──SSE────────┼── Local Node server ── State repository
                           │                         ├─ kartboard-state.json
Any browser ──GET state────┘                         └─ backup + temporary file
```

The server is the sole authority for the practice-day state. Browsers calculate countdown presentation from the server-supplied timestamps; they do not send a request every second.

## Server boundaries

### `src/domain/state.js`

Owns schema v2, state normalization, legacy migration, stable class identities and read-only selectors. Class entries use `{ id, name }` rather than names alone so duplicates and active-class removal are unambiguous.

The central scheduling invariant is:

- `currentClass` is a snapshot of the class currently on track.
- `nextIndex` identifies the next entry in `rotation` that will run.
- `rotation` represents future cyclic order and may exclude `currentClass`.

This lets a KAC delete the active class from future rotation without changing the active display or timer.

### `src/domain/reducer.js`

Contains pure state transitions. It does not read files, access HTTP objects or broadcast events. Every accepted action returns a new state with an incremented revision.

### `src/infrastructure/file-state-repository.js`

Loads, migrates and saves state. A previous-state backup and temporary write file provide basic local recovery. The interface can later be replaced by a database repository without changing domain logic or HTTP routes.

### `src/infrastructure/sse-hub.js`

Manages Server-Sent Event clients, state broadcasts, cleanup and heartbeat messages. SSE is one-way because public boards only consume state.

### `src/http/create-server.js`

Provides API routing, JSON parsing, structured errors, static files, security headers, API metadata and optimistic revision checks. Importing it does not start a listener, which keeps integration tests isolated.

### `server.js`

The composition root. It loads runtime configuration, creates the application, records the process ID and begins listening.

## Browser boundaries

- `public/js/api.js`: HTTP, SSE, structured errors and API compatibility.
- `public/js/selectors.js`: display-oriented state derivation and countdown formatting.
- `public/js/rotation-editor.js`: shared pointer/touch rotation editing with a floating drag ghost and stable placeholder.
- `public/js/dom.js`: small safe DOM helpers.
- `public/js/toast.js`: transient user feedback.
- `public/control.js`: KAC workflow orchestration only.
- `public/board.js`: read-only public-board rendering only.

The controller sends stable class IDs back to the server. Editing captures a base `revision`; a save using a stale revision receives HTTP 409 instead of overwriting another controller.

## API

### `GET /api/meta`

Returns API/schema versions and accepted actions. The browser checks this before enabling controls, preventing stale-server and new-interface mismatches.

### `GET /api/state`

Returns the current public state.

### `POST /api/action`

```json
{
  "action": "updateRotation",
  "payload": { "rotation": [{ "id": "class-id", "name": "Cadet" }] },
  "expectedRevision": 12
}
```

Errors use `{ "error": { "code": "...", "message": "..." } }`.

### `GET /api/events`

SSE stream using the named `state` event. It includes retry guidance and heartbeat comments.

## Known POC boundaries

- No KAC authentication or authorization.
- One practice day and one venue per server instance.
- File persistence assumes a single server process.
- No TLS; access is appropriate only on a trusted local network.
- No audit trail beyond current state and one backup.
- No offline mutation queue; disconnected controllers must reconnect before acting.

Before hosted deployment, add authenticated controller roles, HTTPS, a transactional database, club/day tenancy, audit events, rate limiting and deployment monitoring.
