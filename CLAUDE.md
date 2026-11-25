# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **decentralized social network** (Twitter-like) built on IPFS. Users own and host their own profiles, posts, and social graphs. There is no central database that owns user data.

A public web frontend lets anyone browse profiles and view timelines of followed users. When connected to their own node, a user can post and edit their profile.

**Core principles:**
- User sovereignty: users hold their keys and host their content.
- Content-addressed + mutable pointers: posts and manifests are immutable CIDs; the latest manifest is published via IPNS.
- Progressive decentralization: works with a local Kubo node, public trustless gateways, and pinning services.
- Pure IPFS + IPNS for the core loop. No blockchain unless explicitly requested.

## Stack

| Area | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), ESM everywhere | One language across frontend, agent, and shared schemas |
| Monorepo | pnpm workspaces | Shared `core` package used by both apps |
| Frontend | Vite + React + Tailwind v4, React Router (`HashRouter`), TanStack Query | Static build with relative paths and hash routes, so the site can be hosted on IPFS |
| Browser retrieval | Plain `fetch` of raw blocks and IPNS records from trustless gateways, verified in `core` | Every block is hash-checked and every IPNS record signature-checked, so no gateway is trusted, with no Helia in the bundle |
| Local agent | Node.js + Fastify, run with `tsx` (no build step) | Small HTTP API the frontend calls to publish |
| Desktop app | Electron + esbuild + electron-builder, bundled Kubo (fetched per target by `apps/desktop/scripts/fetch-kubo.cjs`) | Runs the agent in-process; tray icon; no separate installs for users |
| IPFS node | Kubo, via a small `fetch`-based RPC client (`apps/agent/src/kubo.ts`) | Only five endpoints are needed; avoids a heavy client dependency |
| Encoding | `@ipld/dag-json`, `multiformats` | Deterministic bytes for signing and CIDs |
| Crypto | `@noble/curves` (Ed25519, import from `@noble/curves/ed25519.js`) | Audited, pure JS, browser + Node |
| Validation | `zod` v4 | Runtime validation of every fetched object and API body |
| Tests / lint | Vitest, Biome | |

## Layout

```
packages/core/    # schemas, encoding, signing, did:key/IPNS helpers, pure manifest ops (no I/O)
apps/agent/       # Fastify service: holds the key, talks to Kubo, publishes
apps/web/         # Vite React frontend: read path + calls the agent to write
apps/desktop/      # Electron app: runs its own Kubo + the agent, tray icon, help window
```

`core` must stay environment-neutral (no Node or DOM APIs). It is consumed as TypeScript source (`exports` points at `src/index.ts`), so there is nothing to build before running the apps.

## Commands

Requires Node 22+ and pnpm. The command-line agent needs a Kubo daemon (`ipfs init` once, then `ipfs daemon`); the desktop app runs its own. Tests don't need Kubo.

```bash
pnpm install
pnpm dev                                   # agent + web in parallel
pnpm --filter @socialkey/web dev           # frontend only (http://localhost:5173)
pnpm --filter @socialkey/agent dev         # agent only; prints a pairing code
pnpm build                                 # builds the web app to apps/web/dist
pnpm test                                  # all packages
pnpm --filter @socialkey/core test test/sign.test.ts      # one file
pnpm --filter @socialkey/agent test -t pairing            # tests matching a name
pnpm typecheck
pnpm lint                                  # biome check; `pnpm format` to autofix
pnpm --filter @socialkey/desktop start     # bundle + launch the desktop app (run `pnpm build` first to bundle the web app)
pnpm --filter @socialkey/desktop dist      # package for this OS into apps/desktop/release (AppImage on Linux)
pnpm --filter @socialkey/desktop dist:win  # Windows NSIS installer; on Linux/macOS this needs Wine
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the web build. Pushing a `v*` tag runs `release.yml`, which builds each OS's installer on that OS (macOS: separate x64 and arm64 DMGs via `dist:mac`; a manual run builds without releasing) (unsigned; `CSC_IDENTITY_AUTO_DISCOVERY=false`) and drafts a GitHub release. `pages.yml` publishes the web app to GitHub Pages (https://herbavenue.github.io/SocialKey/) on every push to `master`; that origin is in the agent's default `SOCIALKEY_ORIGINS` (`PUBLIC_SITE_ORIGIN`), and the agent answers Chrome's private-network preflight for allowed origins. Release and Pages builds set `VITE_PUBLIC_URL` to the Pages site so share links work for others. `pnpm --filter @socialkey/web publish:ipfs` adds the built site to Kubo (`IPFS_BIN` overrides the binary).

Screenshots in `docs/screenshots/` were captured from the seeded demo network; regenerate them after visible UI changes. `desktop.png` is the desktop renderer bundled with esbuild and loaded in headless Chromium (500×888 at 2×), with a stub `window.socialkey` bridge returning a fixed `AppState`.

Dependencies with install scripts must be allowed in `allowBuilds` in `pnpm-workspace.yaml` (`pnpm approve-builds <pkg>`), or installs fail.

Agent config is via env: `SOCIALKEY_PORT` (4040), `KUBO_API` (http://127.0.0.1:5001), `KUBO_GATEWAY` (http://127.0.0.1:8080), `SOCIALKEY_DATA_DIR` (`~/.socialkey`), `SOCIALKEY_KEY_NAME` (`socialkey`), `SOCIALKEY_ORIGINS` (allowed CORS origins). Set `SOCIALKEY_WEB_ROOT` to a built `apps/web/dist` to serve the web app at `/app/`. Web config: `VITE_AGENT_URL`, `VITE_GATEWAYS`, `VITE_ROUTERS` (see `apps/web/.env.example`).

## Architecture

### Identity
- One Ed25519 keypair per user is the identity, the signing key, **and** the IPNS key. The agent stores it in `<dataDir>/key.json` (mode 0600) and imports it into Kubo, so the IPNS name is derived from the public key.
- Canonical identifier: `did:key` (`z6Mk…`). `core/src/did.ts` converts between did:key and the base36 IPNS name (`k51…`) in both directions; the frontend resolves `ipns://<didToIpnsName(did)>`.
- On startup the agent checks that Kubo's key ID equals the IPNS name `core` derives, and refuses to run on mismatch.
- Backup is a 24-word BIP-39 encoding of the 32-byte seed (`core/src/recovery.ts`). Restoring (`replaceIdentity` in `agent/src/keystore.ts`) moves the old identity's files into `<dataDir>/archive-<time>/` (never deletes a key), writes the new key and removes Kubo's old key name. When a key exists but `manifest.dagjson` doesn't, `Publisher.init({ recover: true })` adopts the profile found on the network and re-pins its posts in the background, instead of publishing a blank profile over it. Fresh identities skip this (no point waiting on a DHT lookup).

### Data model (`core/src/schemas.ts`)
Every object has a `type` and `version: 1`. Signed objects (`post`, `manifest`) carry `author` (did:key) and `sig`.
- **Manifest** (what the IPNS name points to): `profile` (incl. optional domain `handle`), `follows` (did:keys), `posts` (up to 50 recent post CIDs, newest first), optional `olderPosts`, `likes` (≤500 post CIDs, newest first), `pinned`.
- **Post**: `createdAt`, `text` (≤1000 chars), `media` (≤4 UnixFS CIDs), optional `replyTo` / `quoteOf` / `repostOf` / `mentions` (did:keys). A repost is a post with `repostOf`, empty text and no media.
- New fields must be optional: old clients ignore them, and signatures cover the raw object, so they stay verifiable.
- **Post page** (unsigned; trusted through the signed manifest's CID link): `posts`, optional `prev`. When a 51st recent post arrives, the oldest 25 move into a new page whose `prev` is the old `olderPosts` (`prependPost` in `core/src/manifest.ts`).

### Direct messages (`core/src/dm.ts`)
- Two people's Ed25519 keys are converted to X25519; HKDF over the shared secret (salted with both dids, sorted) gives a conversation key and a 16-byte hex `tag`, identical on both sides.
- A `message` object is `{ tag, nonce, ciphertext }`, XChaCha20-Poly1305 with the sender's did as associated data (so a message can't be passed off as the other person's). Plaintext is JSON `{ text, createdAt }`.
- Messages live in the **sender's** profile: `manifest.messages` → newest `message-page` (≤50 CIDs, `prev` link), built with `appendMessage`.
- Only the agent holds secret keys. It sends (`POST /messages`) and hands paired frontends conversation keys (`POST /messages/keys`); the web app decrypts in the browser by scanning message pages of people in the network plus remembered contacts (`apps/web/src/lib/messages.ts`), matching on `tag`.

### Domain handles (`core/src/handle.ts`)
`alice.com` is a valid handle for a did when the TXT record `_socialkey.alice.com` holds `did=<did>` (exactly one distinct did). `core` takes the TXT lookup as a function; the web app uses DNS-over-HTTPS (`apps/web/src/lib/dns.ts`). Clients show a handle only after verifying it; the profile field alone proves nothing.

### Signing rules (`core/src/sign.ts`, `core/src/read.ts`)
- Signature = Ed25519 over the DAG-JSON encoding of the object **without** `sig`. The CID covers the full encoding **with** `sig`.
- `encode()` drops `undefined` keys (DAG-JSON can't represent them). Always encode through `core`, never `dagJson.encode` directly.
- Readers use `readPost` / `readManifest` / `readPostPage`: decode → zod-validate → verify the signature on the **raw** decoded object (so unknown future fields stay covered by it). Never render content that didn't go through these.

### Agent (`apps/agent`)
- `Publisher` owns the manifest. All changes go through a serial queue: build unsigned → sign → `block/put` (bytes stored as-is; the CID Kubo returns is checked against the local one) → atomically write `<dataDir>/manifest.dagjson`. If any of those fail, the manifest stays at the previous version.
- The IPNS publish then runs in the background (`schedulePublish`): a DHT publish takes 40–60s on the real network, so API calls return in milliseconds. Changes made meanwhile fold into one follow-up publish, and failures retry after `publishRetryMs` (30s). Tests call `publisher.flush()` before asserting on `kubo.published`, and `FakeKubo.publishDelayMs` simulates a slow network.
- On startup it re-stores and republishes the saved manifest, in case Kubo's repo was reset.
- `Kubo` is an interface; tests use `test/fake-kubo.ts`, and the HTTP API is tested with `app.inject`.
- API: `GET /health`, `POST /pair`, `GET /me`, `PUT /profile`, `POST /posts`, `DELETE /posts/:cid`, `POST /media` (raw body), `POST /follows`, `DELETE /follows/:did`, `POST /likes`, `DELETE /likes/:cid`, `PUT /pinned`, `POST /messages`, `POST /messages/keys`, `GET /moderation`, `PUT /moderation/{muted|blocked}`. Validation errors are 400 (zod or `RangeError`), missing things 404 (`NotFoundError`).
- Deleting a post in an older page rebuilds that page and every newer page (`removeFromPages`), then unpins the post block.
- `Hoster` (`src/hoster.ts`): every 30 minutes it pins each followed profile's manifest, 20 newest posts and their images, and re-announces their signed IPNS record (`routing/put`), so profiles stay online while any follower is. It records only pins it created (`pin()` returns false for blocks already pinned recursively) and only ever removes those. State lives in `<dataDir>/hosted.json`; `SOCIALKEY_HOST_FOLLOWS=false` disables it. IPNS records are read from the gateway's `/routing/v1/ipns/` endpoint because RPC `routing/get` needs Kubo online.
- Mute and block lists (`src/moderation.ts`, `<dataDir>/moderation.json`) are private and never published. Blocking also unfollows. The web app hides those people via `useModeration()`: `AppContext` filters the shared network's posts, and the home timeline, notifications, suggestions and messages filter separately because they don't all read from it.
- `scripts/seed.ts` publishes a nine-person demo network (see README). With `ipfs daemon --offline` it runs in seconds and the local gateway resolves every demo name. Everything except `/health` and `/pair` requires `Authorization: Bearer <token>`.
- Pairing: the agent prints a one-time code (rotated after each use); `POST /pair` exchanges it for a token, with at most 5 wrong codes per client per minute (429 after). Only SHA-256 token hashes are stored (`tokens.json`). CORS allows only `SOCIALKEY_ORIGINS` plus the agent's own origins.
- The agent binds to `127.0.0.1` unless LAN access is on (`SOCIALKEY_LAN=true` / desktop "Allow devices on my network"), which binds `0.0.0.0` so phones on the same network can use `http://<lan-ip>:4040/app/`.
- `GET /ipfs/*`, `/ipns/*` and `/routing/v1/ipns/:name` are unauthenticated proxies to Kubo's gateway, and `/me` reports the agent's own address as `gateway`, so content loads from whatever address the client used (Kubo's gateway itself stays on loopback).
- Pages opened over the LAN are not a secure context: no `crypto.subtle` and no `navigator.clipboard`. That's why `core` hashes with `@noble/hashes` (never multiformats' WebCrypto `sha256`) and the web app copies through `lib/clipboard.ts`.

### Web (`apps/web`)
- Live updates (`agent/src/live.ts`): every committed manifest is announced at once on the PubSub topic `socialkey/v1/<ipnsName>` (and re-announced every minute). Agents subscribe to everyone they follow, verify each announced manifest (signature, author, newer `updatedAt`) before accepting it, and expose the results at `GET /live`. The web app polls `/live` every 10s (`useLive`) and fetches those CIDs directly, falling back to IPNS. Between two live nodes an update arrived in ~110ms, versus minutes via IPNS. It needs `Pubsub.Enabled` in Kubo (the desktop app sets it); without it, announcements just log and IPNS still works.
- After each successful publish, the agent's `Warmer` (`agent/src/warmer.ts`, `SOCIALKEY_WARM_GATEWAYS=false` to disable) requests the new IPNS record, manifest, newest posts and their images from public gateways, so gateways cache them before visitors arrive (a visitor's fetch of a fresh post dropped from 12–23s to ~7s in testing). It skips blocks it already warmed.
- Two separate live nodes (Nov 2026) followed each other, replied, exchanged an encrypted message and hosted each other's profile over the public network. Expect minutes, not seconds, for another node to see an update: about 1 minute to publish, plus DHT and cache delays.
- Tested on the real public network (Nov 2026): a profile hosted on a home computer behind NAT loaded for a visitor in about 30s. The IPNS record came from `delegated-ipfs.dev` and the blocks from Pinata's gateway; other gateways were rate-limited or failing that day. That's why requests race several gateways and images fall back through `VITE_MEDIA_GATEWAYS`. Router requests carry a random `nocache` query because Cloudflare can serve a copy of the record cached from a non-browser request, which has no CORS header.
- `src/lib/ipfs.ts` fetches raw blocks (`?format=raw`) and IPNS records directly over HTTP: from the paired agent's Kubo gateway, or else from public trustless gateways and delegated routers (`VITE_GATEWAYS`, `VITE_ROUTERS`). Blocks are checked with `blockMatches`; IPNS records with `verifyIpnsRecord` (`core/src/ipns.ts`: Ed25519 names only, V2 signature, expiry). Don't reintroduce verified-fetch/Helia: in a browser it asks routers for providers, gets home-node TCP/QUIC addresses it can't dial, and hangs. Images are loaded by URL from the local gateway or a subdomain gateway (`VITE_MEDIA_GATEWAY`), not hash-checked.
- `setLocalGateway` is called inside the `['me']` query function, before `me` reaches any component, so no fetch starts without it. Every fetch has a timeout (30s, or 60s for IPNS), so pages show an error instead of loading forever.
- Your own manifest is fetched by the CID from `GET /me`, not via IPNS, so your changes show up immediately.
- `src/lib/queries.ts`: posts are cached forever by CID, manifests for 60s. `useCircle` loads everyone you follow (20 posts each); `useExtendedNetwork` adds up to 120 friends of friends (5 posts each). Both are keyed by your follow list, not your manifest CID, so likes and posts don't reload the network. A profile or post that fails to resolve or verify is skipped, never fatal.
- `src/lib/social.ts` holds the pure graph logic: suggestions, notifications, trending tags, reply/like/repost counts and search, all computed from the loaded `Network`. There is no server, so these only cover people within two follows; UI copy says so.
- `AppContext` provides the merged network, toasts, the compose dialog and first-run onboarding to every page. Pages that need a paired agent are wrapped in `RequireAgent` (redirects to `/connect`).
- After an agent write, invalidate `['me']`: the new manifest CID refreshes your own manifest and posts.
- Share links use `VITE_PUBLIC_URL` when set; `VITE_DOWNLOAD_URL` makes the landing page's download button link out.

### Desktop (`apps/desktop`)
- `src/main.ts` starts a private Kubo (`src/kubo-daemon.ts`: own repo at `<dataDir>/kubo`, API port 45001, gateway 48080, so it never clashes with a user's own IPFS daemon), then calls the agent's `startAgent()` in-process on port 4040, serving the bundled web app at `http://127.0.0.1:4040/app/`.
- It shares `~/.socialkey` (override with `SOCIALKEY_DATA_DIR`) with the command-line agent, so both use the same identity. Don't run both at once: they share port 4040.
- "Open SocialKey" opens `/app/#/connect?code=<pairing code>`; the web Connect page pairs automatically, or skips pairing if the browser already has a working token.
- "Friends keep each other online" toggles the agent's `Hoster`; desktop preferences live in `<dataDir>/desktop.json`.
- Closing the window hides it; the app lives in the tray until "Quit". On quit it stops the agent, then Kubo. A Kubo left behind by a crash is shut down on the next start.
- `--hidden` starts without the window (used by start-at-login). Linux start-at-login writes `~/.config/autostart/socialkey.desktop`, because Electron's login-item API doesn't cover Linux.
- The window (`src/renderer/`) is plain HTML + TS with no framework. It gets everything from `AppState` (`src/state.ts`) through the sandboxed preload bridge.
- `scripts/fetch-kubo.cjs [os] [arch]` downloads the Kubo binary for a target into `kubo-bin/<os>-<arch>/` (checksum-verified); electron-builder copies `kubo-bin/${os}-${arch}/kubo` into resources. The dist scripts run it, so cross-builds get the right binary. `pnpm start` (dev) uses the `kubo` package's host binary instead.
- Windows: every Kubo child process needs `windowsHide: true` (or a console window pops up), and `stop()` asks Kubo to shut down over the API because `kill()` on Windows terminates immediately. The tray uses the full-colour `tray-win.png`, since taskbars can be light or dark.

## Not built yet
A native mobile app, an in-browser Helia node for posting without an agent, code signing / auto-update for the desktop app. The project is licensed AGPL-3.0-only (`LICENSE`).
