# KartBoard Changelog

Entries from 22 November 2026 onward match git history in the HappyKarts repository. Earlier entries were reconstructed before that import, so their exact edit order is not a git log.

## 2026-11-22 — 0.4.2 admin list shows access codes

- The admin list shows each code beside its name, with copy and a show/hide toggle. Codes stay shown until Hide is tapped. Verification still uses the PBKDF2 hash.
- The code is also stored with AES-GCM. The key is HKDF-SHA-256 from `KARTBOARD_CODE_KEY` (info `kartboard.code-key.v1`). If that secret is unset, the key is derived from `KARTBOARD_SESSION_SECRET` with info `kartboard.session-secret.code.v1`.
- Codes saved before this change, seed entries from `KARTBOARD_USERS`, and codes that cannot be decrypted show **Hidden — regenerate to view**. Regenerating stores a new sealed code.

## 2026-11-22 — 0.4.1 session control rows

- The session buttons are four equal two-up rows on phone and desktop: Pause and Continue, Advance by 1 minute and Add 1 minute, Previous class and Next class, Changeover and Take a break.
- Continue is the existing resume action, labeled Continue. Next class is the existing next action. No new reducer action was added. Finish day stays under those rows. The large button under the clock still starts the first session.

## 2026-11-22 — 0.4.0 admin access codes, Show me, and advance minute

- Admin creates, lists, revokes, and regenerates controller codes. The code is an 8-character string from `a-z` and `2-9` with `0`, `o`, `1`, and `l` left out. It is shown once. Later lists show the name, created time, and last used. Hashes are PBKDF2-SHA-256 in the Durable Object. `KARTBOARD_USERS` remains a seed and loses to a Durable Object code with the same name.
- The controller sign-in card is code only. There is no name field. The server finds the name, and the page says **Signed in as** that controller. Older callers can still send a name with a code or numeric PIN. Revoke and regenerate invalidate sessions for that code.
- Admin is served at `/auth/apps/kartboard-admin/*` on the same Worker, behind **designacle private apps**. The Worker verifies `Cf-Access-Jwt-Assertion` for team `designacle.cloudflareaccess.com` and `ACCESS_AUD`, and fails closed when the audience is missing. `ADMIN_EMAILS` is an optional allow-list. The bypass for the public board must be `auth/apps/kartboard` and `auth/apps/kartboard/*`, not `auth/apps/kartboard*`, so it does not cover admin. Local admin is loopback-only unless `KARTBOARD_ADMIN_TOKEN` is set.
- **Instructions** opens `/help.html`. **Show me** explains every control and does not send a mutation, including before sign-in. The choice is remembered in `localStorage`.
- **Advance by 1 minute** shortens the current session by one minute, the opposite of **+ 1 minute** on the same `startedAt` or `pausedRemainingMs` fields. The clock stops at zero. It uses the normal session, Origin, header, and `expectedRevision` path, so the public board updates with the next state.
- Do not deploy from this change.

## 2026-11-22 — 0.3.0 hosted board and controller PIN

- Serve KartBoard from a Cloudflare Worker at `designacle.au/auth/apps/kartboard*`, with `workers.dev` and preview URLs off. Static files use that base path. `/board.html` and `/control.html` are the public and controller URLs.
- Keep the domain reducer, schema migration, and revision rules. Local mode still uses `kartboard-state.json`. The hosted store is one SQLite Durable Object.
- Leave the public board, state, metadata, and SSE readable with no login. Require a registered PIN, a signed HttpOnly cookie, a same-origin JSON header, and `expectedRevision` on every mutation. Rate-limit PIN attempts. Record `updatedBy`.
- Document the Cloudflare Access bypass Peter must add for `auth/apps/kartboard*`, plus the Worker route, Durable Object binding, and secrets. Do not deploy from this change.
- Stop tracking live state. Ship `kartboard-state.example.json`. Point QR codes at the hosted URLs. Drop the hard-coded Node path from the Windows launcher.
- Store the feature walkthrough with Git LFS from this commit forward, without rewriting older history.
- Add a proprietary licence, GitHub Actions for lint, build, and test, and `tsc --noEmit`.

## 2026-08-28 — Persistent project memory

- Added `PROJECT_CONTEXT.md` as the portable product, architectural, operational, and decision record for future development sessions.
- Added this reconstructed changelog and a maintained next-actions section.
- Audited the application, tests, documentation, QR assets, pitch deck, feature video, and their working files without changing application source.
- Re-ran the automated suite: all 16 tests passed.
- Recorded portability gaps in the Windows launcher, generated-media scripts, runtime files, and static QR codes.

## 2026-08-28 — KAC pitch and annotated feature walkthrough

- Created `KartBoard-Ipswich-KAC-Pitch.pptx`, a seven-slide, screenshot-led pitch aimed at Russell/the Ipswich KAC.
- Framed the proposal as a low-risk one-day trial beside normal announcements, with no change to official track procedure.
- Created `KartBoard-Feature-Walkthrough.mp4`, a silent annotated walkthrough assembled from 12 feature scenes.
- Demonstrated pre-practice setup, one-tap advancement, public-board updates, quick controls, paddock notices, mid-session reorder, responsive phone use, QR access, and safety boundaries.
- Retained rendered slides, screenshots, scene images, layouts, montage files, storyboard, manifest, and build/export tooling in `deck-output/`, `.deck-build/`, and `.video-build/` for later revision.

## 2026-08-23 — Architecture and maintainability refactor

- Reorganised the Node server around explicit domain, HTTP, infrastructure, and configuration boundaries.
- Isolated pure state transitions in `src/domain/reducer.js` and schema/normalisation behavior in `src/domain/state.js`.
- Introduced schema v2 class records with stable IDs so duplicate names and active-class removal are unambiguous.
- Established the central scheduling invariant: current class is a snapshot, while `rotation` and `nextIndex` govern future cyclic flow.
- Added automatic migration from legacy string rotations.
- Added file persistence with temporary writes, prior-state backup, and recovery from a corrupt primary file.
- Added Server-Sent Event client management, heartbeat messages, reconnect guidance, and complete-state broadcasts.
- Added API/schema metadata, structured errors, a request-size limit, static traversal protection, security headers, and optimistic revision conflicts.
- Split browser concerns into API, selectors, rotation editor, DOM, toast, controller, and public-board modules.
- Added automated reducer, state, repository, and HTTP integration tests.
- Documented architecture and hosted-deployment requirements in `docs/ARCHITECTURE.md`.

## 2026-08-23 — Running-order editing refinement

- Moved live running-order editing onto the main KAC controller page.
- Locked the order by default to reduce accidental changes.
- Replaced text-based ordering with draggable class tiles.
- Added iPhone-style long press to enter a visibly distinct edit mode and a visible handle for mouse users.
- Added a floating drag ghost and stable placeholder to reduce drag flicker and insertion jumps.
- Limited standard quick-add choices to classes not already present.
- Supported custom additions and removal during live editing.
- Preserved the current class, timer, and session status when future order changes.
- Ensured removing the active class affects only later rotations.
- Corrected the dashboard order not refreshing after save.
- Corrected the `Done` button sending an unsupported action and producing an `Unknown action` error.

## 2026-08-23 — Local-network access and QR artifacts

- Confirmed that the browser-based POC can be opened from phones and tablets on the same network as the server computer.
- Added Windows start/stop launchers and private-network guidance.
- Created separate public-board and KAC-controller QR images plus a labelled side-by-side version.
- Established that the QR targets are role-specific: public access is view-only; controller access can mutate the day.
- Identified that local-network changes require regenerated QR codes; runtime QR generation was not added.

## Earlier 2026 prototype phase — KAC workflow and responsive board

- Built the local Node.js POC with a responsive KAC controller and public board.
- Added venue, practice label, usual duration, and arbitrary class configuration before the first session.
- Added current, next, and following class displays with an approximate countdown.
- Added one-tap first-session/start-next workflow.
- Added pause/resume, add-minute, changeover, previous-class, break, finish-day, and short paddock-notice controls.
- Added live browser updates and local JSON state persistence.
- Chose a browser-based interface so the same system works on iPhone, Android, Windows, and macOS.
- Kept public mutation controls out of the public board.

## Initial product definition — date not recoverable

- Began with a broader concept covering a steering-wheel phone display, real-time kart data visualisation, lap/session information, track status, and possible safety information.
- Documented the practice-day communication problem observed at Ipswich, Toowoomba, and Lockyer Valley: spoken updates are easy to miss while people prepare karts, and some venues provide little persistent session information.
- Identified the essential paddock questions: who is on track, who is next, and approximately how long remains.
- Deliberately narrowed the MVP to practice-session communication to avoid telemetry hardware, formal timing, driver-distraction, safety, and operational dependencies.
- Established that KartBoard should augment the KAC and existing procedures rather than replace lights, flags, officials, announcements, or judgement.
- Established a non-commercial, community-benefit motivation.

## Current Work / Next Actions

1. Prepare a supervised one-day Ipswich practice trial alongside normal announcements and agree simple success measures with the KAC.
2. Remove or replace the machine-specific bundled Node path in the Windows launcher and verify startup on a second Windows computer with a normal Node.js installation.
3. Add a repeatable local-IP and QR-generation workflow so public and controller codes can be refreshed for each network.
4. Perform a manual cross-device test matrix covering iPhone, Android, Windows, and macOS; include long press, drag/reorder, reconnect, and concurrent-controller conflict handling.
5. Collect trial feedback before expanding the feature set.
6. Decide whether the next deployment remains local-only or becomes hosted. A hosted version first needs authentication/roles, HTTPS, transactional persistence, club/event tenancy, audit history, rate limiting, monitoring, and a current low-cost provider evaluation.
7. Keep any future telemetry or steering-wheel display as a separately scoped exploration unless the current communication-only safety boundary is deliberately changed.
