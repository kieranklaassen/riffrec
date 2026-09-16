# Changelog

## Unreleased

- Added **live mode**: `RiffrecProvider` accepts `live={{ endpoint?, profile?, autoStart?, drawShortcut?, endpointOwner? }}` and `useRiffrec()` gains `live: { status, mode, setMode, muted, setMuted, send, stop }`. A live session streams transcript, units, annotations, frames, and the existing events to a configured endpoint as they happen (stream contract `live/1`, see `docs/live-stream-contract.md`), runs a voice interviewer that connects to OpenAI Realtime from the browser with an ephemeral secret the endpoint mints, adds a drawing layer, a units board, an Instant / Smart / Collect execution-mode switch, Send and Done controls, a consent step derived from the evidence profile, and a live indicator. Credentials arrive in the URL fragment (`#riffrec_live=<token>&endpoint=<origin>`) and are stripped before any history entry; no provider option accepts an OpenAI key.
- Added a `"live"` `RiffrecStatus`. A live session survives page reloads and the provider unmounting; it ends only through `stop()`, the Done control, or the endpoint.
- The live subtree is lazy-loaded (`React.lazy`) and emitted as a separate chunk in both ESM and CJS output; hosts that do not set `live` ship no live code and make no new network calls.
- Live archives add `transcript.json`, `units.json`, `annotations.json`, `frames/`, `clips/`, and segmented `recording-NNN.webm` files listed in `session.json.files_present`; `events.json` and `voice.webm` are unchanged. The 50 MB recording guard applies to the whole recording family.
- Network capture excludes the live endpoint origin and `api.openai.com`, and `redactUrl` strips the `riffrec_live` and `endpoint` fragment keys from captured URLs.
- Exported the live stream contract (types, `validateEnvelope`, tool definitions, fixtures) from the package root and the Node entry, plus `EvidenceProfile`, `EvidenceProfileName`, and `LiveSessionStatus` types.
- Added host-managed session output: completed ZIPs now include their archive, filename, and session ID in `SessionResult`.
- Added a per-recording `download` option and reliable completion callbacks for both recorder and provider stop controls while keeping automatic downloads as the default.
- Exported `downloadSessionArchive` for explicit local-download fallbacks.
- Made the React package the recommended integration path and labeled Riffrec Desktop as a highly experimental preview in the documentation and app.
- Added Riffrec Desktop, a highly experimental standalone macOS feedback browser for recording any website without installing the React integration.
- Exported desktop recordings as compatible session zips containing existing event artifacts plus desktop capture context and optional notes.
- Added a GitHub-hosted experimental macOS preview DMG build and a direct desktop download link.
- Fixed macOS preview DMG packaging so installed Electron framework links remain valid, and added optional local code signing for preview builds.
- Added optional `displayMedia` and `displayMediaVideo` props on `RiffrecProvider` to customize `getDisplayMedia` options and video constraints.
- Updated default screen capture options to request current-tab capture in Chromium (`preferCurrentTab: true`, `selfBrowserSurface: "include"`) while hiding monitor capture (`monitorTypeSurfaces: "exclude"`) and keeping a lower default frame rate (`5`).
- Exported `DEFAULT_DISPLAY_MEDIA_OPTIONS` and `DEFAULT_DISPLAY_MEDIA_VIDEO` for callers that want to extend the defaults explicitly.
- Changed session saving to automatically download a zip instead of prompting for a folder with the File System Access API.
- Added a provider-level recording overlay with a prominent "Stop and save" action.
- Added a customizable post-download notice that tells users to share the downloaded zip for feedback.

## [2.0.0] - 2026-04-24

- Added richer production-safe DOM context to click events, including element names, paths, classes, accessibility metadata, nearby context, bounding boxes, style snapshots, and React component paths when available.
- Removed built-in audio processing and the provider API key option.
- Kept microphone capture as local `voice.webm` output for external processing after recording.

## [1.0.0] - 2026-04-24

- Initial riffrec package scaffold.
- Published `riffrec` to npm with bundled ESM, CJS, and TypeScript declaration outputs.
- Updated installation docs to use `npm install riffrec`.
