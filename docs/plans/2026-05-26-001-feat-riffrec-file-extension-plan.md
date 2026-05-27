---
status: active
type: feat
created: 2026-05-26
plan_depth: lightweight
---

# feat: Download sessions as `.riffrec` instead of `.zip`

## Summary

Rename the downloaded session archive from `<sessionDirName>.zip` to `<sessionDirName>.riffrec`. The file remains a standard ZIP archive — only the extension and the advertised MIME type change. Any user (or agent) can rename `.riffrec` back to `.zip` and unzip it with normal tools, or unzip it directly with `unzip foo.riffrec`. The point is brand identity at the file-system level: a `.riffrec` file is unmistakably a Riffrec session bundle.

## Problem Frame

Today the zip-fallback writer produces files like `riffrec-2026-05-26-1430-ab12cd.zip`. That works, but it's indistinguishable from any other zip in the user's Downloads folder, and the `ce-riffrec-feedback-analysis` skill (and humans skimming for the bundle) can only recognize it by the `riffrec-` filename prefix. A bespoke `.riffrec` extension makes the bundle self-identifying and a little fun — same bytes, stronger identity.

## Scope

**In scope**
- Change the download filename suffix from `.zip` to `.riffrec` in `src/output/zip.ts`.
- Change the `Blob` MIME type from `application/zip` to `application/x-riffrec` (with a brief code comment noting it's a zip on the wire).
- Update the returned `sessionPath` string so callers (and `session.ts`'s return value) reflect the new suffix.
- Update README and `docs/requirements.md` references that say "zip download" / "zip file" to "`.riffrec` file (a renamed zip)".
- Update or add a test in `src/output/zip.test.ts` (and `src/output/session.test.ts` if it asserts on the path) that locks in the new suffix.

**Out of scope**
- Changing the `method: "filesystem" | "zip"` discriminant on the writer result. The user-facing artifact name changes; the internal mechanism is still a zip fallback and renaming the discriminant would be churn with no benefit (it would also break the public type surface for hosts that already key off `"zip"`).
- Changing the `ZipWriter` class name or the file name `src/output/zip.ts`. Internally it is still a zip writer.
- Magic-byte detection or OS-level file-type registration (e.g., UTI on macOS, MIME-database `.desktop` entry on Linux). The "it just works because it's a zip" trick is the feature; we don't need OS integration to make it readable.
- Updates to the `ce-riffrec-feedback-analysis` skill description (`riffrec-*.zip`) — that's a separate repo and the skill should be updated in a follow-up PR there once this ships.

### Deferred to Follow-Up Work
- Follow-up PR in `compound-engineering-plugin` updating `ce-riffrec-feedback-analysis`'s `SKILL.md` description and accepted-inputs section to recognize `riffrec-*.riffrec` (and continue to accept `.zip` for back-compat).

## Requirements Traceability

This plan does not have an upstream `ce-brainstorm` requirements document. It traces back to a direct user request: "can we make the download instead of a .zip a .riffrec (its a zip but it just also works?) kinda fun right?"

Implicit success criteria:
1. A user clicking the recorder's stop button on a non-Chromium browser downloads a file named `riffrec-<date>-<time>-<id>.riffrec`.
2. Renaming that file to `.zip` (or running `unzip` on it directly) reveals the same `session.json`, `events.json`, `recording.webm`, etc. layout it has today.
3. Existing tests pass; the new suffix is locked in by an assertion so it can't silently regress.

## Key Technical Decisions

- **MIME type: `application/x-riffrec`.** Custom `x-` MIME types are the conventional way to advertise a private format. We deliberately do *not* keep `application/zip`, because (a) the artifact's brand identity is the whole point of this change, and (b) browsers infer extension from `download="..."` regardless of the Blob type, so the MIME is mostly for completeness. A comment in the code documents that the bytes are still a zip.
- **No fallback to `.zip`.** The user's framing is "make the download a `.riffrec`", not "offer both". Adding a config flag for the suffix would expand the API surface for no real user benefit.
- **Path suffix is changed in exactly one place** (`src/output/zip.ts`), and the returned `sessionPath` propagates the change to `RecordSessionResult.sessionPath`. No additional plumbing.

## Implementation Units

### U1. Change the downloaded archive to `.riffrec`

**Goal:** The zip-fallback writer downloads `<sessionDirName>.riffrec` (still a zip on the wire) and returns the new path string.

**Requirements:** Implicit criteria 1 and 2 above.

**Dependencies:** None.

**Files:**
- `src/output/zip.ts` (modify)
- `src/output/zip.test.ts` (modify — add suffix assertion)

**Approach:**
- In `ZipWriter.writeSession`, change the `triggerDownload` filename argument from `` `${sessionDirName}.zip` `` to `` `${sessionDirName}.riffrec` ``.
- Change the `Blob` constructor's `type` from `"application/zip"` to `"application/x-riffrec"`.
- Update the returned string in the same way.
- Add a one-line comment above the Blob construction noting: the payload is a standard zip; the `.riffrec` extension and MIME are branding, and the file unzips with any zip tool.
- Leave the constant name `MAX_RECORDING_IN_ZIP_BYTES`, the function name `filterZipSessionFiles`, the class name `ZipWriter`, and the file name `zip.ts` alone — those are internal vocabulary about the *mechanism*, not the artifact.

**Patterns to follow:** This file already constructs the download via `triggerDownload(filename, blob)`. The change is local to those two literals and the return statement.

**Test scenarios:**
- The existing `filterZipSessionFiles` test stays as-is (it doesn't touch the suffix).
- New unit test: stub `URL.createObjectURL`, `document.createRange`, and `document.body.appendChild` (or assert on the anchor's `download` attribute via a minimal happy-path test) to verify that `ZipWriter.writeSession("riffrec-2026-05-26-1430-abcdef", new Map([["session.json", new Blob(["{}"])]])).resolves.toBe("riffrec-2026-05-26-1430-abcdef.riffrec")`. Asserting the returned string is sufficient — it's the public contract observed by `session.ts` and downstream callers, and it can't drift from the actual download filename because both come from the same template literal.

**Verification:**
- `npm test` passes, including the new suffix assertion.
- A manual capture in a non-Chromium browser produces `riffrec-*.riffrec`; renaming to `.zip` (or `unzip riffrec-*.riffrec`) reveals the same contents as before.

### U2. Update README and requirements doc wording

**Goal:** User-facing documentation reflects that the fallback download is a `.riffrec` file (still a zip).

**Requirements:** Documentation alignment with shipped behavior.

**Dependencies:** U1 (so wording matches what actually downloads).

**Files:**
- `README.md` (modify)
- `docs/requirements.md` (modify — only the lines describing the fallback artifact, not the historical R-IDs)

**Approach:**
- In `README.md`, update the sentences that mention "zip download" / "zip fallback writes to browser Downloads" / "the session zip" / "shareable as a zip file" to describe the new `.riffrec` extension. Keep a short parenthetical clarifying that `.riffrec` is a renamed zip and can be unzipped with any standard tool. The "Zip fallback" row label in the capability table should be renamed to "`.riffrec` fallback" or similar.
- In `docs/requirements.md`, do a minimal touch: update the prose that describes the artifact extension (R12, R13, R18, "Session zip can be sent to a teammate"). Do **not** rewrite R-IDs or change requirement numbers — append a brief note where natural (e.g., "downloaded as `.riffrec`, a renamed zip").
- Do not touch `CHANGELOG.md` here — `ce-commit-push-pr` will add the entry from the commit message.

**Test scenarios:** none -- documentation-only changes with no executable behavior. The U1 test covers the actual contract.

**Verification:**
- Skim diff: every prose mention of "zip download" or "zip file" in `README.md` and `docs/requirements.md` either now says `.riffrec` or is explicitly framed as the underlying mechanism (e.g., "the `.riffrec` file is a standard zip archive").
- No code-block examples were broken (none reference the extension directly today).

## Risks

- **Downstream consumers parsing by `.zip` suffix.** The `ce-riffrec-feedback-analysis` skill currently matches `riffrec-*.zip`. After this ships, the skill stops auto-matching new bundles by extension until its description is updated. This is the deferred follow-up above. Mitigation: the skill still matches on the *content shape* ("a bundle with `session.json` + `events.json` + `recording.webm` + `voice.webm`"), and users can still rename to `.zip` if they need to in the interim. Low severity — local-to-Kieran's own tooling and trivially fixable in a one-line skill description edit.
- **Browser handling of unknown extensions.** Some browsers (or some OS file managers) may prompt "open with" instead of unzipping on double-click. That's the expected, intentional behavior — `.riffrec` is meant to be opened by Riffrec consumers, not by the OS's default zip handler. Anyone who wants to unzip directly can rename or use `unzip` from the CLI. Not a bug.
- **Future File System Access path (Chromium browsers).** Today, Chromium writes a *directory*, not a single file, so the extension change does not affect that path. If we ever add a "save as single file" option for Chromium, we'd want it to write `.riffrec` too — out of scope here.

## Deferred / Open Questions

- Should the `ce-riffrec-feedback-analysis` skill be updated in the same PR window? Tracked above under Deferred to Follow-Up Work; this plan ships independently and the skill update is a separate one-line edit in a separate repo.
