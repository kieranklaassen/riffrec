# Live mode demo: Orbit Admin

A small Vite + React + TypeScript admin dashboard (dashboard, activity, settings) with riffrec [live mode](../../README.md#live-mode) mounted at the root, so you can try a live polish session against a real page without wiring riffrec into your own app first. The look is whatever the last live session left it with; polishing it further is the point.

The `riffrec` dependency is `file:../..`, so the app runs the package from this checkout (`dist/` is tracked). Change riffrec under `src/`, run `npm run build` at the repo root, and the demo picks it up.

The whole integration is one line in [`src/main.tsx`](src/main.tsx):

```tsx
<RiffrecProvider forceEnable live={{}}>
```

`forceEnable` lets the provider render in a production build too; `live={{}}` enables live mode with the defaults. Nothing about the endpoint or the session is in source: both arrive through the URL fragment at session start.

## Run it

```sh
git clone https://github.com/kieranklaassen/riffrec
cd riffrec && npm install          # riffrec's runtime deps (fflate, perfect-freehand) for the linked package
cd examples/live-demo && npm install && npm run dev
```

The app is at `http://localhost:5173` (the port is fixed; see `vite.config.ts`). A plain visit shows no riffrec UI: live mode's `autoStart` fires only when the page carries `#riffrec_live=` credentials. `npm run build` type-checks and builds; `npm run lint` runs oxlint.

## Run a live polish session against it

Live mode needs a consumer on the other end of the stream. The one that exists is the **ce-polish live mode** of the [Compound Engineering plugin](https://github.com/EveryInc/compound-engineering-plugin), in [PR #1726](https://github.com/EveryInc/compound-engineering-plugin/pull/1726). It ships a helper, `skills/ce-polish/scripts/live-endpoint.js`, that receives the stream, mints the voice interviewer's ephemeral OpenAI secret, and wakes a coding agent with a batch of units at each checkpoint.

Until that PR is merged, check its branch out:

```sh
git clone https://github.com/EveryInc/compound-engineering-plugin
cd compound-engineering-plugin
git fetch origin pull/1726/head:ce-polish-live && git checkout ce-polish-live
```

The intended path is to run `/ce-polish` in a coding agent that has the plugin installed, from this directory, and choose live mode: the skill starts the helper, writes the session brief, hands you the URL, and acts on units when a checkpoint arrives. The steps below are what it does, so you can also drive the helper by hand.

1. **OpenAI key.** The helper reads `OPENAI_API_KEY` from its own environment and uses it only to mint short-lived client secrets; the page never sees it and riffrec accepts no key option. Export it in the shell that starts the helper.

2. **Start the app** (`npm run dev` above) and note the origin the browser will load it from: `http://localhost:5173`.

3. **Start the helper** with that origin. `--app-origin` is the CORS allow-list and must be the exact scheme, host, and port the page loads from.

   ```sh
   LIVE_ROOT="$(mktemp -d /tmp/ce-polish-live-XXXXXX)"
   node <plugin>/skills/ce-polish/scripts/live-endpoint.js start --root "$LIVE_ROOT" --app-origin http://localhost:5173
   ```

   It prints one JSON line with `url` (the helper's origin), `port`, and `page_token`. The token is shown only here. `--foreground` keeps the helper attached to your terminal instead of detaching. It stops itself after 30 minutes idle (`CE_LIVE_IDLE_TIMEOUT_MS` to change that); a bare `start --root "$LIVE_ROOT"` resumes the same session.

4. **Write a session brief** at `$LIVE_ROOT/state/brief.md` if you want the interviewer to know the app: routes, component names, design token names, a paragraph on recent changes. Under 3,000 characters, no secrets or file contents. Optional for a first try.

5. **Open the app with the live fragment:**

   ```text
   http://localhost:5173/#riffrec_live=<page_token>&endpoint=<url>
   ```

   Riffrec reads both values, strips them from the address bar before any history entry exists, and keeps them in `sessionStorage`, so reloading is fine.

6. **Act on units.** `node live-endpoint.js status --root "$LIVE_ROOT"` prints the board; `wait --root "$LIVE_ROOT"` blocks until the next checkpoint and prints the batch. In the skill, that is where the coding agent edits this app, posts a status per unit, and parks on `wait` again; see `skills/ce-polish/references/live-loop.md` in the plugin. `stop --root "$LIVE_ROOT"` ends the helper and keeps the session log under `$LIVE_ROOT/state/log/`.

## Remote: expose both origins over HTTPS

When the browser is not on the machine running the app and the helper, the page reaches two origins, and both must be HTTPS: browsers grant the microphone and screen capture only to secure contexts (`localhost` or HTTPS), and an HTTPS page may not call a plain-HTTP endpoint at all. The helper has no TLS of its own; put a tunnel in front of each origin. With cloudflared quick tunnels (no account needed):

```sh
# 1. Tunnel the app; read the https://<random>.trycloudflare.com origin it prints.
cloudflared tunnel --url http://localhost:5173

# 2. Start the helper on a fixed port with the app tunnel's origin as --app-origin.
node <plugin>/skills/ce-polish/scripts/live-endpoint.js start --root "$LIVE_ROOT" --port 47311 \
  --app-origin https://<app>.trycloudflare.com

# 3. Tunnel the helper; read its origin too.
cloudflared tunnel --url http://localhost:47311
```

Hand over `https://<app>.trycloudflare.com/#riffrec_live=<page_token>&endpoint=https://<helper>.trycloudflare.com`. Read each origin from what cloudflared prints rather than predicting it; a fresh hostname can take a minute to resolve. `vite.config.ts` already allows `.trycloudflare.com` hosts, so the dev server answers through the tunnel. Both processes stay bound to loopback: the tunnel client connects locally, so do not add `--host`. Quick tunnels sit behind a Cloudflare Worker that holds a streaming response until it completes; the helper compensates by ending each `/stream` response shortly after a delivery, which costs the page a reconnect per delivery and nothing else. The plugin's `references/live-remote.md` covers Tailscale serve and ngrok as well.

## What you should see

- **Consent dialog** on load with the fragment: "Start a live session?", listing what goes to OpenAI Realtime (microphone audio, the session brief, what you click, draw on, and pin, screenshots when you point at something) and what goes to the endpoint origin you passed. Nothing is sent before you accept.
- **Microphone prompt** after accepting, then a **screen share prompt**. Declining either keeps the session going with drawing and the board only.
- **Live indicator** distinguishing streaming, buffering, muted, and paused, with a mute and a pause control.
- The **interviewer** greets you and asks about what you click and say; it turns each requested change into a unit and asks when something is ambiguous. Say "this" or "that" after clicking an element and it knows which one.
- The **board** listing every unit with its status, the **Instant / Smart / Collect** switch (Smart is on by default), withdraw, and typed replies to the interviewer's questions.
- **Draw** (`Alt+Shift+D`) opens the drawing layer to circle or pin an element; the interviewer is told what you drew on.
- **Send** emits a `send` checkpoint and wakes the agent with what is on the board.
- **Done** runs the confirmation pass, emits the `final` checkpoint, and posts the archive to the helper. When the helper confirms, an ended card replaces the download notice and no zip is downloaded; if the endpoint never confirmed, the zip downloads as the fallback.
