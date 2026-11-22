# KartBoard

KartBoard is a real-time practice-session board for a kart club. One controller (the KAC) manages the running order. Public boards on phones, tablets, or a paddock display update live.

The hosted app is the one to use at the track:

- Public board: https://designacle.au/auth/apps/kartboard/board.html
- Controller: https://designacle.au/auth/apps/kartboard/control.html

The public board needs no login. The controller asks for a name and PIN on that device, then keeps a long-lived cookie. KartBoard is communication only. Lights, flags, officials, and announcements stay authoritative.

A local server is still available for a paddock with no internet. See [Local network](#local-network).

## Controller access

PINs are not stored in git. On a computer with this project:

```text
node scripts/manage-users.mjs add --name "Russell"
node scripts/manage-users.mjs list
```

The PIN is read from the `KARTBOARD_PIN` environment variable or from a prompt. It is not accepted as a command argument. For the hosted Worker, upload the same file as a secret:

```text
node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS
```

Details are in [docs/CONFIGURATION.md](docs/CONFIGURATION.md), [docs/ACCESS.md](docs/ACCESS.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Development

```text
npm install
npm test
npm run typecheck
npm run build
npm start
```

`npm test` covers the domain, the file repository, PIN login, rate limits, Origin checks, revision conflicts, the Durable Object storage adapter, and hosted base-path routing. `npm run build` bundles the Worker with `wrangler deploy --dry-run` and does not deploy. `npm run typecheck` is `tsc --noEmit` with `checkJs`.

## Local network

```text
npm start
```

or double-click **Start KartBoard.cmd** on Windows. The launcher uses `node` on `PATH` (Node.js 20 or newer).

- Controller on this computer: http://127.0.0.1:4317/control.html
- Public board on this computer: http://127.0.0.1:4317/board.html
- Another device: `http://COMPUTER-IP:4317/board.html` or `control.html`

Local mode uses the same PIN login and revision checks. The session cookie is `HttpOnly` and `SameSite=Strict`. Browsers omit `Secure` on plain `http://`, which is what a LAN address is. The hosted site sets `Secure` because it is HTTPS.

Allow Node.js on **Private networks** only. Do not forward port 4317.

State is stored in `kartboard-state.json` (gitignored) with one backup. `kartboard-state.example.json` shows the shape. If the file is missing, the server starts from the default Ipswich practice day.

## QR codes

`KartBoard-iPhone-QR.png`, `KartBoard-KAC-QR.png`, and `KartBoard-QR-Codes.png` point at the hosted board and controller. Regenerate them with `npm run qr`.

## Scope

KartBoard shares approximate practice-day sequencing only. It is not official timing or track control.
