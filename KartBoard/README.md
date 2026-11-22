# KartBoard

KartBoard is a real-time practice-session board for a kart club. One controller (the KAC) manages the running order. Public boards on phones, tablets, or a paddock display update live.

The hosted app is the one to use at the track:

- Public board: https://designacle.au/auth/apps/kartboard/board.html
- Controller: https://designacle.au/auth/apps/kartboard/control.html

The public board needs no login. The controller asks for an access code only. KartBoard finds the matching name and the page says **Signed in as** that controller. Instructions are on the controller via **Instructions**, and **Show me** explains each control without changing the day. **Advance by 1 minute** brings the current session forward so it ends one minute sooner. **+ 1 minute** still adds time. KartBoard is communication only. Lights, flags, officials, and announcements stay authoritative.

A local server is still available for a paddock with no internet. See [Local network](#local-network).

## Controller access

Create codes on the admin page. Hosted, that page is https://designacle.au/auth/apps/kartboard-admin/admin.html and it requires the existing Cloudflare Access login. The code is shown once. Lists after that show the name, when it was created, and when it was last used.

`KARTBOARD_USERS` is still a seed. A name in the Durable Object replaces the seed with the same name. The existing Controller seed keeps working until then.

```text
node scripts/manage-users.mjs add --name "Controller"
node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS
```

The seed PIN is read from `KARTBOARD_PIN` or from a prompt. It is not accepted as a command argument. Details are in [docs/CONFIGURATION.md](docs/CONFIGURATION.md), [docs/ACCESS.md](docs/ACCESS.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Development

```text
npm install
npm test
npm run typecheck
npm run build
npm start
```

`npm test` covers the domain, the file repository, code login, admin codes, Access JWT rejection, rate limits, Origin checks, revision conflicts, Show me, the Durable Object storage adapter, and hosted routing. `npm run build` bundles the Worker with `wrangler deploy --dry-run` and does not deploy. `npm run typecheck` is `tsc --noEmit` with `checkJs`.

## Local network

```text
npm start
```

or double-click **Start KartBoard.cmd** on Windows. The launcher uses `node` on `PATH` (Node.js 20 or newer).

- Controller on this computer: http://127.0.0.1:4317/control.html
- Public board on this computer: http://127.0.0.1:4317/board.html
- Instructions: http://127.0.0.1:4317/help.html
- Admin on this computer: http://127.0.0.1:4317/admin.html
- Another device: `http://COMPUTER-IP:4317/board.html` or `control.html`

Local mode uses the same code login and revision checks. Admin on this computer does not need a token. Set `KARTBOARD_ADMIN_TOKEN` before opening admin from another device. The session cookie is `HttpOnly` and `SameSite=Strict`. Browsers omit `Secure` on plain `http://`, which is what a LAN address is. The hosted site sets `Secure` because it is HTTPS.

Allow Node.js on **Private networks** only. Do not forward port 4317.

State is stored in `kartboard-state.json` (gitignored) with one backup. `kartboard-state.example.json` shows the shape. If the file is missing, the server starts from the default Ipswich practice day.

## QR codes

`KartBoard-iPhone-QR.png`, `KartBoard-KAC-QR.png`, and `KartBoard-QR-Codes.png` point at the hosted board and controller. Regenerate them with `npm run qr`.

## Scope

KartBoard shares approximate practice-day sequencing only. It is not official timing or track control.
