---
title: "feat: Add standalone desktop feedback browser"
type: feat
status: completed
date: 2026-05-29
origin: docs/requirements.md
---

# feat: Add standalone desktop feedback browser

## Overview

Build a macOS desktop Riffrec application that opens any website in its own secure browser surface, records the visible session and microphone narration, collects useful page telemetry, and exports the same core Riffrec zip artifacts as the installed React integration. A website owner does not install a package or modify their site: a feedback giver pastes a URL, browses inside Riffrec, records, and shares the bundle.

The original requirements scoped the package to integrated React apps and deferred a native recorder. The clarified request is broader: standalone website feedback with as much useful context as can be captured without host installation. A plain Swift screen recorder would not meet that objective because it cannot see webpage DOM clicks, navigations, console errors, or network outcomes. Electron is chosen because it can contain the website in a hardened Chromium `WebContentsView` while producing browser-compatible Riffrec evidence.

## Problem Frame

Most people who find a website issue cannot install a debugging component in that website. Screen video and spoken narration help, but agents lose the exact clicked element, failing request, URL transition, or console error that identifies a reproducible web defect. Riffrec Desktop should create that evidence from a standalone feedback browser while making its security and privacy limits explicit.

## Requirements Trace

- **R1 - Standalone website workflow:** A Mac user can launch an app, enter an `https://` URL (plus local development URLs), browse the target site inside the app, and record feedback without the site installing Riffrec.
- **R2 - Compatible media capture:** Record the Riffrec browser window to `recording.webm` and optional microphone narration to `voice.webm`, with user consent, visible status, and stop/save controls.
- **R3 - Rich contained-page telemetry:** While recording, capture DOM clicks, top-level navigations, network request URL/method/status/duration, and console errors from the contained webpage; redact credential-like query parameters and avoid request/response bodies.
- **R4 - Compatible export:** Save a conventional zip containing root-level `session.json`, `events.json`, optional media, and optional `notes.md`/`context.json`; preserve `schema_version: "1.0.0"` and the existing event union so agent readers immediately work with desktop sessions.
- **R5 - Secure browsing boundary:** Remote web content runs with no Node integration, context isolation and sandboxing enabled, permission requests denied unless needed for Riffrec's local recording UI, new-window navigation contained, and IPC inputs validated.
- **R6 - User-grade experience:** Provide browser navigation/address controls, recording setup disclosure, microphone toggle, notes and markers, clear recording/export feedback, and a way to clear the dedicated browsing profile.
- **R7 - Local-first privacy:** Store and export recordings locally only; explain that screens, clicks, URLs/statuses, console errors, cookies retained for sign-in, narration, and entered notes may be sensitive.
- **R8 - Maintainable delivery:** Keep desktop code in the same repository as a separate Electron package, provide macOS packaging scripts and permission descriptions, tests for telemetry/export logic, and documentation.

## Success Criteria

- A person can install or launch the macOS app, visit a public or authenticated website inside its browser, record a narrated reproduction, stop, select a save location, and share a zip without cooperation from that website's developer.
- The exported archive includes playable screen recording and, when enabled and permitted, microphone audio; its JSON artifacts use the existing Riffrec naming and event schema.
- A reproduction involving a clicked element, navigation, failing HTTP response, or browser console error is reflected in `events.json` with timestamps aligned to the recording.
- Untrusted websites cannot access Electron/Node APIs or arbitrary local files through the Riffrec browser surface.
- The desktop package builds, tests, and produces a launchable macOS application from this repository.

## Scope Boundaries

- In scope: a macOS-first Electron app that embeds the website inside Riffrec, Chromium screen/microphone recording, contained-page telemetry, compatible zip export, dedicated browser-profile clearing, packaging, documentation, and tests.
- In scope: arbitrary websites loaded in the Riffrec browser, including sites that do not know Riffrec exists; HTTPS is the default and local `http://localhost`/loopback addresses are permitted for development feedback.
- Out of scope: capturing telemetry from an already-open Chrome/Safari/Arc tab, a browser extension, native recording of unrelated desktop applications, automated login credential handling, response/request body capture, keylogging, OCR, automated transcription, cloud sharing, code signing/notarization, or cross-platform release validation.
- Out of scope: reliable React component-name discovery on third-party production websites; desktop click events set `component` to `null` unless a safe page-provided `data-component` value exists.

## Context And Research

### Existing Patterns

- `src/types.ts` publishes the `events.json` `1.0.0` schema with click, navigation, network request, and console error events. Desktop telemetry maps to these existing variants rather than introducing an incompatible second vocabulary.
- `src/output/session.ts` builds root-level session artifacts, ISO timestamps, and `files_present`; desktop export follows this discovery contract.
- `src/capture/events.ts` defines safe DOM click element metadata and avoids password/hidden input text; the desktop guest preload follows the same privacy policy.
- `src/capture/network.ts` masks credential-like URL parameters and stores no bodies; the Electron request observer follows the same rule.
- `README.md` already treats the zip artifacts as the agent interface and describes recording sensitivity.

### External Guidance

- Electron `WebContentsView` is the supported main-process view for rendering a website inside a desktop window.
- Electron `webContents` exposes document and in-page navigation events and console messages, while `session.webRequest` observes request lifecycle events for the contained browsing session.
- Electron `desktopCapturer` supplies window sources for renderer media capture and documents macOS screen-permission requirements.
- Electron's security checklist requires no Node integration for remote content, context isolation, renderer sandboxing, restricted permissions/navigation, validation of IPC senders, and current Electron versions.
- Electron recommends Electron Forge for packaging applications and macOS distributables.

These findings are load-bearing: Electron rather than Swift is required to satisfy rich no-install website telemetry; `WebContentsView` avoids the discouraged remote `<webview>` approach; security settings are first-class acceptance requirements; and macOS packaging includes screen/microphone purpose strings.

## Key Technical Decisions

- **Ship a feedback browser, not an external-screen recorder:** The user navigates inside Riffrec Desktop. This is the only app-only design that can collect webpage evidence without a site integration or browser extension.
- **Electron package isolated under `desktop/`:** The published React library remains stable while the desktop application shares its artifact contract and mirrors its capture/privacy rules.
- **Remote content in a dedicated `WebContentsView`:** Controls live in a local renderer; target sites live in a sandboxed, context-isolated view with a narrow preload that sends sanitized click observations only to the validated main process.
- **Use Electron event surfaces for privileged evidence:** Main-process navigation/console events and the dedicated guest session's request observers capture events without exposing capture APIs to the website.
- **Reuse the existing event contract directly:** Clicks, network outcomes, console errors, and navigation belong in `events.json`; additional run metadata, capability disclosure, versions, and privacy configuration belong in additive `context.json`.
- **Record the Riffrec browser window using Chromium media primitives:** The local control renderer records its containing window through a source authorized by the main process and optionally records microphone separately, yielding `recording.webm` and `voice.webm` matching current session readers.
- **Persistent isolated browsing profile with an explicit clear action:** People need sign-in flows for real sites; isolating cookies/storage to Riffrec and making clearing prominent balances usefulness and privacy.
- **Mac-first packaged application via Electron Forge:** Provide a runnable app and zip distributable; signing/notarization remains release infrastructure work rather than blocking functional development.

## High-Level Technical Design

```text
Riffrec Desktop BrowserWindow (trusted local UI)
  +-- address/navigation + feedback setup + record/stop/save + profile clear
  +-- local preload: narrowly typed IPC; MediaRecorder for window + microphone
  |
  `-- WebContentsView (untrusted website, dedicated persisted session)
        +-- sandbox + contextIsolation + no Node integration
        +-- guest preload: sanitized DOM click observations only
        +-- webContents navigation + console-error listeners
        `-- webRequest lifecycle observers
                         |
                         v
                 RecordingSession (main process)
                   events aligned to start time
                   credential-redacted URLs
                         |
                         v
                 SessionExporter
                   session.json
                   events.json
                   context.json
                   notes.md? / recording.webm? / voice.webm?
                   -> riffrec-YYYY-MM-DD-HHMM-shortid.zip
```

## Output Structure

```text
desktop/
├── package.json
├── package-lock.json
├── forge.config.cjs
├── tsconfig.json
├── tsup.config.ts
├── assets/
│   ├── index.html
│   └── styles.css
├── src/
│   ├── main.ts
│   ├── control-preload.ts
│   ├── guest-preload.ts
│   ├── renderer.ts
│   ├── shared/types.ts
│   └── session/
│       ├── capture-session.ts
│       ├── privacy.ts
│       └── exporter.ts
└── tests/
    ├── exporter.test.ts
    └── privacy.test.ts
```

## Implementation Units

### U1. Desktop Package And Secure Browser Shell

**Goal:** Produce a launchable macOS Electron application with trusted local controls and a secure website browsing surface.

**Requirements:** R1, R5, R6, R8

**Dependencies:** None

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/package-lock.json`
- Create: `desktop/forge.config.cjs`
- Create: `desktop/tsconfig.json`
- Create: `desktop/tsup.config.ts`
- Create: `desktop/src/main.ts`
- Create: `desktop/src/control-preload.ts`
- Create: `desktop/assets/index.html`
- Create: `desktop/assets/styles.css`

**Approach:**
- Establish an Electron/TypeScript package with build, test, start, and macOS package commands plus Forge permission descriptions for screen and microphone recording.
- Create the main window for trusted local controls and a `WebContentsView` for entered websites; permit secure URLs and local development addresses while rejecting dangerous protocols.
- Configure the remote view with `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`, a separate persisted session partition, denied unneeded permissions, contained pop-up navigation, and clear-profile IPC.
- Build a focused browser UI: address bar, back/forward/reload, page status, feedback panel, privacy copy, and clear-site-data action.

**Patterns to follow:** Carry the visible consent posture from `src/RiffrecRecorder.tsx`; treat the Electron security checklist as mandatory for every remote-content option.

**Test scenarios:**
1. `https://` and loopback development URLs normalize/load; file, script, and unsupported schemes are rejected before navigation.
2. Guest view configuration retains sandbox/context isolation/no Node integration and a dedicated profile partition.
3. Clearing site data invokes the dedicated session only and reports completion/error in the trusted UI.
4. `npm run package` creates a launchable macOS app bundle with screen and microphone descriptions.

### U2. Contained-Website Telemetry

**Goal:** Capture rich evidence from arbitrary pages viewed inside Riffrec without requiring website code changes.

**Requirements:** R3, R5, R7

**Dependencies:** U1

**Files:**
- Create: `desktop/src/guest-preload.ts`
- Create: `desktop/src/shared/types.ts`
- Create: `desktop/src/session/capture-session.ts`
- Create: `desktop/src/session/privacy.ts`
- Create: `desktop/tests/privacy.test.ts`
- Modify: `desktop/src/main.ts`

**Approach:**
- In the isolated guest preload, observe click targets and send bounded, sanitized element metadata; exclude text from password/hidden inputs and never expose an API into the page world.
- In main, validate sender and message shapes, then timestamp click events only during active recordings.
- Attach navigation and console-error listeners to the guest contents and network lifecycle observers to only the dedicated website partition; redact sensitive URL parameters and store no payload or headers.
- Track browser/page context and capabilities in memory for final export.

**Patterns to follow:** Port the observable behavior and redaction policy from `src/capture/events.ts` and `src/capture/network.ts`; retain the event union from `src/types.ts`.

**Test scenarios:**
1. Redaction masks case-insensitive credential parameters while preserving non-sensitive URLs and methods/statuses.
2. Sanitization omits password/hidden text and bounds element/console strings.
3. Events outside an active recording are ignored; active events have non-negative relative timestamps and the existing discriminated-union shapes.
4. Network completion creates one outcome with duration and never stores headers or body content.
5. IPC from contents other than the configured guest view is rejected.

### U3. Window And Microphone Recording Flow

**Goal:** Let a user consent, record a visible website reproduction with narration, and control recording without page cooperation.

**Requirements:** R2, R6, R7

**Dependencies:** U1, U2

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/control-preload.ts`
- Create: `desktop/src/renderer.ts`
- Modify: `desktop/assets/index.html`
- Modify: `desktop/assets/styles.css`

**Approach:**
- Expose only typed local-control IPC for start, stop, media payload submission, notes/markers, URL controls, layout, and export result messages.
- Authorize capture of the Riffrec window from main and use the trusted renderer's `MediaRecorder` for screen video plus optional microphone narration; keep user gesture and consent requirements visible.
- Begin telemetry and media together, display elapsed recording status, allow timestamped user markers and notes, and stop tracks cleanly before export.
- Gracefully continue screen-only when microphone is disabled or denied, recording that capability outcome in context.

**Patterns to follow:** Keep the two independent screen/voice media outputs and stop-result behavior of `src/capture/screen.ts`, `src/capture/voice.ts`, and `src/output/session.ts`.

**Test scenarios:**
1. Recording cannot start before disclosure consent and a loaded site.
2. Start/stop transitions enable the correct controls and stop all media tracks.
3. Microphone denial does not abort screen recording and is disclosed in exported context.
4. Notes and markers are included only during/for the current recording.
5. Manual macOS run records a real site view and playable audio/video files after required OS permissions.

### U4. Riffrec-Compatible Zip Export

**Goal:** Export the captured browser session as a stable, immediately analyzable Riffrec archive.

**Requirements:** R4, R7, R8

**Dependencies:** U2, U3

**Files:**
- Create: `desktop/src/session/exporter.ts`
- Create: `desktop/tests/exporter.test.ts`
- Modify: `desktop/src/main.ts`

**Approach:**
- Generate existing-format session names and ISO metadata; write `session.json` and `events.json` with `schema_version: "1.0.0"` at zip root.
- Include captured WebM files, `notes.md` where nonblank, and `context.json` describing Electron/app versions, initial/final URL, capture options/outcomes, and the no-plugin-contained-browser boundary.
- Save through a user-selected native file destination and never upload artifacts.
- Keep large-video behavior explicit: desktop export writes the requested local zip rather than silently omitting the primary recording.

**Patterns to follow:** Mirror filenames/schema from `src/output/session.ts` and root archive behavior from `src/output/zip.ts`.

**Test scenarios:**
1. A minimal session zip includes valid `session.json`, `events.json`, and `context.json`, with optional files absent and accurate `files_present`.
2. A media-and-notes session contains `recording.webm`, `voice.webm`, and `notes.md` at archive root and lists each in metadata.
3. Decoded `events.json` includes only existing Riffrec event variants with schema `1.0.0`.
4. Zip generation preserves a large recording artifact rather than dropping it.

### U5. Documentation And Product Contract

**Goal:** Make the standalone workflow understandable and keep integrated versus desktop capabilities honest.

**Requirements:** R1, R4, R5, R7, R8

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Approach:**
- Lead with the two ways to use Riffrec: Desktop Browser for any website without installation, React package for an app developer who wants integrated instrumentation.
- Document desktop install/build/package/use commands, privacy permissions, dedicated browser profile clearing, archive contents, and current macOS-first status.
- State capability differences directly: desktop captures the website inside its own window and cannot observe an existing external browser tab or guarantee React component names.

**Patterns to follow:** Extend existing session-format and privacy language with a clear standalone onboarding path.

**Test scenarios:**
1. Run each documented desktop build/test/package command successfully.
2. Compare a generated test bundle's root entries and schema to the documented desktop session format.

## Verification Strategy

- Automated: run `npm test`, `npm run typecheck`, and `npm run build` in the existing package to prevent regression to the published integration.
- Automated: run `npm test`, `npm run typecheck`, `npm run build`, and `npm run package` in `desktop/`.
- Automated: inspect exporter test archives for root-level artifacts, existing schema version, event variants, media inclusion, and URL redaction.
- Security review: inspect every remote `webPreferences`, permission handler, navigation/open-window rule, IPC sender check, and exposed preload method against Electron's security checklist.
- Manual: launch packaged Riffrec Desktop on macOS, load a real HTTPS website, record navigation/click/console/network activity with microphone, stop/save, open the zip, and play media.
- Manual: verify denied microphone permission still permits and accurately labels a screen-only session; verify clear browsing data removes the dedicated website profile.

## System-Wide Impact

- **Feedback givers:** get a standalone Mac app rather than needing website developer involvement, with explicit notice of captured sensitive data.
- **Agent consumers:** can process existing Riffrec event and media names; `context.json` is additive evidence about how desktop capture was performed.
- **Package integrators:** retain the current React library and its deeper in-app component semantics; no breaking public schema/type changes are required.
- **Maintainers:** acquire an Electron/macOS packaging surface, isolated in `desktop/` and justified by access to contained webpage signals.

## Risks And Mitigations

- **A site behaves differently in embedded Chromium or blocks embedded environments:** explain that Riffrec Desktop is a Chromium browser and retain the React integration/browser-extension avenue for future coverage of external-browser-only reproductions.
- **Remote web content tries to reach desktop privileges:** keep it in a sandboxed, context-isolated view without Node APIs; accept only bounded telemetry messages from the designated sender; deny arbitrary permissions and pop-ups.
- **Recording includes sensitive page/audio/cookie data:** require disclosure consent, make microphone optional, keep output local, provide clear-data action, avoid body/text-entry capture, and document sharing responsibility.
- **macOS screen/microphone permissions or signing complicate distribution:** include permission descriptions and packaged-app verification now; track notarized distribution separately from functional feature delivery.
- **Desktop media capture differs from browser-package filesystem behavior:** use the identical portable zip artifact contract and test exact root filenames/schema.

## Sources And Research

- Electron Documentation, *WebContentsView* and *webContents*: embedded page rendering plus navigation and console observation.
- Electron Documentation, *desktopCapturer* and *systemPreferences*: desktop/microphone media capture and macOS permission constraints.
- Electron Documentation, *Security* and *Context Isolation*: remote-content isolation, sandboxing, navigation, permission, and IPC requirements.
- Electron Documentation, *Packaging Your Application*: Electron Forge packaging and macOS distribution path.
- Existing package contract in `src/types.ts`, `src/output/session.ts`, `src/capture/events.ts`, and `src/capture/network.ts`.

## Assumptions

- Users accept performing the reproduction inside Riffrec's contained Chromium browser rather than recording a tab already open in another browser.
- macOS is the first supported distribution target, while the Electron architecture leaves a future cross-platform path open.
- Functional local packaging is the initial deliverable; signed/notarized distribution and automatic updates require separate release credentials/infrastructure.
