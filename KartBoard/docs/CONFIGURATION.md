# Configuration

## Hosted Worker

`wrangler.jsonc` is the deploy config. It is not applied until someone runs `wrangler deploy`.

| Setting | Value |
| --- | --- |
| Worker name | `kartboard` |
| Account | `7912f938c8a8f9ab3f6985fa2ffcd80f` (same account as day-planner) |
| Route | `designacle.au/auth/apps/kartboard*` |
| `workers_dev` | `false` |
| `preview_urls` | `false` |
| Durable Object binding | `KARTBOARD` → class `KartBoardRoom` |
| Migration | `v1`, `new_sqlite_classes: ["KartBoardRoom"]` |
| KV | none |
| D1 | none |

Secrets are not in the repo. Set them with Wrangler before the first real request that needs them. The public board works without secrets; login returns HTTP 503 until both exist.

```text
# 32+ random bytes. Do not commit this.
printf %s "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" | npx wrangler secret put KARTBOARD_SESSION_SECRET

node scripts/manage-users.mjs add --name "Russell"
node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS
```

`KARTBOARD_USERS` is JSON:

```json
{ "users": [{ "name": "Russell", "salt": "...", "hash": "...", "iterations": 100000 }] }
```

Changing a PIN means `remove`, `add`, then `secret put` again. The Worker reads the secret on each request to the Durable Object; a new secret value is picked up without a code deploy, but existing session cookies stay valid until they expire unless `KARTBOARD_SESSION_SECRET` changes.

## Local server

| Variable | Default |
| --- | --- |
| `KARTBOARD_HOST` | `0.0.0.0` |
| `KARTBOARD_PORT` | `4317` |
| `KARTBOARD_STATE_FILE` | `kartboard-state.json` |
| `KARTBOARD_PID_FILE` | `kartboard.pid` |
| `KARTBOARD_BASE_PATH` | empty (site root). Set `/auth/apps/kartboard` to mimic the hosted paths locally. |
| `KARTBOARD_USERS_FILE` | `kartboard-users.json` |
| `KARTBOARD_USERS` | optional JSON override of the user file |
| `KARTBOARD_SESSION_SECRET` | optional. Otherwise `kartboard-session.secret` is created on first start. |
| `KARTBOARD_SESSION_SECRET_FILE` | `kartboard-session.secret` |
| `KARTBOARD_PIN` | used only by `scripts/manage-users.mjs`, never stored |

`kartboard-state.json`, `kartboard-users.json`, and `kartboard-session.secret` are gitignored. `kartboard-state.example.json` is the sample day.

## User list

```text
node scripts/manage-users.mjs add --name "Russell"
node scripts/manage-users.mjs remove --name "Russell"
node scripts/manage-users.mjs list
node scripts/manage-users.mjs export
```

Names are 1–40 characters. PINs are 4–8 digits and must be unique. Hashes use PBKDF2-SHA-256 with a random salt and 100,000 iterations.

## URLs the dashboard should keep

- https://designacle.au/auth/apps/kartboard/board.html
- https://designacle.au/auth/apps/kartboard/control.html

`/auth/apps/kartboard` and `/auth/apps/kartboard/` redirect to the controller. Asset and API URLs in the browser are resolved from the page URL, so the same HTML works at the hosted prefix and at the local server root.
