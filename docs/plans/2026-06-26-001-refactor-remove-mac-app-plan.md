---
title: "refactor: Remove the Mac app"
type: refactor
date: 2026-06-26
---

# refactor: Remove the Mac app

## Summary

Remove the standalone Electron/macOS application and its active release and documentation surfaces. Keep Riffrec focused on the React package without changing its capture behavior or published artifact contract.

---

## Problem Frame

Riffrec currently owns two product surfaces: the React package and a standalone macOS feedback browser. The desktop surface adds a separate Electron codebase, packaging dependencies, macOS release automation, privacy behavior, and onboarding path that the project no longer wants to maintain.

The desktop code is isolated under `desktop/`, but active references also appear in the release workflow, README, changelog, requirements, and ignore rules. Removing only the directory would leave broken download instructions and automation behind.

---

## Requirements

### Desktop removal

- R1. The repository no longer contains the Electron desktop package, its assets, packaging scripts, or desktop-only tests.
- R2. GitHub Actions no longer offers a workflow that builds or publishes the macOS preview DMG.

### Product contract

- R3. Current documentation presents Riffrec as a React package and describes only artifacts the package emits.
- R4. Current requirements no longer defer a native macOS companion app as planned product work.
- R5. Historical changelog entries and the prior desktop implementation plan remain intact as records of what shipped and why.
- R6. The React package's source, public API, build outputs, tests, and session schema behavior remain unchanged.

---

## Key Technical Decisions

- **Delete the isolated desktop package instead of extracting shared modules:** The React package does not import from `desktop/`, so extraction would retain complexity without serving the remaining product.
- **Remove active release automation:** A manual workflow targeting deleted files would be broken and would imply continued desktop support.
- **Preserve historical records:** The `2.1.0` changelog entry and `docs/plans/2026-05-29-001-feat-electron-feedback-browser-plan.md` describe past work and should not be rewritten as though it never happened.
- **Do not mutate the published GitHub release:** Repository removal does not authorize deleting an already-published external release; the README will stop linking to it.

---

## Assumptions

- "Remove the Mac app" means removing the tracked Electron application plus its active build, release, and current-documentation surfaces.
- Existing GitHub release assets and tags may remain as historical external artifacts unless separately deleted by the repository owner.
- The existing `.worktrees/` ignore entry is unrelated user work and must be preserved while desktop-only ignore entries are removed.

---

## Scope Boundaries

### In scope

- Delete all tracked files under `desktop/`.
- Delete `.github/workflows/desktop-preview-release.yml`.
- Remove desktop-only ignore rules while preserving unrelated ignore changes.
- Rewrite current README sections that promote or define desktop-only behavior.
- Add an unreleased changelog note for the removal and retire the deferred Swift companion from current requirements.

### Out of scope

- Deleting GitHub releases, tags, or assets that already exist remotely.
- Rewriting historical release notes or the prior desktop implementation plan.
- Changing React capture, serialization, packaging, or runtime behavior.

---

## Implementation Units

### U1. Remove desktop implementation and release automation

- **Goal:** Eliminate the maintained Mac application and every executable path that builds or publishes it.
- **Requirements:** R1, R2, R6
- **Dependencies:** None
- **Files:** Delete `desktop/`; delete `.github/workflows/desktop-preview-release.yml`; modify `.gitignore`.
- **Approach:** Remove the isolated package and release workflow as a unit, then remove only the three desktop-specific ignore entries. Preserve `.worktrees/` and all React package files.
- **Patterns to follow:** Respect the existing package boundary in `package.json` and `tsconfig.json`, neither of which includes `desktop/`.
- **Test scenarios:**
  1. Repository tracking contains no file under `desktop/` and no desktop preview workflow.
  2. The root package installs, type-checks, tests, and builds without a desktop package present.
  3. The unrelated `.worktrees/` ignore rule remains after desktop ignore rules are removed.
- **Verification:** The repository has one maintained TypeScript package and its complete automated suite remains green.

### U2. Retire the active desktop product contract

- **Goal:** Make current project documentation accurate after the app is removed while retaining historical context.
- **Requirements:** R3, R4, R5, R6
- **Dependencies:** U1
- **Files:** Modify `README.md`, `CHANGELOG.md`, and `docs/requirements.md`; retain `docs/plans/2026-05-29-001-feat-electron-feedback-browser-plan.md` unchanged.
- **Approach:** Remove desktop download, build, workflow, archive, and privacy copy from the README. Describe session files and privacy solely for the React integration, add an unreleased removal note, and remove the deferred native companion from the current requirements.
- **Patterns to follow:** Keep the README's existing React integration, API, browser support, session format, privacy, and bundle sections; keep prior version entries immutable below the new unreleased changelog section.
- **Test scenarios:**
  1. A new user following the README encounters no desktop download, DMG, Electron, or Mac-app instructions.
  2. The README's session format matches the root package's emitted archive files and optional-media behavior.
  3. Historical changelog and plan text still record the desktop release, while current requirements no longer plan a companion app.
- **Verification:** Searches find desktop references only in explicitly historical artifacts, not in active product, build, or release instructions.

---

## System-Wide Impact

- **Users:** New users are directed only to the React integration; the repository no longer advertises a downloadable Mac app.
- **Maintainers:** Electron dependencies, desktop security/privacy ownership, macOS packaging, and DMG release operations disappear.
- **Automation:** The root package's existing build, typecheck, and test scripts become the complete maintained validation surface.

---

## Risks and Mitigations

- **Stale desktop claims survive in current docs:** Search the repository after editing and classify each remaining result as historical or unintended.
- **Unrelated local work is overwritten:** Limit the `.gitignore` edit to desktop-only entries and preserve the existing `.worktrees/` change.
- **Root behavior accidentally changes during cleanup:** Do not modify `src/`, root manifests, lockfile, build config, or generated `dist/`; run the complete root validation suite.

---

## Documentation and Operational Notes

The published desktop preview release may remain reachable by direct URL, but it will no longer be linked or reproducible from the maintained repository. Removing that remote release is a separate owner action because it changes external state and historical availability.

---

## Sources and Research

- `docs/plans/2026-05-29-001-feat-electron-feedback-browser-plan.md` documents the desktop package boundary and the product surfaces introduced with it.
- `.github/workflows/desktop-preview-release.yml` is the only desktop release workflow.
- `README.md`, `CHANGELOG.md`, `.gitignore`, and `docs/requirements.md` contain the active or historical references that must be classified during removal.
- No `docs/solutions/` corpus, `STRATEGY.md`, or `CONCEPTS.md` exists in this repository, so there are no additional institutional constraints to carry forward.
