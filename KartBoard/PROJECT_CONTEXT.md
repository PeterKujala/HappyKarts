# KartBoard Project Context

KartBoard is a local-first, real-time practice-session communication board for kart clubs. One authorised practice-day controller—the role called the **KAC** throughout this project—updates the session flow, while view-only public boards on phones, tablets, laptops, or larger displays immediately show who is on track, who is next, who follows, and approximately how much session time remains.

This document was last reconciled with the project files on 22 November 2026. The current package version is `0.3.0`. Status labels have precise meanings:

- **IMPLEMENTED** — demonstrably exists in the current project.
- **DECIDED** — agreed product or design direction, whether or not it is fully implemented.
- **PROPOSED** — a possibility discussed for later consideration.
- **OPEN QUESTION** — unresolved and must not be treated as agreed.

## Instructions for AI Assistants

1. This file is the persistent context and long-term memory for KartBoard.
2. Read this file before making substantial project changes.
3. Inspect the actual current code and artifacts rather than assuming this document is perfectly current.
4. Actual code is authoritative regarding the current implementation.
5. Incorporate important product, architectural, requirements, or implementation decisions made in future sessions back into `PROJECT_CONTEXT.md`.
6. Record completed or materially changed work in `CHANGELOG.md`.
7. Update documentation in place rather than endlessly appending, so obsolete information does not accumulate.
8. Preserve historical decisions that remain useful, especially the reasoning behind them.
9. Do not silently reinterpret **IMPLEMENTED**, **DECIDED**, **PROPOSED**, or **OPEN QUESTION** items. Change a status only when there is evidence or an explicit new decision.
10. Before ending a substantial development session, consider whether `PROJECT_CONTEXT.md` and `CHANGELOG.md` need updating.

## Current Status at a Glance

| Area | Status | Current position |
| --- | --- | --- |
| Communication-only MVP | **IMPLEMENTED** | Controller and public board. Hosted at `/auth/apps/kartboard` and still runnable as a local Node server. |
| KAC controller | **IMPLEMENTED** | Pre-practice setup, one-tap session advancement, quick controls, notices, and live running-order editing. |
| Public display | **IMPLEMENTED** | Responsive, view-only board with live updates and reconnect behavior. |
| Persistence and recovery | **IMPLEMENTED** | Local JSON file with backup. Hosted state is one SQLite Durable Object. Both use the same migration and revision rules. |
| Local network access | **IMPLEMENTED** | `npm start` still listens on the LAN. The hosted URLs are the ones to publish. |
| Static QR access cards | **IMPLEMENTED** | QR images encode `https://designacle.au/auth/apps/kartboard/board.html` and `control.html`. `npm run qr` regenerates them. |
| Automatic QR generation | **IMPLEMENTED** | `scripts/generate-qr.mjs`. The running server does not draw QR codes itself. |
| One-day Ipswich trial | **DECIDED** | Preferred next validation step; not recorded as completed. |
| Hosted deployment | **IMPLEMENTED** | Cloudflare Worker `kartboard` on `designacle.au/auth/apps/kartboard*`. Not deployed by this repository. See `docs/DEPLOYMENT.md`. |
| Authentication | **IMPLEMENTED** | Public board is open. Controller requires a registered PIN and a signed cookie. See `docs/ACCESS.md`. |
| TLS | **IMPLEMENTED** | HTTPS on the hosted site. Local LAN remains HTTP, with the session cookie not marked Secure. |
| Tenancy | **PROPOSED** | Still one venue and one practice day. |
| Audit | **IMPLEMENTED** | `updatedBy` records the controller name on each accepted change. There is no separate event log. |
| Telemetry or steering-wheel display | **PROPOSED** | Part of the original broad idea, deliberately excluded from the current MVP. |
| Multi-club/multi-event service | **PROPOSED** | Current server represents one venue/practice day only. |

## Why the Project Exists

### Original problem

Kart practice days rotate through class groups for sessions of roughly eight or nine minutes. The track supervisor checks that the previous group has cleared the track and returned through the in-grid, releases the next group from the out-grid, and later indicates that the session has ended. The order repeats through the day and may change when entries are consolidated or split.

At Ipswich Kart Club, Russell—the usual practice-day supervisor described in the project discussions—uses loudspeaker announcements and a magnetic running-order board. This works reasonably well, but announcements are temporary and the physical board is basic. At Toowoomba, the user experienced little or no comparable communication. Drivers and helpers can easily lose track of the rotation while refuelling, adjusting, or repairing a kart.

The project originated from the user's experience driving a TaG 125 Restricted kart at Ipswich and attending practice at Toowoomba and Lockyer Valley. It also reflects a personal interest in real-time data visualisation, although the current product deliberately visualises shared session state rather than kart telemetry.

The recurring paddock questions are:

1. Who is on track now?
2. Who should be preparing or lining up next?
3. Approximately how long remains in the current session?

**DECIDED:** KartBoard should make those answers persistent and universally visible without requiring the KAC to repeat information or asking participants to keep watching the circuit.

### Intended users

- **Primary user:** the KAC or authorised practice-day controller responsible for keeping sessions moving. The KAC experience is the highest product priority.
- **Public users:** drivers, mechanics, parents, families, and other paddock participants who need a quick, view-only status.
- **Likely display devices:** the KAC's iPhone, Android phone, Windows computer, Mac, or tablet; public users' phones; and potentially a shared paddock monitor or television.

The project uses **KAC** as shorthand for the authorised kart-club official controlling the practice rotation. The exact formal title or expansion was not established in the recovered discussion and remains an **OPEN QUESTION**.

### Real-world operating environment

- Noisy outdoor kart paddock with divided attention and potentially patchy internet access.
- A practice day usually runs repeated sessions until the club's finishing time; examples discussed were approximately 3:30 pm Sunday and 4:30 pm Saturday, but these are not application rules.
- Session order is not fixed. Classes may be added, removed, split, combined, duplicated, or reordered according to attendance.
- Interfaces must work with both touch and mouse/pointer input and at phone through desktop sizes.
- The current system assumes every device can join the same trusted local network as the server computer.
- Physical lights, flags, track staff instructions, and announcements remain authoritative.

## Vision, Purpose, and Scope

### Product vision

**DECIDED:** Give the whole paddock one clear, live answer about practice-day flow while leaving operational authority with the KAC. KartBoard is intended as a community quality-of-life improvement, not a commercial venture.

### Current MVP objective

**IMPLEMENTED:** A KAC can configure a practice day, advance or adjust the session flow with minimal effort, and publish live shared status to any modern browser on the same network.

The MVP intentionally communicates only:

- current class;
- approximate time remaining;
- next and following classes;
- overall status such as ready, paused, changeover, break, or finished; and
- an optional short paddock notice.

### Explicit boundary

**DECIDED:** KartBoard augments or substitutes for routine spoken rotation announcements; it is not a safety system, official timing system, race-management system, or replacement for the KAC's judgement. The public board visibly says that times are approximate and participants should listen for track announcements.

The user's original idea also included real-time kart data, lap information, on-track safety information, and a phone mounted on the steering wheel. That broader idea was deliberately scaled back because it introduces safety, accuracy, hardware, regulatory, and formal operational dependencies. It may be reconsidered separately, but it is not part of the present product contract.

## Core Workflows

### Pre-practice KAC workflow

**IMPLEMENTED:** From `public/control.html`, the KAC can open **Day setup** while the day is `ready` or `finished` and:

1. set the venue;
2. set a practice-day label;
3. set the usual session length from 1 to 30 minutes;
4. drag class tiles into order;
5. use up/down controls on smaller screens as an accessible fallback;
6. add standard classes not already present;
7. add a custom class;
8. rename, duplicate, or remove classes; and
9. preview the first and next class before saving.

At least one class is required. The default setup is Ipswich Kart Club, Saturday Practice, nine-minute sessions, with Cadet P, Cadet, Junior P, Junior, Senior Restricted, and Senior Open.

Saving Day setup deliberately resets the operational day to `ready`, selects the first class, clears timing and notice data, and makes the first rotation entry the next starting point. Full Day setup is therefore disabled during an active day.

### Normal KAC workflow

**IMPLEMENTED:** The dominant full-width action changes its label according to state:

- `ready` or `finished`: start the first class and a fresh countdown;
- `running` or `changeover`: advance to the next class and start a fresh countdown;
- `paused` or `break`: resume the current class.

The everyday session change is intentionally one large, obvious tap. Secondary controls are available for Pause/Resume, add one minute, Changeover, Previous class, Take a break, and Finish day. The KAC can also post or clear a notice of up to 140 characters.

**DECIDED:** Normal running should require no typing.

### Mid-day running-order change

**IMPLEMENTED:** The running order appears directly on the controller dashboard in a locked state. The KAC can enter edit mode by:

- long-pressing a class tile for about 600 ms on touch; or
- clicking the visible handle on any tile with a pointer.

Edit mode is deliberately reminiscent of rearranging iPhone home-screen icons: the card visibly enters an editing state, tiles adopt a subtle alternating tilt, and the KAC can drag them into a new order, add an unused standard class, add a custom class, or remove a class. **Done** saves; **Cancel** discards the draft.

**IMPLEMENTED invariant:** Saving a mid-day rotation change never resets or changes the current class, timer, pause state, or other live session fields. It recalculates only the future cyclic order around the current session. If the active class is removed, it remains the displayed current-session snapshot but is omitted from future cycles.

Edits use an optimistic revision captured on entry. If another controller has changed the board before save, the server returns a conflict rather than silently overwriting the other change.

### Public/driver workflow

**IMPLEMENTED:** A participant opens `public/board.html` in a modern browser, normally using a local-network URL or QR code. No account or application installation is needed. The display is read-only and shows:

- venue and practice label;
- current status or class;
- approximate `MM:SS` countdown;
- next and following classes;
- optional paddock notice; and
- local clock time.

Ready, changeover, break, and finished states use a full-screen status overlay. Live changes arrive automatically. If the event stream disconnects, the browser shows a reconnecting indicator and the native EventSource client retries.

## Requirements and Product Intent

### Functional requirements

The following are **IMPLEMENTED**:

- One server-authoritative practice-day state shared by one or more browsers.
- A separate controller route and view-only public route.
- Pre-practice venue, label, session-duration, and class-order configuration.
- Arbitrary class names and up to 30 rotation entries.
- Stable class identity even when names are duplicated.
- Touch/pointer drag reorder, add, duplicate, rename in setup, and remove.
- Only unused standard class names are shown as quick-add choices; custom or duplicate entries remain possible.
- One-tap session start/advance and explicit exceptional controls.
- Approximate countdown with pause/resume and add-minute behavior.
- Mid-day rotation edits that preserve the active session and timer.
- Short live paddock notices.
- Immediate public updates via Server-Sent Events (SSE).
- Reconnection behavior and initial state retrieval.
- File-backed persistence, migration, and basic recovery.
- Structured API errors, version compatibility checking, and stale-edit conflict detection.

### Non-functional requirements

- **DECIDED:** KAC intuitiveness is the highest priority.
- **IMPLEMENTED:** Responsive on modern iPhone, Android, Windows, and macOS browsers; no platform-specific client application.
- **IMPLEMENTED:** No third-party runtime packages, package installation, bundling, or build step.
- **IMPLEMENTED:** Local operation does not require internet access or a cloud account.
- **IMPLEMENTED:** Public screens do not poll every second; they derive the countdown locally from server timestamps.
- **IMPLEMENTED:** Domain transitions are isolated and testable without starting the web server.
- **IMPLEMENTED:** The project has automated domain, persistence, and HTTP integration coverage. All 16 tests passed during the 28 August 2026 documentation audit.
- **DECIDED:** Status should be legible at a glance and usable while attention is divided.
- **DECIDED:** Copy must consistently describe timing as approximate.
- **DECIDED:** A field trial must preserve existing safety procedures and may keep existing announcements in parallel.

## UI and Interaction Rationale

### Controller

The controller uses a warm neutral background, white cards, deep forest green, and a high-visibility lime accent. The active session and large countdown dominate the page. The primary action is visually stronger than the quick controls because it is the action used throughout a normal day.

The running order remains visible on the main page. It is locked by default to reduce accidental changes. Long press was chosen for touch familiarity, while a visible handle avoids making the feature undiscoverable for mouse users. The shared editor uses a floating drag ghost and stable placeholder to reduce the flicker seen in an earlier implementation.

### Public board

The public board uses oversized current-class and timer typography, with next and then separated in a queue. It carries no mutation controls. The design aims to work on an individual phone and a display across the paddock without creating two products.

### Interaction decisions from development

- **Rejected:** text-based ordering. It was less direct than manipulating class tiles.
- **Rejected:** relying only on drag without an entry affordance. Edit mode must be intentionally entered and visually obvious.
- **DECIDED:** use iPhone-style long press plus a visible pointer handle.
- **DECIDED:** while editing, standard quick-add choices show only classes not already active.
- **DECIDED:** editing the future order must not interrupt the session already on track.
- **IMPLEMENTED:** the previous `Done` action bug, which surfaced as an `Unknown action` message, has been corrected by sending the supported `updateRotation` action.
- **IMPLEMENTED:** the stale visible running-order issue after saving has been corrected; accepted server state is rendered back into the dashboard.

## Hosted release 0.3.0

**IMPLEMENTED:** KartBoard is prepared for `https://designacle.au/auth/apps/kartboard/board.html` (public, no login) and `https://designacle.au/auth/apps/kartboard/control.html` (PIN). Cloudflare Access on `/auth/apps/*` would block the public board, so Peter must add a more specific Bypass/Everyone application for `auth/apps/kartboard*` before or as the Worker is deployed. The Worker does not verify an Access JWT.

The Durable Object `KartBoardRoom` stores state, fans out SSE, and rate-limits PIN attempts. Local `kartboard-state.json` remains the LAN store and is gitignored. `kartboard-state.example.json` is the sample. Controller registration is `node scripts/manage-users.mjs`. Deployment steps are in `docs/DEPLOYMENT.md`. Another agent should read that file, `docs/ACCESS.md`, `docs/CONFIGURATION.md`, and `docs/ARCHITECTURE.md` before changing hosting.

The feature walkthrough video is stored with Git LFS from this version forward. Older commits still contain the blob. Do not rewrite history to move it.

## Current Architecture

### Runtime topology

```text
Public board -- GET/SSE --------┐
                                |
KAC browser -- PIN + POST ------+--> Node (LAN file) or Worker + Durable Object
```

The Node server or the Durable Object is the sole authority. Clients receive complete state snapshots. Public boards are consumers only. Every mutation includes `expectedRevision`.

### Technology choices

- **IMPLEMENTED:** Node.js 20 or newer, CommonJS on the server, ECMAScript modules in the browser.
- **IMPLEMENTED:** Node built-in `http`, `fs`, `path`, and `crypto` modules; browser-native Fetch, EventSource, Pointer Events, dialogs, and DOM APIs.
- **IMPLEMENTED:** plain HTML and CSS; no framework, database, package dependencies, build system, or service worker.
- **Reasoning:** a small dependency-free stack keeps the local POC easy to inspect, copy, start, and recover. SSE matches the one-way server-to-public update pattern better than a more complex bidirectional transport.
- **Constraint:** the absence of dependencies reduces operational setup but leaves production needs such as authentication, durable shared storage, and observability to future work.

### Backend boundaries

- `server.js` — composition root; loads configuration, creates the app, writes the process ID, starts listening, and cleans up its own PID file on normal shutdown.
- `src/config.js` — relocatable runtime paths and environment overrides. Defaults to host `0.0.0.0`, port `4317`, `public/`, `kartboard-state.json`, and `kartboard.pid`.
- `src/domain/state.js` — schema v2, state normalization, legacy migration, stable class IDs, limits, and read selectors.
- `src/domain/reducer.js` — pure state transitions for all supported actions.
- `src/domain/errors.js` — structured domain errors with codes and HTTP status values.
- `src/infrastructure/file-state-repository.js` — load, migrate, temporary-write, backup, and recovery behavior.
- `src/infrastructure/sse-hub.js` — SSE subscribers, complete-state broadcasts, 20-second heartbeat, cleanup, and retry guidance.
- `src/http/create-server.js` — API routes, JSON parsing, 100 KB body limit, static serving, traversal protection, security headers, API metadata, and optimistic revision checks.

Importing the HTTP module does not start a listener, allowing isolated integration tests.

### Frontend boundaries

- `public/index.html` — redirects the server root to the controller.
- `public/control.html` and `public/control.js` — KAC dashboard, dialogs, drafts, workflow orchestration, and action dispatch.
- `public/board.html` and `public/board.js` — view-only public rendering and local countdown display.
- `public/styles.css` — shared responsive visual system and drag/edit states.
- `public/js/api.js` — Fetch/SSE adapter, compatibility check, and structured client errors.
- `public/js/selectors.js` — display-oriented schedule selection, clock formatting, status copy, and browser-generated class IDs.
- `public/js/rotation-editor.js` — reusable touch/pointer editor with drag ghost and placeholder.
- `public/js/dom.js` — safe DOM helpers.
- `public/js/toast.js` — transient controller feedback.

### API and controller/public interaction

- `GET /api/meta` returns API/schema versions and the list of supported actions. The browser requires API version 2.
- `GET /api/state` returns the current public state.
- `POST /api/action` applies a named action and optional payload. Editing can include `expectedRevision`; a mismatch returns HTTP 409.
- `GET /api/events` is a named `state` SSE stream. A subscriber receives the current state immediately, then every accepted change.

After a valid mutation, the server reduces state, increments its revision, saves it, publishes the resulting complete state to SSE clients, and returns the same state to the controller.

Security headers currently include a same-origin Content Security Policy, `nosniff`, and no-referrer policy. These are useful hardening measures but are not a substitute for authentication or HTTPS.

## State and Timing Model

### Schema v2

The persisted state has this conceptual shape:

```json
{
  "schemaVersion": 2,
  "revision": 0,
  "venue": "Ipswich Kart Club",
  "dayLabel": "Saturday Practice",
  "sessionMinutes": 9,
  "rotation": [{ "id": "stable-id", "name": "Cadet P" }],
  "currentClass": { "id": "stable-id", "name": "Cadet P" },
  "nextIndex": 0,
  "status": "ready",
  "startedAt": null,
  "pausedRemainingMs": null,
  "notice": "",
  "updatedAt": 0
}
```

The server also supplies a compatibility `currentIndex` selector. Runtime state in `kartboard-state.json` is mutable practice/test data, not durable product documentation.

### Scheduling invariant

- `currentClass` is a snapshot of the class currently on track.
- `nextIndex` identifies the next entry in `rotation` to run.
- `rotation` is the future cyclic order and may exclude `currentClass`.

Stable `{id, name}` entries, rather than names alone, disambiguate duplicated class names and allow removal of the active class from future rotation without rewriting the live session.

### Supported statuses

- `ready` — configured and waiting for the first start.
- `running` — current class active and countdown decreasing.
- `paused` — current class and remaining time frozen.
- `changeover` — current class retained as context; active timing is stopped; next class shown as upcoming until the KAC advances. The public overlay hides the ordinary timer, while the controller's clock returns to the usual duration.
- `break` — practice paused at day level; resuming the current class starts a full usual-duration session because break does not preserve a partial remaining time.
- `finished` — day closed; starting again begins from the first rotation entry.

### Timing semantics

- Starting or advancing sets a server timestamp and a full usual session duration.
- Browsers calculate remaining time as `duration - (browser now - server startedAt)` and round displayed seconds upward.
- The timer stops visually at `00:00`; it does **not** automatically advance a class or change status. The KAC remains responsible for the next action.
- Pause stores the remaining milliseconds; Resume reconstructs the start timestamp so elapsed time is preserved.
- Add one minute adjusts a running start timestamp or paused remaining value.
- Previous class immediately selects the prior rotation entry and starts a fresh full-duration session.
- Countdown values are communication estimates, not transponder timing.

**Known limitation:** client clocks are assumed to be reasonably aligned with the server computer. There is no server-clock offset calculation, so a device with a materially incorrect clock can show an incorrect countdown.

### Persistence and recovery

`kartboard-state.json` is the primary state. Before a new save, the previous primary file is copied to `kartboard-state.json.backup`; the new state is written through a temporary file. If the primary file is missing or corrupt, the server attempts to recover from the backup and otherwise creates defaults. Older string-based rotations are automatically migrated to schema v2.

This is basic single-machine recovery, not transactional durability. Running more than one server process against the same file is unsupported.

## Running and Developing the Current POC

### Requirements

- Node.js 20 or newer.
- A modern browser.
- For other devices, a trusted local network that permits them to reach the server computer.

No dependency installation is required because `package.json` declares no runtime or development packages.

### Windows convenience launch

From the project root, double-click `Start KartBoard.cmd`. It stops the previously tracked KartBoard process, starts the server hidden, verifies API version 2, and opens the controller. Use `Stop KartBoard.cmd` when finished.

The Windows launcher uses `node` on `PATH` and tells you to install Node.js 20 or newer if it is missing. `npm start` is the same server.

### Cross-platform/manual launch

From a terminal in the project root:

```text
node server.js
```

Then open:

- controller on the server computer: `http://127.0.0.1:4317/control.html`
- public board on the server computer: `http://127.0.0.1:4317/board.html`
- controller from another device: `http://COMPUTER-IP:4317/control.html`
- public board from another device: `http://COMPUTER-IP:4317/board.html`

The default listener is `0.0.0.0:4317`. On Windows, permit Node.js on **Private networks only**. Do not expose port 4317 through router port forwarding.

Environment overrides are available for `KARTBOARD_HOST`, `KARTBOARD_PORT`, `KARTBOARD_STATE_FILE`, and `KARTBOARD_PID_FILE`.

### Tests

```text
npm test
```

`npm test` covers the original domain, migration, file backup, and HTTP cases, plus PIN login, rate limits, Origin checks, required revisions, the Durable Object repository, and hosted base-path routing. There are no automated browser/end-to-end interaction tests. CI runs lint (`tsc --noEmit`), `npm run build`, and `npm test`.

## Deployment and Portability

### Current deployment

**IMPLEMENTED:** Two runtimes. The hosted Worker is the track deployment (`docs/DEPLOYMENT.md`). `npm start` remains the offline LAN server. It needs no cloud account once the network exists.

The project folder can be synchronised through OneDrive, but that does not itself deploy or synchronise a running event. Close the server before moving active use to another computer. Treat `kartboard.pid`, the live JSON state, backup state, and any temporary file as machine/runtime artifacts rather than source-of-truth configuration. Simultaneous OneDrive-backed server use from two computers is unsupported and risks conflicting state files.

### QR status

- `KartBoard-iPhone-QR.png` — public board at `https://designacle.au/auth/apps/kartboard/board.html`.
- `KartBoard-KAC-QR.png` — controller at `https://designacle.au/auth/apps/kartboard/control.html`.
- `KartBoard-QR-Codes.png` — labelled side-by-side presentation of both.

Regenerate with `npm run qr` after a URL change. The old LAN address `192.168.50.131:4317` is no longer encoded.

### Hosted deployment discussion

**IMPLEMENTED:** Hosting is a Cloudflare Worker plus one SQLite Durable Object, on the free plan, at `designacle.au/auth/apps/kartboard*`. See `docs/DEPLOYMENT.md`. The notes below are the requirements that decision satisfied:

Before hosted deployment, the architecture identified the need for:

- authenticated KAC/controller roles and authorisation;
- HTTPS;
- transactional persistent storage;
- club/event/day tenancy;
- audit events;
- rate limiting;
- deployment health monitoring; and
- appropriate backup and recovery policy.

### Multi-track and multi-event

**IMPLEMENTED constraint:** one server process represents one current practice day at one venue. There is no event list, track selector, club account, tenant boundary, or historical archive.

**PROPOSED:** A hosted service could introduce club, venue, track, event, and practice-day identities with isolated state and controller permissions. The required hierarchy, event lifecycle, cross-track workflow, and whether one KAC may control multiple tracks are **OPEN QUESTIONS**.

## Security and Trust Model

### Current trust model

**IMPLEMENTED:** The public board, `GET /api/state`, `GET /api/meta`, and `GET /api/events` are readable with no login. `POST /api/action` requires a PIN session, a same-origin JSON request with `X-KartBoard-Request: 1`, and the caller's `expectedRevision`. See `docs/ACCESS.md`. Hosted transport is HTTPS. Local HTTP is only for a private LAN and does not set the Secure cookie flag.

The earlier open controller (anyone on the LAN who knew `/control.html`) is retired in 0.3.0, including for local mode.

### Existing safeguards

- same-origin client architecture;
- restrictive Content Security Policy for current assets/connections;
- referrer suppression and content-type sniffing prevention;
- static path traversal blocking;
- request-body size limit;
- validated state normalization and action transitions;
- API/schema compatibility check; and
- optimistic concurrency for edits.

These are defensive implementation details, not a production access-control system.

## Constraints, Assumptions, and Known Limitations

- **IMPLEMENTED:** maximum 30 rotation entries; names are trimmed to 40 characters; notice is limited to 140 characters; venue/day labels are limited to 60 characters; session duration is clamped to 1–30 minutes.
- **IMPLEMENTED:** standard quick-add names are Cadet P, Cadet, Junior P, Junior, Senior Restricted, Senior Open, 4SS, and TaG 125. Names remain customisable and are not an authoritative class registry.
- **IMPLEMENTED:** only one current state and one previous backup are retained; there is no history/audit log.
- **IMPLEMENTED:** EventSource receives complete snapshots and retries, but a disconnected controller cannot queue actions offline.
- **IMPLEMENTED:** stale editing saves are rejected, but other single-tap actions do not currently send an expected revision.
- **IMPLEMENTED:** the app has no formal timezone, event date, automatic finish time, lap count, competitor list, transponder, result, or flag/light integration.
- **IMPLEMENTED:** zero countdown does not trigger a transition or notification.
- **IMPLEMENTED:** there are no automated browser tests for drag/long-press behavior, responsive layout, or cross-device reconnection.
- **Known limitation:** launcher and generated-media build scripts contain machine-specific paths. The shipped app source otherwise resolves project files relative to the project root.
- **Known limitation:** generated QR codes are network snapshots and can become stale.
- **Known limitation:** runtime files and generated build-state/PID files are present in the synchronised folder; there is no version-control ignore policy in the current directory.
- The project is the `KartBoard/` directory of the HappyKarts git repository. Early dates before the import commit were reconstructed and are not git history.

## Decisions, Rejected Approaches, and Deferred Ideas

### Important decisions

- **DECIDED:** community benefit and practical usability are the motivation; monetisation is not a goal.
- **DECIDED:** prioritise the KAC's cognitive load and ease of use over feature breadth.
- **DECIDED:** a responsive web system gives the required iPhone/Android/Windows/macOS reach without multiple native apps.
- **DECIDED:** local-first is appropriate for a first trial because it works without internet and avoids premature hosted infrastructure.
- **DECIDED:** public users see status but cannot control it through the public UI.
- **DECIDED:** the KAC manually advances sessions; automation must not assume the track is clear.
- **DECIDED:** mid-session schedule changes affect future flow only.
- **DECIDED:** existing announcements and safety processes remain during the proposed trial.

### Rejected or deliberately deferred

- **Deferred:** on-kart telemetry, lap counting, steering-wheel displays, and safety messages. They expand the risk and integration surface beyond the communication MVP.
- **Rejected for current scope:** positioning KartBoard as official timing or track control.
- **Rejected UX:** text-based running-order editing.
- **Rejected UX:** an always-unlocked running order that increases accidental edits.
- **Deferred:** native iOS/Android applications; the responsive browser experience currently meets cross-platform needs.
- **Deferred:** cloud hosting until authentication, HTTPS, durable storage, and tenancy are designed.
- **Deferred:** multi-club commercialisation. The user explicitly framed this as a non-commercial community project.

### Research history that is not recoverable

The user previously asked whether equivalent systems already exist at Karting Australia tracks and why the apparent gap exists. A current, source-supported market answer is not retained in this project or recoverable conversation context. Do not assert that no such product exists. Treat competitor/club adoption research as an **OPEN QUESTION** and browse current official or primary sources before answering it again.

## Current Unfinished Work and Recommended Next Steps

There is no known unresolved application bug reported after the last controller edit fixes and refactor. The recommended sequence is:

1. **DECIDED / not yet completed:** prepare and conduct a supervised one-day Ipswich practice trial beside normal announcements.
2. Define simple trial measures: repeated-question frequency, KAC effort, whether people could find the board, network stability, and qualitative feedback. The exact measures are an **OPEN QUESTION**.
3. The hard-coded launcher Node path was removed in 0.3.0. `node` must be on `PATH`.
4. Add a repeatable local-IP/QR generation workflow, clearly separating public and controller access.
5. Manually test the current UI on representative iPhone, Android, Windows, and macOS devices, including long press, drag, reconnect, and two-controller revision conflicts.
6. Decide whether the next milestone remains local-only or becomes hosted. If hosted, design identity, roles, HTTPS, tenancy, durable event storage, audit, and operations before implementation.
7. Keep any future telemetry/on-kart concept as a separately scoped exploration unless the communication product's safety boundary is explicitly reconsidered.

## Future Possibilities

The following are not current commitments:

- **PROPOSED:** automatic QR generation for the active local network.
- **PROPOSED:** installable/PWA-style convenience while retaining browser reach.
- **PROPOSED:** authenticated hosted controller access and stable public event links.
- **PROPOSED:** club/event/day history and reusable rotation templates.
- **PROPOSED:** multi-venue or multi-track tenancy.
- **PROPOSED:** audit trail of KAC actions and recovery beyond one backup.
- **PROPOSED:** operational monitoring and more durable real-time infrastructure.
- **PROPOSED:** separately researched kart telemetry and driver display features.

Whether participants need notifications, scheduled ETAs, accessibility modes, or integrations with club timing/race-management systems remains an **OPEN QUESTION**; these were not settled in the recoverable history.

## Generated and Supporting Artifacts

### User-facing pitch material

- `KartBoard-Ipswich-KAC-Pitch.pptx` — editable seven-slide pitch to Russell/the Ipswich KAC. It explains the communication gap, public view, one-tap workflow, flexible rotation, safety boundaries, and a low-risk one-day trial request.
- `KartBoard-Feature-Walkthrough.mp4` — silent, annotated 16:9 feature walkthrough built from 12 scenes. It demonstrates setup, controller use, public display, live changes, notices, order editing, cross-device access, boundaries, and the trial ask.
- `KartBoard-QR-Codes.png` — combined labelled public/KAC QR handout.
- `KartBoard-iPhone-QR.png` — public-board QR snapshot.
- `KartBoard-KAC-QR.png` — controller QR snapshot.

### Generated-media working files

- `deck-output/` — rendered pitch-slide PNGs, montage files, and layout inspection output used for visual QA.
- `.deck-build/` — pitch screenshots, build script, and temporary server state/PID files. The script currently contains machine-specific paths and external authoring-runtime assumptions.
- `.video-build/` — UI captures, 12 annotated scene PNGs, montage, storyboard, manifest, video export script, and temporary server state/PID files. Build/export scripts contain machine-specific paths and rely on authoring tools that are not application dependencies.
- `KartBoard-Ipswich-KAC-Pitch.pptx.inspect.ndjson` — presentation inspection sidecar.

These folders are not required to run KartBoard. The finished presentation, video, and QR images are portable artifacts, subject to the QR address caveat.

### Project documentation and meta files

- `README.md` — concise operator/developer start, network, scope, and safety guidance.
- `docs/ARCHITECTURE.md` — focused implementation architecture and hosted-extension guidance.
- `PROJECT_CONTEXT.md` — persistent product and technical memory.
- `CHANGELOG.md` — reconstructed milestones and current actions.
- `prompt_common.txt` — a copy of the project-memory documentation request; it is not application logic.

## Terminology

- **KAC:** project shorthand for the authorised practice-day controller/official. Exact official title or expansion is unconfirmed.
- **Controller:** the mutable KAC interface at `/control.html`.
- **Public board:** the read-only shared interface at `/board.html`.
- **Class:** a practice group label, not an individual kart or entrant.
- **Rotation / running order:** the cyclic sequence of class entries intended to run in future sessions.
- **Current class:** immutable snapshot for the session presently being communicated; it can remain current even if removed from the future rotation.
- **Next index:** pointer to the next future rotation entry.
- **Session:** one class's period on track, usually discussed as roughly eight or nine minutes.
- **Changeover:** inter-session state after a group is called in and before the next group is started in KartBoard.
- **Out-grid:** staging area for karts waiting to enter the track.
- **In-grid:** return area used as karts leave the track.
- **Approximate time:** communication countdown only, not official timing.

## Product Owner Preferences to Preserve

- Make the KAC experience perfectly intuitive; it is the first design criterion.
- Support iPhone, Android, Windows, and macOS without making device type a configuration concern.
- Use direct manipulation for class order: long press on touch, obvious edit mode, draggable tiles, and a visible pointer affordance.
- Keep adding/removing/reordering close to the main controller while guarding it from accidental edits.
- Show only absent standard classes in quick-add choices.
- Never reset or disturb the active session when the future order changes.
- Keep the public product focused on who is on track, who is next, and approximate remaining time.
- Avoid new safety dependencies or claims of official authority.
- Keep the project community-oriented and non-commercial.
- Prefer a polished, credible experience suitable for inviting the Ipswich KAC to trial it.
