# KartBoard

KartBoard is a local-first, real-time practice-session board for kart clubs. One KAC controller manages the running order while public boards on phones, tablets or displays update immediately.

It requires no internet connection, cloud account or installation. Devices only need to share the same local network.

## Start and stop

Double-click **Start KartBoard.cmd**. The launcher:

1. Stops the previously tracked KartBoard process, if present.
2. Starts the current server in the background.
3. Confirms that the browser and server use the same API version.
4. Opens the KAC controller.

Double-click **Stop KartBoard.cmd** when finished.

The server can also be run from a terminal with `node server.js`.

## Addresses

- Controller on this computer: http://127.0.0.1:4317/control.html
- Public board on this computer: http://127.0.0.1:4317/board.html
- Phone or tablet: `http://COMPUTER-IP:4317/board.html`
- KAC phone or tablet: `http://COMPUTER-IP:4317/control.html`

Windows may ask whether to allow Node.js through the firewall. Allow **Private networks** only. Do not forward port 4317 through a router or use this prototype on an untrusted public network.

## Development

```text
node --test
node server.js
```

The application uses only Node.js built-ins and browser-native APIs. There is no dependency installation or build step.

## State and recovery

Live state is stored in `kartboard-state.json`. The repository automatically migrates older state, maintains stable class IDs and keeps the prior write in `kartboard-state.json.backup`. A temporary file is used during saves to reduce the risk of partial JSON.

## Scope

KartBoard communicates approximate practice-day sequencing only. It is not official timing or track control. Physical lights, flags, officials and announcements remain authoritative.

This POC deliberately has no controller authentication. Anyone on the same network who knows the controller address can operate it. Authentication is required before deployment on a shared or untrusted network.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and extension guidance.

## OpenAI-hosted MVP

The `hosted/` directory contains the internet-accessible OpenAI Sites edition. It keeps the public board read-only, protects controller actions with a server-side access key, and stores live session state in managed D1 storage.

For local development and deployment details, see [hosted/README.md](hosted/README.md).
