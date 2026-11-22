# Configuration

## Hosted Worker

`wrangler.jsonc` is the deploy config. It is not applied until someone runs `wrangler deploy`.

| Setting | Value |
| --- | --- |
| Worker name | `kartboard` |
| Account | `7912f938c8a8f9ab3f6985fa2ffcd80f` (same account as day-planner) |
| Routes | `designacle.au/auth/apps/kartboard*` and `designacle.au/auth/apps/kartboard-admin*` |
| `workers_dev` | `false` |
| `preview_urls` | `false` |
| Durable Object binding | `KARTBOARD` → class `KartBoardRoom` |
| Migration | `v1`, `new_sqlite_classes: ["KartBoardRoom"]` |
| KV | none |
| D1 | none |

Secrets and variables are not in the repo. The public board works without them. Controller sign-in returns HTTP 503 until `KARTBOARD_SESSION_SECRET` exists and at least one code is registered. Admin returns HTTP 401 until `ACCESS_AUD` is set.

```text
printf %s "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" | npx wrangler secret put KARTBOARD_SESSION_SECRET

# Audience tag from the designacle private apps Access application. Not the KartBoard bypass app.
printf %s "PASTE_AUD_TAG" | npx wrangler secret put ACCESS_AUD

# Optional. Comma-separated. Leave unset to allow every email that Access already allowed.
# An invalid value fails closed.
printf %s "peter@example.com" | npx wrangler secret put ADMIN_EMAILS
```

`ACCESS_AUD` may be a secret or a var. The team domain is `designacle.cloudflareaccess.com`. `ADMIN_EMAILS` is optional; a dashboard variable and a secret both appear as `env.ADMIN_EMAILS`.

`KARTBOARD_USERS` remains a seed. Codes saved by admin are stored in the Durable Object and win when the name matches. The existing Controller entry keeps working until an admin code replaces that name.

```text
node scripts/manage-users.mjs add --name "Controller"
node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS
```

`KARTBOARD_USERS` is JSON:

```json
{ "users": [{ "name": "Controller", "salt": "...", "hash": "...", "iterations": 100000 }] }
```

The normal way to add a controller is the admin page, which generates an 8-character code from `abcdefghijkmnpqrstuvwxyz23456789` (no `0`, `o`, `1`, or `l`). The seed file is still how a numeric code is installed before the first deploy. Changing a seed means `remove`, `add`, then `secret put` again. Admin revoke and regenerate do not edit the secret. Deleting an admin code for a name lets the seed for that name work again.

Sessions store the code id and version. Revoke and regenerate invalidate cookies for that code. Changing only the seed does not invalidate cookies already issued for that seed name; rotating `KARTBOARD_SESSION_SECRET` does.

## Local server

| Variable | Default |
| --- | --- |
| `KARTBOARD_HOST` | `0.0.0.0` |
| `KARTBOARD_PORT` | `4317` |
| `KARTBOARD_STATE_FILE` | `kartboard-state.json` |
| `KARTBOARD_PID_FILE` | `kartboard.pid` |
| `KARTBOARD_BASE_PATH` | empty (site root). Set `/auth/apps/kartboard` to mimic the hosted board paths locally. |
| `KARTBOARD_USERS_FILE` | `kartboard-users.json` |
| `KARTBOARD_USERS` | optional JSON override of the user file |
| `KARTBOARD_ACCESS_CODES_FILE` | `kartboard-access-codes.json` |
| `KARTBOARD_SESSION_SECRET` | optional. Otherwise `kartboard-session.secret` is created on first start. |
| `KARTBOARD_SESSION_SECRET_FILE` | `kartboard-session.secret` |
| `KARTBOARD_ADMIN_TOKEN` | empty. Loopback-only admin. When set, admin requires `Authorization: Bearer` from every client. |
| `KARTBOARD_PIN` | used only by `scripts/manage-users.mjs`, never stored |

`kartboard-state.json`, `kartboard-users.json`, `kartboard-access-codes.json`, and `kartboard-session.secret` are gitignored. `kartboard-state.example.json` is the sample day.

## User list

```text
node scripts/manage-users.mjs add --name "Controller"
node scripts/manage-users.mjs remove --name "Controller"
node scripts/manage-users.mjs list
node scripts/manage-users.mjs export
```

Names are 1–40 characters. Seed PINs are 4–8 digits and must be unique. Admin codes are 8 characters. Hashes use PBKDF2-SHA-256 with a random salt and 100,000 iterations.

## URLs the dashboard should keep

- https://designacle.au/auth/apps/kartboard/board.html
- https://designacle.au/auth/apps/kartboard/control.html
- https://designacle.au/auth/apps/kartboard/help.html
- https://designacle.au/auth/apps/kartboard-admin/admin.html

`/auth/apps/kartboard` and `/auth/apps/kartboard/` redirect to the controller. `/auth/apps/kartboard-admin` and `/auth/apps/kartboard-admin/` redirect to the admin page. Asset and API URLs in the browser are resolved from the page URL, so the same HTML works at the hosted prefix and at the local server root.
