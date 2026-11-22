# Deployment

Do not deploy until the Access bypass in [ACCESS.md](ACCESS.md) is narrowed and `ACCESS_AUD` is ready. This repository does not deploy itself.

## What gets deployed

A Cloudflare Worker named `kartboard` on account `7912f938c8a8f9ab3f6985fa2ffcd80f`, routes:

- `designacle.au/auth/apps/kartboard*`
- `designacle.au/auth/apps/kartboard-admin*`

`workers.dev` and preview URLs are off, matching day-planner. The public site stays on Cloudflare Pages. These routes are more specific than the Pages site, so only these prefixes move to the Worker.

State, live updates, sign-in rate limits, and access-code hashes live in one SQLite-backed Durable Object, `KartBoardRoom`, binding `KARTBOARD`. The migration tag `v1` creates that class on the first deploy. There is no KV namespace and no D1 database to create beforehand. Workers Free includes SQLite Durable Objects. A later deploy does not add a second migration; the same class stores the `accessCodes` key.

While public boards are connected, the object stays awake to push Server-Sent Events and sends a heartbeat every 20 seconds. Duration is shared by every connection to that one object. A practice day fits the free daily duration allowance. When the last client leaves, the heartbeat stops and the object can hibernate. The practice-day JSON and the code hashes are stored in the object's storage and survive hibernation. The domain reducer, schema migration, and revision counter are the same code the local file repository uses.

## One-time setup

1. Narrow the KartBoard Access bypass to `auth/apps/kartboard` and `auth/apps/kartboard/*`, as in [ACCESS.md](ACCESS.md). Leave `kartboard-admin` on **designacle private apps**.
2. From `KartBoard/`:

```text
npm install
npm test
npm run typecheck
npm run build
```

`npm run build` is `wrangler deploy --dry-run`. It bundles only.

3. Create secrets (see [CONFIGURATION.md](CONFIGURATION.md)):

```text
printf %s "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" | npx wrangler secret put KARTBOARD_SESSION_SECRET
printf %s "PASTE_AUD_TAG" | npx wrangler secret put ACCESS_AUD
node scripts/manage-users.mjs add --name "Controller"
node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS
```

`ACCESS_AUD` is the audience tag on **designacle private apps**. Optional: `ADMIN_EMAILS`. Optional: `KARTBOARD_CODE_KEY`, a separate secret for sealing access codes. If you skip it, codes are sealed with a key derived from `KARTBOARD_SESSION_SECRET`. See [CONFIGURATION.md](CONFIGURATION.md).

4. Deploy when you mean to:

```text
npx wrangler deploy
```

The API token needs Workers Scripts Edit, Workers Routes Edit on zone `designacle.au`, Account Read, and Durable Objects permission (included with Workers Scripts on current accounts). A successful deploy lists both routes and the `env.KARTBOARD (KartBoardRoom)` Durable Object. It must not list a `workers.dev` URL.

5. Check, in a private window:
   - https://designacle.au/auth/apps/kartboard/board.html opens with no Access login.
   - https://designacle.au/auth/apps/kartboard/help.html opens with no Access login.
   - https://designacle.au/auth/apps/kartboard/control.html shows **Enter your access code**, not an Access login and not a name list.
   - https://designacle.au/auth/apps/kartboard-admin/admin.html asks for Access. After login, generate a code, copy it, and sign the controller in with that code alone. The controller says **Signed in as** the name you entered.
   - A wrong code is rejected. After a correct code, Start changes the public board. Revoke on the admin page signs that device out of further changes.
   - https://designacle.au/auth/apps/day-planner/ still asks for Access.

## Cost guardrails

Stay on Workers Free. Do not enable Workers Paid, Logpush, or a KV/D1 database for this app. Free-plan limits that matter here: 100,000 Worker requests per day, and for the Durable Object 100,000 requests per day plus 13,000 GB-s of duration per day. Exceeding a free limit fails the operation rather than billing. One club practice day, with the boards sharing a single object, stays inside that duration budget. Sign-in attempts are rate limited in the object as well as by these platform limits.

## Local mode

`npm start` keeps working for a LAN without Cloudflare. It uses `kartboard-state.json` and `kartboard-access-codes.json` instead of the Durable Object. Admin is http://127.0.0.1:4317/admin.html. See the README.
