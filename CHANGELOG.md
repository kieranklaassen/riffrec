# Changelog

## Unreleased

- Added optional `displayMedia` and `displayMediaVideo` props on `RiffrecProvider` to customize `getDisplayMedia` options and video constraints.
- Updated default screen capture options to request current-tab capture in Chromium (`preferCurrentTab: true`, `selfBrowserSurface: "include"`) while hiding monitor capture (`monitorTypeSurfaces: "exclude"`) and keeping a lower default frame rate (`5`).
- Exported `DEFAULT_DISPLAY_MEDIA_OPTIONS` and `DEFAULT_DISPLAY_MEDIA_VIDEO` for callers that want to extend the defaults explicitly.

## [2.0.0] - 2026-04-24

- Added richer production-safe DOM context to click events, including element names, paths, classes, accessibility metadata, nearby context, bounding boxes, style snapshots, and React component paths when available.
- Removed built-in audio processing and the provider API key option.
- Kept microphone capture as local `voice.webm` output for external processing after recording.

## [1.0.0] - 2026-04-24

- Initial riffrec package scaffold.
- Published `riffrec` to npm with bundled ESM, CJS, and TypeScript declaration outputs.
- Updated installation docs to use `npm install riffrec`.
