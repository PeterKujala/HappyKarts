# Access model

KartBoard has two audiences. They are enforced in the Worker and in the local Node server, not by trusting Cloudflare Access headers.

## Public board

Anyone who can open the URL can view the board. No PIN, no Cloudflare Access login, and no cookie.

Public, read-only routes under `/auth/apps/kartboard`:

- `GET` or `HEAD` `/board.html` and the shared static files (`styles.css`, `board.js`, `js/*`)
- `GET` or `HEAD` `/api/meta`
- `GET` or `HEAD` `/api/state`
- `GET` or `HEAD` `/api/events` (Server-Sent Events)

`POST` to those paths is rejected. The public page has no controls that change the day. A person who can see the board still cannot call `/api/action` successfully.

## Controller

The controller page is also reachable without Cloudflare Access, so the PIN pad can load on a phone that is not in an Access allow-list. Changing the day requires all of the following:

1. A registered name and PIN (`POST /api/login`).
2. A valid `kartboard_session` cookie: HMAC-SHA256, `HttpOnly`, `SameSite=Strict`, `Path=/auth/apps/kartboard`, `Secure` on HTTPS, about 180 days.
3. `POST /api/action` from the same origin, with `Content-Type: application/json` and the header `X-KartBoard-Request: 1`.
4. `expectedRevision` equal to the revision the controller last saw. A missing revision is HTTP 400. A stale revision is HTTP 409. The controller then reloads state and shows a refresh banner.

PINs are salted PBKDF2-SHA-256 hashes (100,000 iterations in the management script). Failed attempts are limited to 8 per 15 minutes for the client IP and for the submitted name. The name of the signed-in controller is stored as `updatedBy` on the practice-day state.

Logout is `POST /api/logout` with the same Origin and header checks. It clears the cookie.

This is a club PIN, not a high-assurance identity system. Anyone who knows a registered PIN can control the day. That is intentional: it stays usable in the paddock.

## Cloudflare Access change Peter must make

The existing Access application **designacle private apps** protects `designacle.au/auth/apps/*` (passkey, email OTP, or a Cloudflare account). That would stop paddock phones from opening the public board. KartBoard does not verify an Access JWT, because this app must not depend on Access.

Add a **more specific** self-hosted Access application so this prefix bypasses Access. Cloudflare chooses the most specific matching application, so this does not open day-planner or the rest of `/auth/apps/*`.

1. Open https://one.dash.cloudflare.com/ → **Access controls** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `KartBoard`.
3. Session duration can stay at the default. Bypass does not issue a login.
4. Public hostname:
   - Domain: `designacle.au`
   - Subdomain: leave empty (the apex)
   - Path: `auth/apps/kartboard*`
5. Add a policy named `KartBoard bypass`:
   - Action: **Bypass**
   - Include: **Everyone**
6. Do not add an Allow or Block policy on this application.
7. Create the application. In the application overview, confirm the path is `designacle.au/auth/apps/kartboard*` and that it is more specific than `designacle private apps` (`designacle.au/auth/apps/*`).

A bypass of only `/board*` is not enough. The board also requests `styles.css`, `js/*`, `/api/state`, and `/api/events`, and the controller itself must skip Access. The Worker still refuses every mutation without a PIN session.

After it is in place, a private window on the public board must show the board immediately, not the Cloudflare Access login. The controller must show the PIN pad, not the Access login.

No Access audience (AUD) tag is required. There is no JWT check to configure.

## What stays behind Access

`designacle.au/auth/apps/day-planner*` and every other path under `/auth/apps/` except KartBoard stay on **designacle private apps**. The public website on Cloudflare Pages is unchanged.
