# Access model

KartBoard has three audiences. The public board and the controller are not behind Cloudflare Access. Admin is.

## Public board

Anyone who can open the URL can view the board and the controller instructions. No code, no Cloudflare Access login, and no cookie.

Public, read-only routes under `/auth/apps/kartboard`:

- `GET` or `HEAD` `/board.html`, `/help.html`, and the shared static files (`styles.css`, `board.js`, `control.js`, `js/*`)
- `GET` or `HEAD` `/api/meta`
- `GET` or `HEAD` `/api/state`
- `GET` or `HEAD` `/api/events` (Server-Sent Events)

`POST` to those paths is rejected. The public page has no controls that change the day.

## Controller

The controller page is reachable without Cloudflare Access, so a paddock phone can open the sign-in card. The card has one field: **Enter your access code**. There is no name picker. The server hashes the code and finds the matching controller. After a match the page says **Signed in as** that name.

Letters and digits are accepted. Older numeric codes still work. The optional `name` field on `POST /api/login` remains for callers that already send a name with a code. The controller screen does not send it.

Changing the day requires all of the following:

1. A code that matches a registered controller (`POST /api/login`).
2. A valid `kartboard_session` cookie: HMAC-SHA256, `HttpOnly`, `SameSite=Strict`, `Path=/auth/apps/kartboard`, `Secure` on HTTPS, about 180 days. The cookie carries the code id and version.
3. `POST /api/action` from the same origin, with `Content-Type: application/json` and the header `X-KartBoard-Request: 1`.
4. `expectedRevision` equal to the revision the controller last saw. A missing revision is HTTP 400. A stale revision is HTTP 409. The controller then reloads state and shows a refresh banner.

Codes are salted PBKDF2-SHA-256 hashes (100,000 iterations). Failed attempts are limited to 8 per 15 minutes for the client IP and for the submitted name, or for that code when no name is sent. The signed-in name is stored as `updatedBy`.

Revoking or regenerating a code bumps or removes that id and version, so cookies from the old code stop working.

Logout is `POST /api/logout` with the same Origin and header checks. It clears the cookie on this device only.

**Show me**, at the top of the controller, explains each control and does not send a change. It works before sign-in. The choice is stored in `localStorage` on that device.

This is a club code, not a high-assurance identity system. Anyone who knows a registered code can control the day.

## Admin

Admin creates the codes. It is not on the bypassed KartBoard path.

- Page: `https://designacle.au/auth/apps/kartboard-admin/admin.html`
- API: `https://designacle.au/auth/apps/kartboard-admin/api/admin/*`
- `https://designacle.au/auth/apps/kartboard/admin.html` only redirects to the protected page. The API is not served on the bypassed prefix.

The Worker verifies `Cf-Access-Jwt-Assertion` with the team JWKS from `https://designacle.cloudflareaccess.com/cdn-cgi/access/certs`. The audience must equal the `ACCESS_AUD` secret or variable. If `ACCESS_AUD` is missing, admin fails closed. `Cf-Access-Authenticated-User-Email` is accepted only when it matches the email inside the token.

`ADMIN_EMAILS` is optional. When set, it is a comma-separated allow-list. An invalid value fails closed. When unset, any account that can pass the Access application for this path may manage codes.

Mutations also require the same Origin and `X-KartBoard-Request` checks as the controller. The admin list decrypts each sealed code and shows it beside the name, with copy and show/hide. Sign-in still checks the PBKDF2 hash and does not need the sealing key. A code with no ciphertext, or one that does not decrypt with the current key, is shown as **Hidden — regenerate to view**.

## Cloudflare Access changes Peter must make

The existing Access application **designacle private apps** protects `designacle.au/auth/apps/*`. A more specific **Bypass** application must keep the public board and the controller off that login. The bypass path must not also cover admin.

`auth/apps/kartboard*` matches `auth/apps/kartboard-admin` as well, because `*` continues through `-admin`. That would bypass Access for admin, and the Worker would then reject the page because no Access JWT is present. Narrow the bypass:

1. Open https://one.dash.cloudflare.com/ → **Access controls** → **Applications** → the KartBoard bypass application (or add one if it is not there yet).
2. Application name: `KartBoard`.
3. Public hostnames on `designacle.au`, subdomain empty:
   - Path: `auth/apps/kartboard`
   - Path: `auth/apps/kartboard/*`
4. Do not add `auth/apps/kartboard*` and do not add `auth/apps/kartboard-admin`.
5. Policy `KartBoard bypass`: action **Bypass**, include **Everyone**. No Allow or Block policy on this application.

Leave **designacle private apps** on `designacle.au/auth/apps/*`. That application is less specific than the bypass, so the board and controller stay open, and `designacle.au/auth/apps/kartboard-admin*` stays on the private app. Do not add a separate bypass for admin.

The Worker route `designacle.au/auth/apps/kartboard-admin*` is on the same `kartboard` Worker. It is covered by **designacle private apps**, not by the KartBoard bypass.

Copy the **Application Audience (AUD)** tag from **designacle private apps** into the Worker secret `ACCESS_AUD`. A bypass application does not issue the JWT this check expects.

After it is in place, in a private window:

- `https://designacle.au/auth/apps/kartboard/board.html` shows the board with no Access login.
- `https://designacle.au/auth/apps/kartboard/control.html` shows the access-code field, not the Access login.
- `https://designacle.au/auth/apps/kartboard-admin/admin.html` shows the Access login.
- `https://designacle.au/auth/apps/day-planner/` still asks for Access.

## Local admin

`npm start` serves the same admin API on this computer. With no `KARTBOARD_ADMIN_TOKEN`, only a loopback client can call it. Set the token to use admin from another device on the LAN; the token is then required from every address, including this computer. Send it as `Authorization: Bearer …`.

## What stays behind Access

`designacle.au/auth/apps/day-planner*` and every other path under `/auth/apps/` except the narrowed KartBoard bypass stay on **designacle private apps**. The public website on Cloudflare Pages is unchanged.
