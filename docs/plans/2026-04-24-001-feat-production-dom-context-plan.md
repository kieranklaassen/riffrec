---
title: "feat: Improve production DOM context capture"
type: feat
status: completed
date: 2026-04-24
origin: "Agentation DOM capture research"
---

# feat: Improve production DOM context capture

## Overview

Improve Riffrec click events so sessions stay useful in production even when React component names are unavailable or minified. Keep React Fiber detection as a development enhancement, but make the production baseline richer through normal DOM APIs: readable element names, stable paths, accessibility labels, nearby context, bounding boxes, and selected computed styles.

## Problem Frame

Riffrec currently captures a click with:

- `component`: nearest React component name when Fiber exposes a readable function name
- `element`: `tag`, `text`, `id`, and a short selector

That is useful in dev, but thin in production. Production React builds often minify component names, and arbitrary Fiber traversal is not a reliable contract. Agentation reaches the same conclusion: production-safe value comes from DOM context, while React component detection remains dev-only unless the app is instrumented.

The goal is not to recover impossible production component names. The goal is to make uninstrumented production sessions useful, and provide a clean future path for explicit component instrumentation.

## Research Summary

Relevant Agentation references:

- `package/src/utils/element-identification.ts`
- `package/src/utils/react-detection.ts`
- `package/src/utils/source-location.ts`
- `package/src/components/page-toolbar-css/settings-panel/index.tsx`

Findings:

- Agentation's element identification is framework-agnostic and production-safe. It derives readable names from tags, text, aria labels, roles, alt text, placeholders, cleaned class names, sibling context, shadow DOM boundaries, computed styles, and accessibility attributes.
- Agentation's React detection is more complete than Riffrec's current `fiber.ts`: it handles Fiber tags, `memo`, `forwardRef`, context, lazy components, filtering, and component paths.
- Agentation still disables React component detection in production UI because production names are unreliable.
- Source location detection is explicitly development-oriented and should not be a production dependency for Riffrec.

## Requirements Trace

- R1. Keep existing click event compatibility: `component` and `element.selector` remain present.
- R2. Add production-safe optional DOM fields to `ElementInfo` without requiring a schema version bump.
- R3. Avoid capturing sensitive form values and hidden/password text.
- R4. Support shadow DOM traversal where possible.
- R5. Improve React dev detection to return a filtered component hierarchy, while preserving the existing nearest-component field.
- R6. Document that production component names require explicit instrumentation such as `data-component`.

## Scope

In scope:

- Richer element metadata on click events.
- Safer text extraction.
- Shadow DOM-aware ancestor traversal.
- Better dev React hierarchy detection.
- Focused tests for DOM metadata and React detection.
- README and plan/requirements updates.

Out of scope:

- A Babel/SWC/Vite plugin for `data-component` injection.
- Source file detection from React `_debugSource`.
- Runtime source-map lookup.
- Mutation recording or full DOM snapshots.
- Large computed-style dumps on every click by default.

## Data Shape

Keep current fields:

```ts
interface ElementInfo {
  tag: string;
  text: string | null;
  id: string | null;
  selector: string;
}
```

Add optional production-safe fields:

```ts
interface ElementInfo {
  name?: string;
  fullPath?: string;
  classes?: string[];
  role?: string | null;
  ariaLabel?: string | null;
  nearbyText?: string | null;
  nearbyElements?: string | null;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles?: Record<string, string>;
}
```

Add optional React hierarchy while preserving `component`:

```ts
interface ClickEvent {
  component: string | null;
  componentPath?: string[] | null;
}
```

`component` remains the nearest useful component name for backward compatibility. `componentPath` is ordered outermost to innermost.

## Implementation Units

- [x] Unit 1: Element identification utilities

Goal: Extract production-safe DOM context in a reusable module.

Files:

- Create: `src/capture/element.ts`
- Modify: `src/capture/events.ts`
- Modify: `src/types.ts`
- Add/modify tests under `src/capture/*.test.ts`

Approach:

- Move selector construction out of `events.ts`.
- Add shadow DOM-aware `getParentElement`.
- Add `buildFullPath(el)` that walks to `html`, crossing open shadow roots and marking host boundaries with an ASCII marker such as `[shadow]`.
- Add `identifyElement(el)`:
  - `data-element`
  - button text or aria-label
  - link text or href
  - input placeholder/name/type, never value
  - image alt
  - role or aria-label for containers
  - cleaned class names for generic containers
- Add `getNearbyText(el)` using safe text extraction.
- Add `getNearbyElements(el)` for concise sibling context.
- Add `getElementClasses(el)` with hash cleanup.
- Add `getAccessibilityInfo(el)` or individual `role`/`ariaLabel` fields.
- Add `getBoundingBox(el)` from `getBoundingClientRect`.
- Add a small computed-style snapshot with only targeted properties:
  - interactive: `backgroundColor`, `color`, `padding`, `borderRadius`, `fontSize`
  - text: `color`, `fontSize`, `fontWeight`, `fontFamily`, `lineHeight`
  - container: `display`, `padding`, `margin`, `gap`, `backgroundColor`

Sensitive text rules:

- Do not read values from form controls.
- Return `null` for password and hidden inputs.
- When collecting nearby text, ignore text inside `input[type="password"]`, `input[type="hidden"]`, `textarea`, `select`, and elements with `aria-hidden="true"`.
- Truncate all text fields.

Tests:

- Button with text and aria-label returns a readable name.
- Input with placeholder/name never captures value.
- Password input returns `text: null`.
- Nearby text excludes sensitive controls.
- Shadow DOM path crosses host boundary.
- CSS module-like hashes are cleaned from class output.
- Bounding box is stable enough under jsdom mocks.

- [x] Unit 2: Rich click event wiring

Goal: Store enriched element metadata on every click without changing the recording lifecycle.

Files:

- Modify: `src/capture/events.ts`
- Modify: `src/types.ts`
- Modify: `src/capture/events.test.ts`

Approach:

- Replace `buildElementInfo` with `buildElementInfo` from `src/capture/element.ts`.
- Preserve current `tag`, `text`, `id`, and `selector`.
- Add optional metadata fields.
- Keep event size controlled with truncation:
  - `text`: 200 chars
  - `nearbyText`: 300 chars
  - `nearbyElements`: 300 chars
  - selector/path: 300 chars
- Skip clicks inside Riffrec UI if any overlay UI starts using identifiable attributes later.

Tests:

- Existing selector test continues to pass or is intentionally updated.
- Click event includes new optional fields.
- Existing minimum JSON shape remains compatible.

- [x] Unit 3: Better React dev component hierarchy

Goal: Improve React development context without pretending production Fiber names are reliable.

Files:

- Modify: `src/capture/fiber.ts`
- Modify: `src/types.ts`
- Add/modify `src/capture/fiber.test.ts`

Approach:

- Add a `getComponentPath(el): string[]` export.
- Keep `getComponentName(el): string | null` as nearest useful component for compatibility.
- Handle common Fiber cases:
  - function/class components
  - `memo`
  - `forwardRef`
  - context providers/consumers when names are meaningful
- Skip host components and framework/internal wrappers.
- Reject minified names:
  - length <= 2
  - short lowercase-only names
- Prefer `data-component` when present, especially if Fiber only yields minified names.
- Use a small default max depth and max component count.

Tests:

- Returns `data-component` without Fiber.
- Falls back to `data-component` when Fiber names are minified.
- Builds ordered component paths from nested fake fibers.
- Handles `memo` and `forwardRef` fake fibers.
- Filters obvious framework internals.

- [x] Unit 4: Documentation and production guidance

Goal: Be explicit about what works in production and what requires instrumentation.

Files:

- Modify: `README.md`
- Modify: `docs/requirements.md`
- Modify: `docs/plans/2026-04-22-001-feat-riffrec-npm-package-plan.md` or add a short follow-up note
- Modify: `CHANGELOG.md`

Approach:

- Document that uninstrumented production sessions include rich DOM context.
- Document that production React component names require `data-component` or future build-time instrumentation.
- Explain that Fiber detection is best-effort and development-oriented.
- Add changelog entry under Unreleased.

- [x] Unit 5: Verification

Commands:

```sh
npm test
npm run typecheck
npm run build
```

Manual verification:

- In a small React app, record a click on a button and inspect `events.json`.
- Confirm production build with no `data-component` still captures useful DOM metadata.
- Confirm production build with `data-component="CheckoutButton"` captures `component: "CheckoutButton"`.

## Key Decisions

- Do not depend on production React internals for component names.
- Keep the schema backward-compatible by adding optional fields.
- Prefer compact, high-signal DOM context over exhaustive DOM snapshots.
- Keep source file detection out of Riffrec for now. It is development-only and higher risk.
- Make future build-time instrumentation a separate package or integration, not part of this immediate change.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sensitive nearby text capture | Use safe text extraction, skip form controls and hidden/password inputs, truncate aggressively |
| Event payload bloat | Use optional fields and strict length limits |
| Computed style overhead | Capture a small property subset only on click |
| Shadow DOM edge cases | Support open shadow roots; document closed shadow roots are not inspectable |
| Type compatibility | Add optional fields only; preserve existing required fields |
| React internals drift | Keep Fiber code isolated in `fiber.ts` and covered by unit tests |

## Follow-Up Work

- Build `riffrec-babel-plugin` or `riffrec/vite` to inject `data-component` and optionally `data-source`.
- Add a config option for DOM detail level if event size becomes an issue.
- Consider optional selected-text capture if Riffrec adds annotation-style workflows later.
