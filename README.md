# voicemod-v2

Voicemod-style client + deploy-ready Cloudflare Worker server.

## Features

### Client
- Preset voice changers (`Clean`, `Radio`, `Demon`, `Robot`, `Cave`)
- Soundboard buttons with real audio uploads (`Airhorn`, `Beep Beep`, `Applause`)
- Runtime settings (`Master gain`, `Monitor gain`, `Soundboard gain`) persisted in local storage
- Mixed output stream exposed as `window.voicemodOutputStream`

### Server (Cloudflare Worker)
- Account APIs (register, login, current user)
- Token-authenticated uploads API
- User settings + user presets APIs
- Library summary endpoint
- Uses Durable Objects storage and is configured in-repo (no extra service provisioning files required)

## Prerequisites

- Node.js 18+
- Python 3 (for client dev server)
- Cloudflare account (for Worker deploy)

## Client Run (dev)

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run dev
```

Then open <http://localhost:8080>.

## Build

Build both outputs:

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run build
```

Artifacts:
- Client static bundle: `/home/runner/work/voicemod-v2/voicemod-v2/dist`
- Server source bundle: `/home/runner/work/voicemod-v2/voicemod-v2/dist-server`

## Cloudflare Worker server

Server source lives in:

- `/home/runner/work/voicemod-v2/voicemod-v2/worker/src/index.js`
- `/home/runner/work/voicemod-v2/voicemod-v2/worker/wrangler.toml`

### Deploy (no extra repo setup required)

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2/worker
npm run deploy
```

Optional recommended secret (for stronger token signing):

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2/worker
npx wrangler secret put AUTH_SECRET
```

### Local Worker dev

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2/worker
npm run dev
```

## Server API

Base path: `/api`

- `GET /health`
- `POST /auth/register` body `{ "username": "...", "password": "..." }`
- `POST /auth/login` body `{ "username": "...", "password": "..." }`
- `GET /auth/me` (requires bearer authorization header)
- `GET /uploads` (requires bearer authorization header)
- `POST /uploads` multipart form-data with `file` and optional `slot` (requires bearer authorization header)
- `GET /uploads/:uploadId` (requires bearer authorization header)
- `DELETE /uploads/:uploadId` (requires bearer authorization header)
- `GET /settings` (requires bearer authorization header)
- `PUT /settings` body `{ "masterGain": number, "monitorGain": number, "soundboardGain": number }` (requires bearer authorization header)
- `GET /presets` (requires bearer authorization header)
- `PUT /presets` body `{ "presets": [...] }` (requires bearer authorization header)
- `GET /library` (requires bearer authorization header)

## Notes

- Uploaded files are stored per-user in Worker Durable Object storage.
- Upload limit is 10MB per file.
- This remains a browser/client prototype for voice processing; OS-level virtual microphone drivers are not part of this repo.
