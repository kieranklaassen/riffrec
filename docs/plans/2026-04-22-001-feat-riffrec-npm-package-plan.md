---
title: "feat: Build riffrec npm package"
type: feat
status: active
date: 2026-04-22
origin: docs/requirements.md
deepened: 2026-04-22
---

# feat: Build riffrec npm package

## Overview

Build `riffrec`, a React npm package that captures screen recording, voice, DOM events, network requests, and console errors from inside a React app. Writes a structured session directory to disk. Agents read the session and produce bugs, issues, or brainstorms without the developer writing a description.

## Problem Frame

Developer feedback sessions lose context between observation and description. Riffrec closes that loop by recording everything simultaneously from inside the app. The session files are the interface — no daemon, no backend, no LLM baked in.

(see origin: `docs/requirements.md`)

## Requirements Trace

- R1. Screen recording via `getDisplayMedia()` + `MediaRecorder` → `recording.webm`
- R2. Voice capture via `getUserMedia()` → `voice.webm` → Monologue API → `transcript.md`
- R3. DOM click events with React component name (Fiber in dev, `data-component` attribute in prod), element tag, text, ID, selector
- R4. Network requests via fetch Proxy + XHR override; credential headers redacted; Monologue calls excluded
- R5. Console errors via `window.onerror` + `console` override with configurable sanitizer
- R6. Page navigations via `window.history` + React Router/Next.js router detection
- R7. All events timestamped relative to session start
- R8. `<RiffrecProvider>` wraps app; all capture wired through context
- R9. `useRiffrec()` hook exposes `{ start, stop, status }`
- R10. Recording requires explicit user gesture (`start()` from button/shortcut)
- R11. Dev-only by default; `NODE_ENV` check at mount; `forceEnable` prop for explicit opt-in
- R12. Session written via File System Access API (streaming) or zip download fallback
- R13. Directory handle persisted in IndexedDB; no default path claim
- R14. Session directory named `riffrec-{YYYY-MM-DD}-{HHMM}-{shortid}`
- R15. `session.json` includes URL, React version, browser, timestamps, `files_present`
- R16. `schema_version` in `events.json`; TypeScript types exported; CHANGELOG maintained
- R17. No LLM calls; no API keys stored
- R18. Sessions shareable as zip

## Scope Boundaries

- React 16.8+ only; no Vue, Svelte, Angular
- No Riffrec-operated backend or cloud
- No real-time analysis during recording
- No plugin architecture — capture targets hardcoded
- File writes are browser-sandboxed
- No Swift companion app (post-v1)

### Deferred to Separate Tasks

- Babel/SWC plugin for automatic `data-component` attribute injection: separate package `riffrec-babel-plugin`
- Swift companion app for native macOS recording: post-v1

## Context & Research

### Technology Stack

- **Build**: tsup (dual CJS/ESM output, declaration files, React external)
- **Language**: TypeScript strict mode, `target: ES2020`, `lib: ["ES2020", "DOM"]`
- **Peer deps**: `react >= 16.8.0`, `react-dom >= 16.8.0`
- **Runtime deps**: `fflate` (zip fallback, 23KB gzipped)
- **Dev deps**: `react`, `react-dom`, `tsup`, `typescript`, `@types/react`

### Key Technical Findings

**Screen + Voice recording:**
Two separate `MediaRecorder` instances run simultaneously — one on `displayStream` (getDisplayMedia), one on `micStream` (getUserMedia). Written to `recording.webm` and `voice.webm` independently. Start time recorded as `Date.now()` for sync. `timeslice: 1000` on both recorders fires `ondataavailable` every second for streaming writes. Check `MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')` and fall back to VP8.

**React Fiber component names:**
- **Dev builds**: Traverse `Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))`, walk up `fiber.return` until `fiber.type` is a function, read `fiber.type.displayName || fiber.type.name`
- **Prod builds**: Fiber names are minified and useless. Fall back to `el.dataset.component` (`data-component` attribute). If neither available, emit `null`
- Recommend (but do not require) `riffrec-babel-plugin` to auto-inject `data-component` on JSX elements

**fetch/XHR intercept:**
- fetch: `window.fetch = new Proxy(originalFetch, { apply(...) })` — safer than monkey-patching; preserves `instanceof` checks; composable with TanStack Query, Apollo, Axios
- XHR: wrap `XMLHttpRequest.prototype.open` and `send`; record start time on send; read status in `loadend` listener
- Exclusion: check `url.includes(MONOLOGUE_API_HOST)` before logging; also exclude URLs containing riffrec's own origin
- Capture: URL, method, status, duration only — never request/response bodies
- Credential redaction: strip `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` from logged headers; mask `token=`, `api_key=`, `client_secret=` in query strings

**File System Access API + IndexedDB:**
- `showDirectoryPicker({ mode: 'readwrite' })` once; store handle in IndexedDB
- On subsequent sessions: `queryPermission` → if `'granted'` reuse handle; else `requestPermission`
- Streaming video writes: `fileHandle.createWritable()` → pipe `ondataavailable` chunks as they arrive
- Zip fallback (non-Chrome): `fflate.zip()` async for small sessions; `fflate.ZipDeflate` streaming for large

**Monologue API:**
- `POST https://go.monologue.to/v1/enterprise/dictate` with `X-API-Key` header
- Send `voice.webm` as multipart or binary body; verify accepted formats at planning time
- Returns transcript text; write to `transcript.md` in session directory
- Skip gracefully if `RIFFREC_MONOLOGUE_KEY` env var not set

### External References

- File System Access API: Chrome 86+; IndexedDB handle persistence pattern
- fflate streaming zip: `ZipDeflate` + `ReadableStream` pipeline
- React Fiber key discovery: runtime property scan pattern

## Key Technical Decisions

- **Two separate audio files, not mixed**: `recording.webm` (display) + `voice.webm` (mic). Avoids AudioContext complexity; simpler to send just `voice.webm` to Monologue; agents can use either independently.
- **Proxy over monkey-patching for fetch**: Preserves reference integrity; transparent to downstream interceptors; reverts cleanly on `stop()`.
- **Fiber traversal dev-only; data-component prod fallback**: Fiber internals are minified in production. Rather than produce garbage component names, emit `null` and document `riffrec-babel-plugin` for prod component names. Dev builds always have displayName.
- **fflate for zip**: 23KB gzipped vs JSZip 90KB; streaming API for large video files.
- **`schema_version: "1.0.0"`** in events.json from day one: semver, documented in CHANGELOG, TypeScript types exported.
- **`NODE_ENV` check at mount time** with single `console.warn`: Clear intent, zero runtime overhead when disabled. Not tree-shaken (bundle impact documented in README).

## Open Questions

### Resolved During Planning

- **Two audio streams**: Two separate `MediaRecorder` instances → two files. No mixing required.
- **Fiber in production**: Useless (minified). Use `data-component` attribute as prod fallback; `null` if neither available.
- **fetch intercept approach**: Proxy, not monkey-patching. More reliable with third-party interceptors.
- **File System Access API persistence**: IndexedDB + `queryPermission` pattern. One prompt, reused across sessions.
- **Zip library**: fflate (smallest, streaming-capable).

### Deferred to Implementation

- Exact Monologue API multipart format (test against live endpoint during implementation)
- Exact IndexedDB schema key and database version for handle storage
- Safari VP8 codec detection and fallback path specifics
- Whether `ondataavailable` chunks from display MediaRecorder need to be written to OPFS first before final File System Access API write (depends on streaming support per browser)
- React Router vs Next.js navigation event differences (implement one at a time, test against real app)

## Output Structure

```
riffrec/
├── src/
│   ├── index.ts                      # public exports
│   ├── types.ts                      # SessionJson, EventsJson, RiffrecEvent, etc.
│   ├── capture/
│   │   ├── screen.ts                 # getDisplayMedia + MediaRecorder
│   │   ├── voice.ts                  # getUserMedia + MediaRecorder
│   │   ├── events.ts                 # DOM clicks, navigation, timestamps
│   │   ├── network.ts                # fetch Proxy + XHR override
│   │   ├── console.ts                # window.onerror + console override
│   │   └── fiber.ts                  # React Fiber component name extraction
│   ├── output/
│   │   ├── filesystem.ts             # File System Access API + IndexedDB
│   │   ├── zip.ts                    # fflate zip fallback
│   │   ├── monologue.ts              # Monologue API client
│   │   └── session.ts                # session.json + orchestration
│   ├── RiffrecProvider.tsx           # React context provider
│   └── useRiffrec.ts                 # hook: { start, stop, status }
├── package.json
├── tsup.config.ts
├── tsconfig.json
├── CHANGELOG.md
└── docs/
    ├── requirements.md
    └── plans/
        └── 2026-04-22-001-feat-riffrec-npm-package-plan.md
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
React App
└── <RiffrecProvider>
      │  (context: sessionId, status, config)
      │
      ▼
  useRiffrec()
  { start, stop, status }
      │
      │ start() ──────────────────────────────────────────┐
      │                                                    │
      ▼                                                    ▼
CaptureOrchestrator                              dev-only guard
├── ScreenCapture         getDisplayMedia()      (NODE_ENV check)
│     └── MediaRecorder → recording.webm chunks
├── VoiceCapture          getUserMedia()
│     └── MediaRecorder → voice.webm chunks
├── EventCapture
│     ├── addEventListener('click') → Fiber/data-component lookup
│     ├── history.pushState patch → navigation events
│     └── window.onerror + console.error override
└── NetworkCapture
      ├── window.fetch = new Proxy(...)
      └── XMLHttpRequest.prototype.{open,send} wrap

      │ stop()
      ▼
SessionWriter
├── flush all MediaRecorder chunks
├── build events.json (schema_version: "1.0.0")
├── build session.json (files_present)
├── POST voice.webm → Monologue API → transcript.md (if configured)
└── write to disk:
      ├── FileSystemWriter (Chrome/Arc/Brave)
      │     └── streaming FileSystemWritableFileStream per file
      └── ZipWriter fallback (fflate)
            └── browser download trigger
```

## Implementation Units

- [ ] **Unit 1: Package scaffold**

**Goal:** Establish the project structure, build tooling, and TypeScript configuration so all subsequent units have a working foundation.

**Requirements:** R16 (TypeScript types exported, CHANGELOG)

**Dependencies:** None

**Files:**
- Create: `package.json`
- Create: `tsup.config.ts`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `CHANGELOG.md`
- Create: `.gitignore`

**Approach:**
- `package.json`: tsup + TypeScript as devDeps; fflate as only runtime dep (no nanoid — use `crypto.randomUUID()` instead); react/react-dom as peerDeps (>=16.8.0); dual CJS/ESM exports with `exports` field; `"files": ["dist"]`; `exports` map includes `"node"` condition: `"node": "./dist/index.node.cjs"` pointing to `src/noop.ts` compiled output to prevent SSR crashes in Next.js App Router and Remix — separate tsup entry for node target
- `tsup.config.ts`: entry `src/index.ts`; formats `["cjs", "esm"]`; `dts: true`; `external: ["react", "react-dom"]`; `sourcemap: true`
- `tsconfig.json`: `target: "ES2020"`, `lib: ["ES2020", "DOM"]`, `jsx: "react-jsx"`, `strict: true`, `moduleResolution: "bundler"`
- `src/index.ts`: barrel export (empty until units complete); exports `RiffrecProvider`, `useRiffrec`, and all TypeScript types
- `CHANGELOG.md`: start with `## [1.0.0] - Unreleased` header

**Test scenarios:**
- Test expectation: none — pure scaffold, no behavioral logic

**Verification:**
- `npm run build` produces `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`
- No React bundled in output (`grep -r "createElement" dist/` should find nothing)

---

- [ ] **Unit 2: Session types and schema**

**Goal:** Define all TypeScript types for the public session format (`session.json`, `events.json`) with `schema_version` from day one.

**Requirements:** R15, R16

**Dependencies:** Unit 1

**Files:**
- Create: `src/types.ts`

**Approach:**
- `RiffrecEvent` union type covering: `ClickEvent`, `NetworkRequestEvent`, `ConsoleErrorEvent`, `NavigationEvent`
- `ClickEvent`: `{ t: number, type: "click", component: string | null, element: ElementInfo }`
- `ElementInfo`: `{ tag: string, text: string | null, id: string | null, selector: string }`
- `NetworkRequestEvent`: `{ t: number, type: "network_request", url: string, method: string, status: number, duration_ms: number }`
- `ConsoleErrorEvent`: `{ t: number, type: "console_error", message: string, stack: string | null, component: string | null }`
- `NavigationEvent`: `{ t: number, type: "navigation", from: string, to: string }`
- `EventsJson`: top-level shape with `version`, `schema_version: "1.0.0"`, `session_id`, `url`, `started_at`, `duration_seconds`, `events: RiffrecEvent[]`
- `SessionJson`: `url`, `react_version`, `browser`, `started_at`, `ended_at`, `duration_seconds`, `files_present: string[]`
- `RiffrecConfig`: provider props — `monologueApiKey?: string`, `forceEnable?: boolean`, `onError?: (err: Error) => void`, `sanitizeError?: (msg: string, stack: string | null) => string`
- Export all types from `src/index.ts`

**Test scenarios:**
- Test expectation: none — type definitions only, validated by TypeScript compiler (`tsc --noEmit`)

**Verification:**
- `tsc --noEmit` passes with strict mode
- All types exported from package root

---

- [ ] **Unit 3: Screen and voice capture**

**Goal:** Implement `ScreenCapture` and `VoiceCapture` modules that record to two separate WebM files using `ondataavailable` chunks.

**Requirements:** R1, R2, R7

**Dependencies:** Units 1–2

**Files:**
- Create: `src/capture/screen.ts`
- Create: `src/capture/voice.ts`

**Approach:**

`screen.ts`:
- `start()`: call `getDisplayMedia({ video: { frameRate: 30 }, audio: false })` (no system audio — unreliable cross-browser); check `MediaRecorder.isTypeSupported('video/webm;codecs=vp9')` first, fall back to `video/webm;codecs=vp8`; create `MediaRecorder` with `timeslice: 1000`; accumulate chunks in array; record `startedAt = Date.now()`
- `stop()`: call `recorder.stop()`; return `Promise<Blob>` that resolves in `onstop` with `new Blob(chunks, { type: mimeType })`
- Export: `{ start, stop, isSupported }`

`voice.ts`:
- Same pattern as `screen.ts` but uses `getUserMedia({ audio: true })`; separate `MediaRecorder`; returns `voice.webm` blob
- `isSupported()`: check `navigator.mediaDevices.getUserMedia` availability
- Handle `getUserMedia` permission denial gracefully: return `null` blob, emit warning

**Test scenarios:**
- Happy path: `start()` resolves without error; `stop()` returns a non-empty Blob
- Edge case: `MediaRecorder.isTypeSupported` returns false for VP9 — falls back to VP8 mimeType
- Error path: `getDisplayMedia()` permission denied (user dismisses picker) — `start()` rejects with descriptive error, calling code handles gracefully
- Error path: `getUserMedia()` denied — voice capture skips, does not throw

**Verification:**
- In a test browser page: record 3 seconds, stop, verify blob is non-empty and has correct MIME type
- Two blobs from screen + voice are independent (stopping one doesn't affect the other)

---

- [ ] **Unit 4: DOM event capture with Fiber component names**

**Goal:** Capture click events, page navigations with React component names from Fiber tree (dev) or `data-component` attribute (prod/fallback).

**Requirements:** R3, R6, R7

**Dependencies:** Units 1–2

**Files:**
- Create: `src/capture/fiber.ts`
- Create: `src/capture/events.ts`

**Approach:**

`fiber.ts`:
- `getComponentName(el: Element): string | null`
- Scan `Object.keys(el)` for key starting with `__reactFiber$` or `__reactInternalInstance$`
- Walk `fiber.return` chain; stop when `fiber.type` is a function (not a string); read `fiber.type.displayName ?? fiber.type.name ?? null`
- If Fiber lookup fails or returns minified name (length ≤ 2), fall back to `el.closest('[data-component]')?.dataset.component ?? null`
- Wrap entire function in `try/catch`; return `null` on any error

`events.ts`:
- `EventCapture` class with `start(onEvent: (e: RiffrecEvent) => void)` and `stop()`
- Click listener: `document.addEventListener('click', handler, true)` (capture phase); build `ClickEvent` from `e.target`; call `getComponentName`; emit event; **exclude text content from `input[type="password"]` and `input[type="hidden"]` elements** — emit event with `element.text: null` for these types
- CSS selector generation: walk `el` up to 3 levels of parents; build `tag.class#id` style selector; truncate at 100 chars
- Navigation: patch `window.history.pushState` and `window.history.replaceState`; listen to `popstate`; emit `NavigationEvent` with `from` (previous `location.href`) and `to` (new)
- All events timestamped: `t = (Date.now() - sessionStart) / 1000`

**Test scenarios:**
- Happy path: click on `<button>` inside `<CheckoutButton>` component emits event with `component: "CheckoutButton"`
- Edge case: Fiber not available (SSR hydration incomplete) → `component: null`, event still emitted
- Edge case: minified component name (`"t"`) → treated as absent, fall back to `data-component` attribute
- Edge case: click on element with no ID, no classes → `element.id` is `null`, selector is minimal but not null
- Happy path: React Router navigation → `NavigationEvent` emitted with correct `from`/`to`
- Edge case: `pushState` called before `start()` → not captured (no listener yet)

**Verification:**
- In a dev React app: click a button inside a named component; confirm event has correct `component` field
- In a prod build (without `data-component`): confirm `component: null`, no error thrown

---

- [ ] **Unit 5: Network request capture**

**Goal:** Intercept all fetch and XHR requests; capture URL, method, status, duration; redact credentials; exclude Monologue API calls.

**Requirements:** R4

**Dependencies:** Units 1–2

**Files:**
- Create: `src/capture/network.ts`

**Approach:**

`NetworkCapture` class:

- `start(onEvent, excludeUrls: string[])`: install Proxy on `window.fetch` and wrap `XMLHttpRequest` prototype; store originals for teardown
- `stop()`: restore originals

fetch Proxy (`apply` trap):
- Extract URL (string or Request), method (from init or Request)
- Call original fetch; on response: record duration, status; emit `NetworkRequestEvent`
- Redact credentials before emitting: strip `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` (these are in `init.headers`, not in the response — log only URL/method/status/duration, no headers)
- URL query param masking: replace values of `token`, `api_key`, `client_secret` params with `[redacted]`
- Skip emit if URL matches any `excludeUrls` entry (substring match)

XHR override:
- Wrap `open` to record method + URL; wrap `send` to record start time; add `loadend` listener to record status + duration; emit `NetworkRequestEvent`

`excludeUrls` default: `['monologue.to']`

**Test scenarios:**
- Happy path: `fetch('/api/orders', { method: 'POST' })` → event emitted with correct method, URL, status, duration
- Happy path: XHR `GET /api/users` → event emitted
- Edge case: `fetch` to `monologue.to` → not emitted (excluded)
- Error path: fetch throws (network error, CORS) → event emitted with status `-1` and duration
- Security: request with `Authorization: Bearer token123` → header not present in emitted event (only URL/method/status/duration captured)
- Security: URL `/api/orders?token=abc123` → emitted URL shows `/api/orders?token=[redacted]`
- Integration: TanStack Query makes internal requests → still captured correctly (Proxy composes with Query's own fetch wrapper)

**Verification:**
- `window.fetch` is restored to original after `stop()`
- `XMLHttpRequest.prototype.open` is restored after `stop()`

---

- [ ] **Unit 6: Console error capture**

**Goal:** Intercept `window.onerror` and `console.error` to capture errors with React component context and optional sanitization.

**Requirements:** R5

**Dependencies:** Units 2, 4 (needs `getComponentName`)

**Files:**
- Create: `src/capture/console.ts`

**Approach:**

`ConsoleCapture` class:

- `start(onEvent, sanitize?: (msg: string, stack: string | null) => string)`: install handlers; store originals
- `stop()`: restore originals

`window.onerror` handler:
- Capture `message`, `filename`, `lineno`, `colno`, `error.stack`
- Try `getComponentName(document.activeElement ?? document.body)` for component context
- Apply `sanitize` if provided; emit `ConsoleErrorEvent`
- Return `false` (don't suppress default browser behavior)

`console.error` override:
- Store original; wrap to also emit `ConsoleErrorEvent` with `args.join(' ')` as message
- Call original after capture (don't suppress)

Unhandled promise rejection: `window.addEventListener('unhandledrejection', ...)` — capture `event.reason.message` and `event.reason.stack`

Test environment guard: skip all wrapping if `process.env.NODE_ENV === 'test'` or `typeof jest !== 'undefined'` or `typeof vi !== 'undefined'` — prevents breaking host app jest/Vitest `console.error` spy assertions

**Test scenarios:**
- Happy path: `console.error('something broke')` → event emitted with message; original `console.error` still fires
- Happy path: `window.onerror` fires with Error object → stack trace captured
- Edge case: sanitizer callback strips PII from message before writing
- Edge case: error thrown before `start()` → not captured
- Error path: `getComponentName` throws → `component: null`, error event still emitted

**Verification:**
- After `stop()`, `console.error` is restored to original implementation
- `window.onerror` original handler is restored

---

- [ ] **Unit 7: Session output — File System Access API**

**Goal:** Write session files to a user-selected directory with streaming for video; persist directory handle in IndexedDB to avoid re-prompting.

**Requirements:** R12, R13, R14

**Dependencies:** Units 1–2

**Files:**
- Create: `src/output/filesystem.ts`

**Approach:**

`FileSystemWriter` class:

`getOrRequestDirectory()`:
- Open IndexedDB `riffrec-db` v1; object store `handles`
- Read stored `FileSystemDirectoryHandle` from key `'dir'`
- If stored: `queryPermission({ mode: 'readwrite' })` → if `'granted'` return it; if not, `requestPermission` → if granted return it
- If not stored or permission denied: `showDirectoryPicker({ mode: 'readwrite' })`; store handle in IndexedDB; return it

`writeSession(sessionDirName, files: Map<string, Blob | AsyncIterable<Uint8Array>>)`:
- Get directory handle
- Create subdirectory: `dirHandle.getDirectoryHandle(sessionDirName, { create: true })`
- For each file: get file handle; get writable stream; for `Blob` entries write directly; for streaming entries iterate chunks and write progressively; close writable

- Export: `{ isSupported(): boolean }` — checks `'showDirectoryPicker' in window`

**Test scenarios:**
- Happy path: `writeSession` creates subdirectory and writes JSON files; directory exists after write
- Happy path: stored handle with permission granted → no picker shown on second session
- Edge case: stored handle permission revoked → `requestPermission` called; picker shown if denied
- Edge case: `showDirectoryPicker` cancelled by user → reject with descriptive error
- Error path: write fails mid-stream → error propagated to caller; partial files cleaned up if possible

**Verification:**
- After two `writeSession` calls: both session directories exist in chosen folder
- IndexedDB contains exactly one handle entry after repeated calls

---

- [ ] **Unit 8: Session output — zip fallback and Monologue transcription**

**Goal:** Implement zip download fallback for non-Chrome browsers and Monologue API client for voice transcription.

**Requirements:** R2 (Monologue), R12, R18 (zip)

**Dependencies:** Units 1–2, 7

**Files:**
- Create: `src/output/zip.ts`
- Create: `src/output/monologue.ts`

**Approach:**

`zip.ts` — `ZipWriter` class:
- `writeSession(sessionDirName, files: Map<string, Blob>)`: use `fflate.zipSync` for small sessions (<50MB total) or `fflate.zip` async for larger; construct zip in memory; trigger browser download via `URL.createObjectURL` + `<a>` click; revoke URL after download
- `isSupported()`: always `true` (fallback for all browsers)
- Note: `recording.webm` excluded from zip by default when >50MB; include `session.json` and `events.json` always

`monologue.ts` — `MonologueClient` class:
- `transcribe(audioBlob: Blob, apiKey: string): Promise<string>`: POST to `https://go.monologue.to/v1/enterprise/dictate` with `X-API-Key` header; send audio as `multipart/form-data` or raw body (verify during implementation); parse response transcript text; return string
- `isConfigured(config: RiffrecConfig): boolean`: check `config.monologueApiKey` is set
- On failure: return `null` (skip transcript); do not throw

**Test scenarios:**

`zip.ts`:
- Happy path: `writeSession` with `session.json` + `events.json` blobs → triggers download with correct filename
- Edge case: `recording.webm` > 50MB → excluded from zip; `session.json` still included
- Edge case: browser without `URL.createObjectURL` → graceful fallback or error

`monologue.ts`:
- Happy path: valid API key + audio blob → returns non-empty transcript string
- Error path: invalid API key (401) → returns `null`, no throw
- Error path: API unavailable → returns `null` after timeout, no throw
- Edge case: `apiKey` not configured → `isConfigured` returns false, transcription skipped

**Verification:**
- Zip download triggers in Firefox (no File System Access API)
- Monologue returns `null` gracefully without crashing when key is invalid

---

- [ ] **Unit 9: Session orchestration**

**Goal:** Implement `SessionWriter` that collects all capture outputs on `stop()`, builds `session.json` and `events.json`, calls Monologue, and writes to disk via File System Access API or zip fallback.

**Requirements:** R12–R15, R17, R18

**Dependencies:** Units 3–8

**Files:**
- Create: `src/output/session.ts`

**Approach:**

`SessionWriter` class:

`stop(captures: CaptureOutputs, config: RiffrecConfig)`:
1. Stop all `MediaRecorder` instances; collect `recording.webm` Blob + `voice.webm` Blob
2. Compute `duration_seconds = (Date.now() - sessionStart) / 1000`
3. Build `EventsJson` from accumulated events array; set `schema_version: "1.0.0"`, `duration_seconds`
4. Attempt Monologue transcription if `config.monologueApiKey` is set; get `transcript: string | null`
5. Build `files_present` array from which files have non-null content
6. Build `SessionJson`
7. Construct `Map<string, Blob>` of files to write
8. Try `FileSystemWriter.writeSession`; if not supported or fails: `ZipWriter.writeSession`
9. Return `{ sessionPath: string | null, method: 'filesystem' | 'zip' }`

Session directory name: `riffrec-${YYYY-MM-DD}-${HHMM}-${shortid}` where shortid is generated via `crypto.randomUUID().slice(0, 6)` — no external dependency; `crypto.randomUUID()` is available in all target browsers (Chrome 92+, Firefox 95+, Safari 15.4+)

**Test scenarios:**
- Happy path (Chrome): all captures produce content → all 4 files written to filesystem; `files_present` has 4 entries
- Happy path (Firefox): fallback to zip → download triggered; `files_present` reflects actual content
- Edge case: voice capture failed (permission denied) → `voice.webm` absent; `files_present` omits it; `transcript.md` absent
- Edge case: Monologue returns `null` → `transcript.md` absent; no error thrown
- Error path: File System Access API write fails → zip fallback triggered automatically
- Integration: `session.json` `files_present` accurately reflects which files were actually written

**Verification:**
- `session.json` is always written (it's always in `files_present`)
- `events.json` is always written
- `schema_version: "1.0.0"` present in `events.json`

---

- [ ] **Unit 10: React integration layer**

**Goal:** Wire all capture and output modules behind `<RiffrecProvider>` and `useRiffrec()` hook; implement dev-only guard.

**Requirements:** R8, R9, R10, R11

**Dependencies:** Units 1–9

**Files:**
- Create: `src/RiffrecProvider.tsx`
- Create: `src/useRiffrec.ts`
- Modify: `src/index.ts` (add all exports)

**Approach:**

`RiffrecProvider.tsx`:
- Accept `RiffrecConfig` as props (spread to context)
- Dev-only guard: on mount, if `process.env.NODE_ENV === 'production' && !props.forceEnable`: set `isEnabled = false`; emit `console.warn('[riffrec] Disabled in production. Pass forceEnable={true} to opt in.')`
- Create `CaptureOrchestrator` instance on mount; pass `onEvent` callback that appends to internal events array
- Expose context value: `{ start, stop, status, isEnabled }`
- `start()`: request screen + voice permissions; start all capture modules; record `sessionStart`; set `status: 'recording'`
- `stop()`: stop all capture modules; invoke `SessionWriter.stop()`; set `status: 'idle'`; return session result
- Cleanup on unmount: call `stop()` if recording

`useRiffrec.ts`:
- Consume `RiffrecContext`; return `{ start, stop, status }`
- Throw descriptive error if used outside `<RiffrecProvider>`

`src/index.ts`:
- Export `RiffrecProvider`, `useRiffrec`, and all types from `src/types.ts`

**Test scenarios:**
- Happy path: `start()` → `status` becomes `'recording'`; `stop()` → `status` becomes `'idle'`
- Edge case: `NODE_ENV=production`, no `forceEnable` → `console.warn` emitted; `start()` is a no-op
- Edge case: `NODE_ENV=production`, `forceEnable={true}` → capture activates normally
- Edge case: `useRiffrec()` outside provider → throws `"useRiffrec must be used within RiffrecProvider"`
- Edge case: component unmounts while recording → `stop()` called automatically
- Integration: full flow — `start()` in a React app → interact → `stop()` → session directory exists with correct files

**Verification:**
- `<RiffrecProvider>` renders children without error in both dev and prod builds
- `status` transitions: `'idle'` → `'recording'` → `'idle'` correctly
- `stop()` result contains `{ sessionPath, method, filesPresent }`

## System-Wide Impact

- **Interaction graph**: `window.fetch` and `XMLHttpRequest.prototype` are patched globally while recording; `window.onerror` and `console.error` are wrapped; `history.pushState` and `history.replaceState` are patched. All restored on `stop()`. **Re-entrancy**: the network capture module calls `fetch` internally (Monologue upload); internal calls must reference the pre-patch original to avoid infinite recursion.
- **SSR / Node.js**: `window`, `document`, `navigator.mediaDevices`, `history`, and `XMLHttpRequest` do not exist in Node.js. Any import of the package in a Next.js App Router server component, Remix loader, or other SSR environment throws at module evaluation time. All browser API access must be gated behind `typeof window !== 'undefined'`. The `package.json` `exports` map must include a `"node"` condition pointing to a no-op stub to prevent crashes on server import.
- **Multiple instances / monorepo hoisting**: If the host app bundles two versions of riffrec (monorepo hoisting failure), both patches `window.fetch`. Calling `stop()` on one instance restores only the inner original, leaving the outer patch dangling permanently. Detection mechanism: on `start()`, check for `window.__RIFFREC_PATCHED__`; if present, emit `console.warn('[riffrec] Another riffrec instance is already active — skipping patch')` and mark as observer-only (no patching). Set `window.__RIFFREC_PATCHED__ = true` on first patch; clear on `stop()`.
- **Test environment pollution**: `console.error` wrapping breaks `jest` and Vitest spy assertions in host app tests if the package is imported without a guard. Document that riffrec should not be imported in test environments, or that mocking the provider is the correct pattern.
- **Privacy**: The package can record everything visible on screen — passwords, banking, health data — with no built-in safeguard. The plan explicitly delegates the responsibility for user-visible recording indicators and consent surfaces to the host application. `input[type="password"]` and `input[type="hidden"]` nodes must be excluded from DOM event text capture (R3). Audio sent to Monologue may contain spoken PII; host app developers must understand this is a third-party data flow.
- **Error propagation**: Capture failures (e.g. permission denied, Monologue API error) are isolated — they do not propagate to the host app. Session output falls back gracefully.
- **State lifecycle risks**: If `stop()` is not called (e.g. page refresh mid-session), patches are not restored. `MediaRecorder` `ondataavailable` chunks accumulate in memory unbounded; for long sessions this is a real memory leak. The implementation should flush chunks to IndexedDB OPFS every 60 seconds or every 50MB rather than holding all chunks in memory until `stop()`.
- **API surface parity**: The session format (`events.json`, `session.json`) is the public API contract. Any breaking change requires a `schema_version` bump and CHANGELOG entry.
- **Integration coverage**: The full flow (start → interact → stop → file on disk) cannot be unit-tested in jsdom; requires a real Chrome browser environment or Playwright test.
- **Unchanged invariants**: The package adds no global state that persists across React renders beyond the recording session. IndexedDB handle is the only persistent side effect.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Monologue API audio format unknown | Implement with `multipart/form-data` first; fallback to raw body if rejected; verify against live endpoint |
| File System Access API handle expires between sessions | `queryPermission` → `requestPermission` chain handles re-prompting gracefully |
| React Fiber key format changes in future React version | `try/catch` + `null` fallback; isolated in `fiber.ts` for easy update |
| Large video files (200MB+) OOM in zip fallback | Exclude `recording.webm` from zip when > 50MB; document the limitation |
| `history.pushState` patch conflicts with existing router | Patch is additive (calls original); restore on `stop()` |
| `getDisplayMedia` user cancels picker | `start()` rejects; host app must handle rejection; document in README |
| SSR crash in Next.js App Router / Remix | All browser API access gated behind `typeof window !== 'undefined'`; `node` export condition points to no-op stub |
| Network capture re-entrancy (Monologue upload calls fetch) | Internal requests use pre-patch original fetch reference; never go through the proxy |
| Memory leak from unbounded MediaRecorder chunk accumulation | Flush chunks to OPFS every 60s or 50MB; document maximum recommended session duration |
| Dual-patch from monorepo hoisting | Detect existing riffrec marker on `window.fetch` on install; warn and skip double-patching |
| PII in screen recording (passwords, banking, health) | Document prominently in README: riffrec is dev-only tooling; recording indicator and consent are host app responsibilities |
| PII in audio sent to Monologue Enterprise API | README must state: audio is transmitted to a third-party API; host app developer is responsible for ensuring appropriate data handling agreement |
| Sensitive DOM text captured from password inputs | Exclude `input[type="password"]` and `input[type="hidden"]` text content from R3 DOM event capture |

## Documentation / Operational Notes

- README must document: install, minimal setup, `RiffrecProvider` props, `useRiffrec` hook API, session format, browser support table, `forceEnable` warning, Monologue API key setup
- CHANGELOG starts at `1.0.0-unreleased`; `schema_version: "1.0.0"` in events.json is the contract
- Recommend `riffrec-babel-plugin` (separate package, post-v1) for production component names
- Bundle impact: ~25KB gzipped (fflate 23KB + riffrec logic ~2KB); document in README

## Sources & References

- **Origin document:** [docs/requirements.md](../requirements.md)
- tsup docs: dual CJS/ESM library build pattern
- File System Access API: `showDirectoryPicker` + IndexedDB handle persistence
- fflate: streaming zip for large files
- React Fiber key discovery: runtime property scan pattern (`__reactFiber$` prefix)
- Monologue Enterprise API: `https://go.monologue.to/docs/enterprise.md`
