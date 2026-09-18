# design-sync notes: Riffrec Live Overlay

Project: https://claude.ai/design/p/24fb8d2c-d0d3-49dd-950b-c28803bea11e (shape `package`, no Storybook).

## Setup
- The components come from `.design-sync/overlay-entry.ts`, listed in `extraEntries`. The public `riffrec` entry doesn't export the overlay leaves.
- Build `dist/` first with `npm run build`. The converter entry is `./dist/index.js`.
- In the staged `.ds-sync/`, playwright is pinned to 1.61.1 so it matches the browsers already installed.

## Preview patterns
- Components that inherit their font (LiveIndicator, ModeSwitch, SendControl, KeyPrompt, Board) get an Inter `Panel` wrapper in their previews. Without it they render in Times.
- Components with `position: fixed` (ConsentDialog, DrawingLayer, PinComposer, LiveOverlay, LiveIndicator, NextSessionLauncher) render inside a `Stage` div. It has `transform: translateZ(0)` and an explicit height, so it becomes the containing block.
- LiveOverlay previews drive a real `LiveSession.create({ endpoint: null, bootstrap: null, storage: null, pageHideTarget: null, mode: "smart" })` through `start()`, `beginConsent()`, `recordUnit()` and `voiceUnavailable()`.
- KeyPrompt stories set or remove localStorage `riffrec:openai_key`, using a placeholder value, before they render.
- ConsentDialog's VoiceAndStream story is taller than the default 900x700 capture viewport. It uses a stage height of 860 and `overrides.ConsentDialog.viewport = "900x900"`.

## Gotchas
- Changing `viewport` in overrides gives `[CONFIG_STALE]` and needs a full `package-build`. A `cardMode` change can use the targeted `preview-rebuild`.
- The card modes follow validate's GRID_OVERFLOW advice. The fixed or portal components use `single` plus a `primaryStory`. EndedCard and LiveIndicator use `column`.
- In the remote project, `Canvas.dc.html`, `Overview.html`, `support.js`, `_adherence.oxlintrc.json` and `_ds_manifest.json` belong to the app scaffold. Never delete them.

## Known validate warnings
- `[CSS_RUNTIME]` is expected, because the components use inline styles and ship no tokens or stylesheet.
