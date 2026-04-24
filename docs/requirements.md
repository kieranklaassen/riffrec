---
date: 2026-04-21
topic: riffrec
---

# Riffrec

## Problem Frame

Giving feedback on software requires switching context: you notice friction while using an app, then open a separate tool to describe what happened - losing the interaction signal. By the time you describe it, context is gone.

Riffrec captures everything simultaneously from inside your React app: screen recording, voice, DOM events, network requests, and console errors. When you're done, it writes a session to disk. An agent reads the session and turns it into bugs, issues, or a brainstorm - without you writing a description.

The primary loop: install once → record sessions → agents analyze → iterate.

## Architecture

```
riffrec (npm package)
  ├── getDisplayMedia()     screen recording
  ├── getUserMedia()        voice → local audio file
  ├── React hooks           DOM events, component context on every click
  ├── fetch/XHR intercepts  network requests (credentials redacted)
  └── window.onerror        console errors + stack traces

session written to disk (File System Access API on Chrome/Arc/Brave, or zip download)

agent (Claude Code or any LLM)
  └── reads session files → analyzes → creates issues / brainstorm
```

## Session Output

Every session is a directory (or zip):

```
riffrec-session-2026-04-21-0716/
├── session.json      ← metadata: timestamps, app info, React version, URL, files_present
├── events.json       ← all captured events, timestamped
├── voice.webm        ← microphone audio
└── recording.webm    ← screen recording (WebM/VP9, Chrome MediaRecorder output)
```

All four files are optional and composable. Agent uses whatever is present.

## Event Format (`events.json`)

```json
{
  "version": "1",
  "schema_version": "1.0.0",
  "session_id": "...",
  "url": "http://localhost:3000",
  "started_at": "2026-04-21T07:16:31-07:00",
  "duration_seconds": 312,
  "events": [
    {
      "t": 42.3,
      "type": "click",
      "component": "CheckoutButton",
      "element": {"tag": "button", "text": "Submit Order", "id": "checkout-btn",
                  "selector": "form.checkout > button.primary"}
    },
    {
      "t": 43.1,
      "type": "network_request",
      "url": "/api/orders",
      "method": "POST",
      "status": 500,
      "duration_ms": 1203
    },
    {
      "t": 43.2,
      "type": "console_error",
      "message": "Uncaught TypeError: cannot read 'id' of undefined",
      "stack": "at checkout.js:142",
      "component": "CheckoutForm"
    },
    {
      "t": 98.2,
      "type": "navigation",
      "from": "/checkout",
      "to": "/cart"
    }
  ]
}
```

Rich DOM context on every event - not just that someone clicked a button, but which element, where it was, what nearby UI surrounded it, and which React component was involved when that context is available. This is what makes the npm approach richer than screen recording alone.

## Requirements

**Capture**
- R1. Screen recording via `getDisplayMedia()` + `MediaRecorder`; output is `recording.webm` (WebM/VP9, the native MediaRecorder format in Chrome)
- R2. Voice capture via `getUserMedia()` (microphone); raw audio saved locally as `voice.webm`; voice is skipped gracefully if microphone capture is unavailable
- R3. DOM click events with React component name or path when available, plus production-safe DOM context: readable element name, element tag, text content, ID, CSS selector, full DOM path, class names, ARIA metadata, nearby text, sibling context, bounding box, and a small computed-style snapshot; required fields remain null-safe if unavailable
- R4. Network requests via fetch/XHR intercepts: URL, method, status code, duration; `Authorization`, `Cookie`, `Set-Cookie`, and `X-Api-Key` headers are redacted before writing; URL query parameters matching credential patterns (`token=`, `api_key=`, `client_secret=`) are masked; response bodies are not captured
- R5. Console errors and uncaught exceptions via `window.onerror` and `console` override: message, stack trace, React component context; configurable sanitizer callback lets integrators scrub error messages before they are written
- R6. Page navigations (React Router, Next.js router, or `window.history`)
- R7. All events timestamped relative to session start for alignment with recording

**Integration**
- R8. Single `<RiffrecProvider>` component wraps the React app; all capture starts automatically when recording begins
- R9. `useRiffrec()` hook exposes `{ start, stop, status }` for programmatic control
- R10. Recording requires explicit user gesture to start (`start()` called from a button or keyboard shortcut) due to browser `getDisplayMedia()` requirements
- R11. Dev-only by default: `RiffrecProvider` checks `process.env.NODE_ENV` at mount time; if `production`, all capture is disabled and a `console.warn` is emitted; explicit opt-in via `<RiffrecProvider forceEnable={true}>` is documented but discouraged; runtime guard only (bundle impact documented, not tree-shaken)

**Session Output**
- R12. On `stop()`, writes session directory via File System Access API (Chrome/Arc/Brave - user selects a directory once, handle persisted via IndexedDB) or offers zip download fallback for all other browsers; streaming writes for video file to avoid memory pressure
- R13. File System Access API stores a persisted directory handle; no `~/.riffrec/sessions/` default path (browser sandbox prevents arbitrary path access); zip fallback writes to browser Downloads
- R14. Session directory name: `riffrec-{YYYY-MM-DD}-{HHMM}-{shortid}`
- R15. `session.json` includes: URL, React version, browser, timestamps, and `files_present` array listing which files were successfully written (e.g. `["events.json", "voice.webm"]`); agents read `files_present` to determine what analysis is possible

**Agent Integration**
- R16. Session format is the public API - versioned via `schema_version` field in `events.json`; breaking changes documented in CHANGELOG; TypeScript types exported from package for agent authors
- R17. No LLM calls inside riffrec; no API keys stored in the package; agents supply all analysis capability
- R18. Sessions are shareable as a zip file; session.json and events.json are always included; recording.webm is optional due to size

## Success Criteria

- A developer adds `<RiffrecProvider>` to their React app, hits start, tests their checkout flow while narrating, hits stop; an agent reads the session and returns a list of bugs with exact DOM context, component names when available, correlated network errors, and voice context - without the developer writing a description
- A developer without microphone capture still gets useful sessions: DOM context, component names when available, network errors, and console stack traces give an agent enough context to identify bugs
- The session zip can be sent to a teammate with no additional tooling required
- Riffrec is a no-op in production builds by default

## Scope Boundaries

- React only in v1 - no Vue, Svelte, Angular, or vanilla JS
- No Riffrec-operated backend or cloud in v1 - local files only
- No real-time analysis - analysis happens after `stop()`
- No LLM calls inside the package - agents analyze the output
- No plugin architecture in v1 - capture targets are hardcoded
- File writes are browser-sandboxed; no arbitrary filesystem path access

## Key Decisions

- **npm package only, no daemon or CLI**: Session files are the interface. Agents read them directly.
- **React-first**: Component names on every event is the differentiator. Fiber tree when available, graceful null fallback when not.
- **Production-safe DOM context**: Uninstrumented production builds still emit useful element names, selectors, accessibility metadata, nearby text, bounding boxes, and style snapshots. Production component names require explicit `data-component` instrumentation.
- **getDisplayMedia for screen recording**: Browser-native, any OS, outputs WebM
- **Voice is optional but valuable**: Raw audio is captured locally; sessions are useful without it
- **Dev-only by default**: `NODE_ENV` check at mount; `forceEnable` prop for explicit opt-in; bundle ships but does nothing in production
- **File System Access API + zip fallback**: Chrome/Arc/Brave get persisted directory handle; others get zip download; no `~/.riffrec/sessions/` default path claim
- **Schema versioning from day one**: `schema_version` field in `events.json`; TypeScript types exported; CHANGELOG maintained

## Dependencies / Assumptions

**Browser feature requirements:**

| Feature | Chrome/Arc/Brave | Firefox | Safari |
|---------|-----------------|---------|--------|
| Screen recording (`getDisplayMedia`) | Yes | Yes | Partial (macOS 13+) |
| Voice (`getUserMedia`) | Yes | Yes | Yes |
| Native file writes (File System Access API) | Yes | No | No |
| Zip download fallback | Yes | Yes | Yes |

- `getDisplayMedia()` requires a user gesture; cannot be triggered programmatically
- React 16.8+ required (hooks)
- Agent (Claude Code or equivalent) required for analysis - riffrec does not analyze sessions itself
- Session video files (recording.webm) may be 50-200MB for a 5-minute session; zip sharing of large sessions is impractical - share `session.json`, `events.json`, and `voice.webm` separately for large recordings

## Outstanding Questions

### Resolve Before Planning

_None - ready for planning._

### Deferred to Planning

- [Affects R3][Technical] React Fiber tree traversal approach for component names - verify across React 16/17/18/19; confirm dev build displayName vs production minification behavior
- [Affects R4][Technical] fetch/XHR intercept strategy - Proxy vs monkey-patching; concurrent interceptor ordering with app-level interceptors (TanStack Query, Apollo, auth middleware)
- [Affects R12][Technical] File System Access API directory picker UX - one-time prompt with IndexedDB persistence vs per-session prompt
- [Affects R1][Technical] Audio mixing strategy for R1 (getDisplayMedia) and R2 (getUserMedia) - two separate files (recording.webm + voice.webm) vs AudioContext mixing into one track

## Future / Out of Scope for v1

- **Swift companion app**: Optional native macOS menu bar app for recording non-browser apps; would write `recording.webm` to the same session directory format so agent workflow is identical; planned post-v1

## Next Steps
-> Begin implementation plan with `/ce-plan`
