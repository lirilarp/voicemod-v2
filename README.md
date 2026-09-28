# voicemod-v2

Voicemod-style web studio + Cloudflare Worker backend.

## What’s included

### Studio UI (`/index.html`)
- Refreshed modern UI with improved layout and navigation
- Real-time voice presets + soundboard
- Upload custom sound files per soundboard slot
- QoL controls:
  - Stop all sounds button
  - Keyboard hotkeys (`1`, `2`, `3` for sounds, `X` to stop)
  - Live version badges
- Auto-update support (toggleable) using site version metadata

### Download page (`/download.html`)
- Reads generated build metadata from `downloads.json`
- Shows latest build version and generated timestamp
- Provides downloadable client/server artifact bundles

### Cloudflare Worker server (`/worker`)
- Account APIs (register/login/me)
- Token-authenticated uploads
- User settings + presets
- Library summary endpoint

## Local development

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run dev
```

Open: <http://localhost:8080>

## Build pipeline (auto-generated from current source)

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run build
```

This runs:
1. `build:client` → outputs `/dist`, generates `version.json`, `app-version.js`, `downloads.json`
2. `build:server` → outputs `/dist-server`
3. `build:release` → creates downloadable tarballs in `/dist/downloads` and refreshes `/dist/downloads.json`

Build outputs:
- Client: `/home/runner/work/voicemod-v2/voicemod-v2/dist`
- Server source bundle: `/home/runner/work/voicemod-v2/voicemod-v2/dist-server`
- Download artifacts: `/home/runner/work/voicemod-v2/voicemod-v2/dist/downloads`

## Auto-update behavior

The studio checks `/version.json` periodically.

- If **Auto-update from site** is enabled, the app reloads automatically when a newer version is detected.
- If disabled, an update banner appears and you can reload manually.

## Cloudflare Worker deploy

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2/worker
npm run deploy
```

Optional recommended secret:

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2/worker
npx wrangler secret put AUTH_SECRET
```
