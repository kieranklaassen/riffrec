---
title: Live Voice Mode - Plan
type: feat
date: 2026-09-15
topic: live-voice-mode
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Live Voice Mode - Plan

## Goal Capsule

- **Objective:** RiffRec gains a **live mode** that delivers a session as a stream — voice transcript, units, drawings, evidence, events — to a configured endpoint instead of a zip at `stop()`, and `ce-polish` gains a **live mode** that consumes that stream: the user's own running coding agent wakes at checkpoints with batched units and applies them per a user-selected execution mode. Both parts ship together as one work unit; the stream has no consumer without polish, and polish has no stream without riffrec.
- **Product authority:** Kieran Klaassen's voice note (2026-09-14) and the brainstorm dialogue of 2026-09-14/15, revised after the document review of 2026-09-15. Then this plan's Planning Contract, then each target repo's conventions (`README.md` and `docs/requirements.md` in riffrec; `AGENTS.md` in the Compound Engineering plugin). Surrounding areas — the dashboard as a hosted consumer, non-React hosts, fleet rollout, collaborator and client-tester audiences without their own agent — are not active scope (see How This Work Fits Together).
- **Execution profile:** two repositories, ten units. Units U1 (contract and test harness), U8 (endpoint helper), and U9 (skill prose) start now; the rest follow the dependency graph in the Planning Contract. Each unit is written to be executed by a separate agent in a fresh clone of its repository.
- **Stop conditions:** stop and report if the OpenAI Realtime API no longer offers browser-side ephemeral client secrets with function tools; if `perfect-freehand`'s license or size changes such that KD "Drawing layer" cannot hold; if the Compound Engineering plugin's skill-conventions test forbids a bundled Node helper under `skills/ce-polish/scripts/`; or if implementing any session-settled decision proves infeasible (report with the token `settled-decision-invalidated`).
- **Tail ownership:** each unit's implementer runs its Verification Contract gates and satisfies its test scenarios; the riffrec release (U7) and the CE plugin release (U10) each end with their repo's full gate green; the cross-repo smoke in Definition of Done is run by whoever lands the second of the two releases.
- **Product Contract preservation:** restructured, no scope change. Requirements, Actors, Flows, and Acceptance Examples are unchanged from the reviewed 2026-09-15 text. Three Key Decisions that carried an open default (execution mode, Informed Interviewer, setup-commit branch) now state the default as resolved per KTD11, KTD13, KTD14 — the user directed planning to proceed on the defaults. Outstanding Questions' planning-owned items moved into KTDs or Deferred to Implementation; the review's `Deferred / Open Questions` entry (mode switch mid-session) is resolved in KTD12 and removed; Scope Boundaries gained a `Deferred to Follow-Up Work` list.

---

## Product Contract

### Summary

Add a live mode to the `riffrec` package: a voice interviewer, a drawing layer, and a units board run inside the host app, and the session streams to an endpoint as it happens. Add a live mode to `ce-polish` that runs the local endpoint, installs riffrec when missing, wakes the running coding agent at checkpoints, and applies accepted units per an Instant / Smart / Collect switch. The dashboard becomes the second consumer later.

### Problem Frame

Today a RiffRec session is a zip you hand to an agent afterwards. Everything the person meant by "this", "here", and "that color" has to be reconstructed from a screen recording, a voice track, and an events file, minutes or hours later, by an agent that cannot ask. When the agent guesses wrong, the person finds out at PR time and re-records. Atelier's capture loop (decision D58) closes the distance by opening a Cursor pane on the zip immediately, but the agent still cannot interrupt, cannot see what was pointed at, and cannot ask "which one?" while the person is still looking at it.

Meanwhile `ce-prototype` already proves the other half: a person annotates a running page, hits Send, and a parked CLI agent wakes with the batch, applies the clear edits in place, and talks about the rest. That loop only works on isolated screens the helper serves, not on a real app, and it has no voice.

The cost shape is latency and lossy intent: feedback that was precise in the moment arrives as evidence to be interpreted, and the interpreting agent has no channel back to the person while the moment is still live.

### Key Decisions

- **RiffRec owns the capability; `ce-polish` is the first consumer; the dashboard is a later consumer.** Live mode must serve non-coding sessions (a collaborator riffing on Thinkroom with no agent attached), so the stream, overlay, voice widget, and board live in the package, and consumers only provide an endpoint. A collaborator with no agent gets the voice interviewer only once a consumer that mints Realtime secrets exists — a host app's own server or the dashboard; until then such a host runs the drawing layer, board, and recorder without voice. (session-settled: user-directed — chosen over a new `ce-riff` CE skill owning everything and over the dashboard-hosted original: the user did not want everything in Compound Engineering and wants streaming delivery to work outside coding.) Governs R1–R4, R27–R29.
- **The stream contract is the public API, as the zip schema is today.** Plain HTTP POST from page to endpoint, SSE from endpoint to page, and a blocking long-poll wake from endpoint to agent — the `ce-prototype` helper's three legs, kept. No WebSockets. Every route the endpoint exposes requires a credential, and the contract is versioned like the zip schema. Governs R2, R3, R30–R33.
- **A zip is a stream that was never sent.** `stop()` always assembles today's archive, recording included, and honors `download` and `onSessionComplete`. With no endpoint configured no interviewer runs, because nothing can mint its secret, and the archive adds annotations. When an endpoint becomes unreachable mid-session the interviewer continues on its open connection, events buffer locally, and the archive adds transcript, units, and annotations. Existing zip consumers keep working. Governs R4.
- **Two brains: a Realtime voice interviewer in the browser and the consumer's coding agent.** The interviewer extracts units and asks clarifying questions the moment speech is vague; the coding agent judges and acts at checkpoints. Chosen over a single-agent loop that transcribes straight to the coding agent, which cannot ask until a checkpoint. Governs R5–R9.
- **OpenAI Realtime is the sole v1 voice provider.** Chosen for ephemeral client secrets, WebRTC, semantic turn detection, and function tools proven in `breathwork-live`. Live polish therefore needs an OpenAI account in addition to the user's coding-agent provider; other voice providers behind a provider boundary are deferred. Governs R5, R34.
- **Informed Interviewer, degrading to plain Interviewer.** When the consumer supplies a session brief (for polish: routes, component names, design tokens, recent changes, written by the coding agent at session start), the interviewer's instructions carry it so its questions are grounded in the app. The brief is non-secret app metadata — never environment values, credentials, or user data — and it is sent to OpenAI as session instructions. Without a brief the interviewer runs on the package default persona. Adopted for v1 on the brainstorm's stated default (KTD13). Governs R7, R35.
- **The v1 interviewer hears and reads; it does not see.** Audio and text only. A consumer-supplied tool set may not carry image content; frames go to the endpoint, never to OpenAI. A frame-seeing interviewer is deferred until the ablation shows whether frames help the coding agent. Governs R7, R22.
- **Two lanes.** Units appear on the board instantly and optimistically from the interviewer; the coding agent wakes only at a checkpoint. (session-settled: user-directed — chosen over continuous per-unit wake, wake only on the user's cue, and interviewer-decides-alone: speed where the user is looking, judgment where it is expensive.) Governs R10–R12, R36.
- **Checkpoints are a stream event, coarser than an utterance.** The interviewer emits one when the riffer falls silent for longer than a threshold set in planning, or changes pages; the overlay's Send control emits one on demand. One sentence per change must not become one wake per unit. Consumers decide what a checkpoint triggers; polish flushes held units into the agent's wake. Governs R12, R36.
- **Execution mode is a user switch in the UI: Instant, Smart, Collect.** All three act at checkpoint cadence; they differ in what the agent does with a batch, not when. (session-settled: user-directed — chosen over a single fixed policy.) Default is Smart (KTD11). Governs R37, R38.
- **Capture everything; attach a tunable evidence profile; decide the default by experiment.** (session-settled: user-directed — chosen over a fixed Lean/Rich/Everything tier: the user wants as much evidence as possible captured, screenshots rather than video on the wire, and an ablation to learn what helps the agent.) Starting default on the wire: transcript excerpt, anchors, structured strokes, one composited frame. Anchors are part of every unit regardless of profile. Governs R10, R17–R21, Success Criteria.
- **Drawing layer is a thin custom overlay on `perfect-freehand` plus the prototype's pin mechanics.** No tldraw in the package: tldraw's production license-key requirement would fall on every host app that runs riffrec live in production. Excalidraw stays an optional host-provided adapter later. (session-settled: user-directed — chosen over tldraw SDK and Excalidraw: no production license or key may be imposed on host apps, and the package must stay light enough to ship into every fleet app.) Governs R13–R16.
- **Full loop in v1, no staged slice.** Voice interviewer, units board, drawing overlay, agent wake, and the execution-mode switch ship together. (session-settled: user-directed — chosen over any single-slice first cut.) Scope risk: this is five surfaces across two repositories landing at once; the plan accepts it and names it here once.
- **R17 of the original RiffRec requirements is rewritten, not deleted.** The package still holds no long-lived key and makes no server-side LLM calls; the voice widget connects to OpenAI Realtime from the browser using an ephemeral secret the endpoint mints. Governs R5, R28.
- **Coverage is React-first.** The package stays React-first. Avoid gratuitous React coupling in the overlay, board, and voice widget, but no maintained framework-agnostic boundary is required in v1; the script embed stays deferred. Resolved after review against the agent's earlier assumption of a required boundary. Governs R29.
- **Installing riffrec is a disclosed, permanent setup commit.** Live polish tells the riffer, before installing, that live mode adds riffrec to the app as a dependency and a provider mount, committed on the current branch; riffrec stays after the session, matching the fleet posture. The commit lands on the current feature branch (KTD14). Governs R34, R35.
- **Remote sessions are first-class.** The endpoint and dev server may run on a different machine than the browser, reached over a LAN, Tailscale, or a TLS-terminating tunnel, following the prototype's host-follows-the-browser mechanics; when the page is HTTPS, the endpoint origin is HTTPS too. Governs R40–R42.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan owns RiffRec live mode and `ce-polish` live mode as one unit. The breakdown below is the current understanding, not a committed roadmap.

- **Dashboard as second consumer** — Depends on this plan's stream contract. The dashboard receives the stream instead of a zip, mints Realtime secrets for hosts that have no server of their own, a hosted Cursor agent triages, and `/integrate/:stack` teaches live-mode configuration. Still to decide: whether to reverse the dashboard's KTD12 (polling over SSE) or mirror local sessions only. Serves collaborators without an agent and clients' testers, and is what gives a no-agent host the voice interviewer.
- **Framework-agnostic embed** — Enables non-React hosts. Can proceed independently; it introduces the framework boundary R29 no longer requires in v1.
- **Fleet rollout via compound-stack-rails** — Depends on the riffrec release; owns the agent-executable changelog entry. Template-derived apps ship a no-op riffrec stub at a drop-in point keyed on `RIFFREC_ENDPOINT`, so the entry installs the real package there, maps that configuration to the live-mode endpoint, and enables live mode. Not a requirement of this plan.
- **`ce-riffrec-feedback-analysis`** — Shares the zip fallback (R4); no change required, and its Setup route may point at `ce-polish` live mode later.
- **Atelier capture loop (D58) and Thinkroom feedback runs** — Can proceed independently; they consume zips and are unaffected by R4.

### Actors

- A1. **Riffer** — the person using the host app while talking and drawing. In v1 usually the developer who owns the repo and runs the coding agent; may be a collaborator at the same keyboard or on the same network.
- A2. **Voice interviewer** — the OpenAI Realtime agent running in the browser inside riffrec live mode. Extracts units, asks clarifying questions, emits checkpoints, voices the coding agent's follow-ups.
- A3. **Coding agent** — the riffer's own running CLI agent (Claude Code, Codex, Cursor, or another harness) executing `ce-polish` live mode. Wakes at checkpoints, triages, applies, asks.
- A4. **Endpoint** — the consumer's receiver for the stream and the minter of the interviewer's secret. For polish, the local helper the skill runs; later, the dashboard or a host app's own server.
- A5. **Host app** — the React application riffrec is installed in and polish is running.

### Requirements

**RiffRec live mode — session and delivery**

- R1. Live mode is a first-class session mode of the `riffrec` package, activated by configuration on the provider, with the host app choosing when the riffer can start it.
- R2. A live session delivers its events to one configured endpoint as they happen, using the stream contract in R30–R33.
- R3. The stream carries today's event union (clicks with selector, component, bounding box and nearby context; navigation; network outcomes; console errors) plus the new event kinds: transcript, unit, unit status, annotation, checkpoint, question, and answer.
- R4. `stop()` always assembles today's archive with the recording and honors `download` and `onSessionComplete`. With no endpoint configured the interviewer does not run and the archive adds annotations beside `events.json`. When the endpoint becomes unreachable mid-session the interviewer continues, events buffer locally, and the archive adds transcript, units, and annotations. Media and event schema stay compatible with existing consumers.

**RiffRec live mode — voice interviewer**

- R5. The voice widget connects to OpenAI Realtime from the browser using an ephemeral secret minted by the endpoint; the package never holds a long-lived key, and no provider configuration option accepts one.
- R6. The interviewer listens continuously while the session is live and can be muted by the riffer at any time.
- R7. The interviewer extracts units from speech, asks a clarifying question immediately when an instruction is ambiguous, and accepts a consumer-supplied brief and tool set that shape its questions and vocabulary; the brief carries no secrets, environment values, or user data, and the tool set carries no image content.
- R8. The interviewer voices questions that arrive from the endpoint only at a natural pause in the riffer's speech, never mid-thought.
- R9. The interviewer runs in a conversation mode where the riffer can interrupt it.

**RiffRec live mode — units and board**

- R10. A unit is one requested change with a stable id, the riffer's words, a normalized statement, its anchors (route and the elements pointed at, clicked, or drawn on — always present), attached evidence per the profile in R19, and a status.
- R11. Unit status follows initial → triaging → accepted or needs-info, plus applied and blocked when a consumer acts, and withdrawn when the riffer retracts a unit before its checkpoint; the board shows the current status of every unit, strikes through withdrawn ones, and shows the question attached to a needs-info unit.
- R12. Units appear on the board the moment the interviewer extracts them, as initial; endpoint status updates overwrite by id. A checkpoint marks the point up to which held units are released to the consumer, emitted by the interviewer when the riffer falls silent for longer than a threshold set in planning or changes pages, and by the overlay's Send control on demand; withdrawn units are excluded from the batch.

**RiffRec live mode — drawing and annotation**

- R13. A shortcut or overlay control toggles a drawing layer over the whole host app; while it is on, pointer input draws instead of operating the app, and toggling it off restores the app.
- R14. Strokes are freehand with a hand-drawn feel; a pin places a typed or spoken note on an element.
- R15. Every stroke and pin is anchored: its points, its bounding box, the element it lands on as selector and component when available, that element's rect, and the route.
- R16. Drawing made while a unit is being spoken attaches to that unit; drawing made in silence becomes its own unit with the drawing as the statement.

**RiffRec live mode — evidence**

- R17. The session records the screen locally for the zip path, segmented at full page reloads: segments are persisted as they are produced, the archive includes every segment, and after a reload the overlay asks the riffer once to re-share the screen before capture resumes. Video is never sent over the stream.
- R18. The session captures a screenshot when a unit is extracted and periodically on an interval, plus a composited frame of the current view with the riffer's strokes drawn on it whenever an annotation completes.
- R19. What attaches to a unit on the wire is an evidence profile the consumer declares per session; the starting default is transcript excerpt, anchors, structured strokes, and one composited frame.
- R20. Every attached artifact is unambiguous to a coding agent: images carry the route and timestamp, strokes carry their anchors, and structured data and images that describe the same annotation cross-reference by id.
- R21. A ±10s window of network and console events and a short audio clip of the utterance are available in the profile for consumers that want them.

**RiffRec live mode — privacy and consent**

- R22. Before a live session starts, the riffer sees and accepts what will be streamed and to whom, derived from the active evidence profile: microphone audio and the session brief to OpenAI; transcript, screenshots, frames, events, and any profile-enabled audio clips or telemetry windows to the named endpoint. The consent step requests microphone access; a missing or denied microphone is reported to the riffer and the endpoint, and the session may continue with drawing and board only.
- R23. A visible live indicator is present for the whole session and distinguishes streaming to the endpoint, buffering locally because the endpoint is unreachable, and microphone muted.
- R24. Existing production guards apply unchanged: live mode is disabled in production unless the host opts in, and credential-like parameters are redacted from every streamed URL.
- R25. Screenshots and frames exclude nothing automatically; the consent copy says so, and the riffer can pause frame and stream capture. Pause never interrupts the local screen recording in R17.
- R26. A collaborator session inherits the same consent flow and indicator; the endpoint owner is named in the consent copy.

**RiffRec live mode — compatibility and distribution**

- R27. The zip format, the host-managed output contract (`download`, `onSessionComplete`), and the existing recorder UI keep working for hosts that do not enable live mode.
- R28. The package documents that live mode connects to OpenAI Realtime from the browser and how an endpoint mints the ephemeral secret; the README's "does not call an LLM" statement is replaced accordingly.
- R29. The overlay, board, and voice widget avoid gratuitous React coupling; no maintained framework-agnostic boundary is required in v1.
- R30. The stream contract is versioned: every envelope carries a `schema_version`, breaking changes are documented in the CHANGELOG, and TypeScript types for stream events, units, and annotations are exported for consumer authors.

**Stream contract**

- R31. Page → endpoint: HTTP POST of small JSON event envelopes with client sequence numbers, retried on failure, authenticated by a per-session token the endpoint issued; the mint of the interviewer's secret carries the same token.
- R32. Endpoint → page: a server-sent event stream, opened with the session token, carrying unit status updates, applied notices, questions for the interviewer to voice, and session end.
- R33. Endpoint ↔ agent: one blocking long-poll wake, authenticated by the endpoint's file token, that returns the batch of held units, annotations, and answers since the last checkpoint, exit 0; session ended, exit 1; error, exit 2 — the `ce-prototype` helper's contract. The agent's status updates and questions post back to the endpoint with the same token. No endpoint route answers without a credential.

**ce-polish live mode — start**

- R34. At the start of Run, before the dev server starts, `ce-polish` asks once: live or traditional. Traditional is today's loop unchanged. Live requires an OpenAI key in the environment and reports a missing key instead of starting; the prompt discloses that live mode adds riffrec to the app as a setup commit on the current branch when it is missing.
- R35. Live mode starts the local endpoint, installs riffrec into the host app when it is missing as a setup commit on the current feature branch, configures live mode to point at the endpoint, hands the riffer the verified URL, and writes the session brief for the interviewer. If the riffer declines the consent screen, no session starts: polish stops the endpoint, offers traditional, and names the setup commit that remains.

**ce-polish live mode — agent wake and execution modes**

- R36. The coding agent parks on the wake and receives the held batch at each checkpoint; it never acts on units before a checkpoint.
- R37. The execution mode is a switch on the overlay with three positions, all acting at checkpoint cadence: **Instant** applies every unit the agent can act on without asking, in parallel where units are independent, and applies its best reading of ambiguous units while noting the guess on the unit; **Smart** applies clear bounded edits, turns ambiguous units into questions, and sends units larger than polish to the residual list; **Collect** applies nothing during the riff and applies the accepted batch as one pass when the riffer says done.
- R38. Applied edits land on the current feature branch with hot reload; the live session — voice, board, strokes, pins, transcript — survives a page reload or a page crash, and the interviewer re-seeds its context from the transcript when its connection is replaced. Screen capture is the one part that needs a riffer gesture to resume (R17). A crash never ends the session or downloads an archive mid-riff. When the page's stream drops shortly after an applied edit and does not reconnect, the endpoint marks the batch page-lost and the agent restores the page — fix or revert — before parking its next wake.
- R39. Every question the coding agent has for the riffer is posted to the endpoint and voiced per R8; the agent then re-parks the wake with the unit in needs-info, and the riffer's answer arrives as an answer event in a later batch and resumes that unit.

**ce-polish live mode — remote sessions**

- R40. The endpoint and dev server may run on a different machine than the browser; the skill can bind the endpoint on all interfaces and hand the riffer a URL with only the host rewritten, disclosing that the endpoint and the dev server are reachable on that network. The endpoint serves no files from its run directory.
- R41. The overlay reaches the host app and the endpoint over an origin pair the skill states plainly; POST, SSE, and the agent wake all work through proxies and tunnels.
- R42. When the browser is not on localhost, the URL the riffer opens is HTTPS so microphone and screen capture are permitted, and the endpoint origin is HTTPS too so the browser does not block it as mixed content; the skill refuses to hand over a plain-HTTP endpoint behind an HTTPS page and tells the riffer when a tunnel does not terminate TLS.

**ce-polish live mode — session end**

- R43. When the riffer says done, polish applies per the active mode, commits via `ce-commit`, and reports the commits, the still-running URL, and a **residual list**: units that were needs-info, blocked, or beyond polish, written where the riffer can hand them to planning.
- R44. The riff — the ordered stream with full evidence, units with status, annotations, the evidence profile used, and the riffer's per-unit confirmation of intended element and change captured at session end — is kept as a local session log under the run's scratch directory and can be re-emitted to an endpoint under any profile; nothing is pushed or opened as a PR.

### Key Flows

- F1. **Start a live polish session**
  - **Trigger:** The riffer runs `/ce-polish` on a feature branch.
  - **Actors:** A1, A3, A4, A5
  - **Steps:** Polish resolves the workspace and asks live or traditional, disclosing the riffrec install. Live checks for the key, starts the endpoint, installs riffrec if missing, starts or attributes the dev server, writes the brief, hands over the URL. The riffer opens it, sees the consent screen naming what goes where, grants the microphone, accepts, and the interviewer greets them. Declining ends the attempt: polish stops the endpoint and offers traditional.
  - **Covered by:** R1, R5, R22, R34, R35

- F2. **Riff to applied change**
  - **Trigger:** The riffer says "this toggle should live up in the header" while pointing at it.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The interviewer extracts a unit with the clicked element as anchor; the board shows it as initial. The riffer draws a circle and an arrow; the strokes attach to the unit with a composited frame. The riffer moves on to another page; the interviewer emits a checkpoint. The endpoint releases the batch; the coding agent wakes, triages the unit as accepted, applies it (Smart), posts applied; the board updates; the interviewer says "moved — reload when you like."
  - **Covered by:** R10–R12, R15, R16, R18, R36–R38

- F3. **Question routed back**
  - **Trigger:** The coding agent finds two header variants and cannot choose.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The agent posts a question on the unit and re-parks its wake; the unit shows needs-info with the question. The interviewer waits for the riffer to finish their current thought, voices the question, and captures the answer as an answer event. The next checkpoint carries the answer in its batch; the agent resumes the unit.
  - **Covered by:** R8, R11, R39

- F4. **Endpoint absent or lost**
  - **Trigger:** A host app enables live mode with no endpoint, or the endpoint stops answering mid-session.
  - **Actors:** A1, A2, A5
  - **Steps — no endpoint configured:** No interviewer starts. The riffer records, draws, and pins; drawing-only units appear on the board as initial. At `stop()` the archive carries `events.json`, the recording, and annotations, and the download notice tells the riffer to share it.
  - **Steps — endpoint lost mid-session:** The interviewer keeps extracting units on its open connection; the indicator switches to buffering locally; the board keeps showing units as initial. At `stop()` the archive adds transcript, units, and annotations.
  - **Covered by:** R4, R23, R27

- F5. **Remote session**
  - **Trigger:** The agent and dev server run on the Mac mini; the riffer's browser is on a laptop.
  - **Actors:** A1, A3, A4
  - **Steps:** Polish binds the endpoint and the dev server on the chosen interface, rewrites only the host in the URL, states the app and endpoint origins, and confirms both are HTTPS through the tunnel. The riffer opens the tunnel URL; consent, streaming, SSE, and the agent wake proceed as in F1–F3.
  - **Covered by:** R40–R42

```mermaid
flowchart TB
  P[Host app page: riffrec live mode] -->|HTTP POST events, units, annotations, checkpoints - session token| E[Endpoint: polish helper]
  E -->|SSE: unit status, applied, ask, session end - session token| P
  E -->|blocking wake returns held batch at checkpoint - file token| A[Coding agent]
  A -->|POST unit status and questions - file token| E
  P <-->|WebRTC audio and tool calls| O[OpenAI Realtime]
  E -.->|mints ephemeral secret - session token| P
```

```mermaid
stateDiagram-v2
  [*] --> initial: interviewer extracts unit
  initial --> withdrawn: riffer retracts before checkpoint
  initial --> triaging: checkpoint releases batch
  triaging --> accepted
  triaging --> needsInfo: agent posts question and re-parks
  needsInfo --> triaging: answer event arrives in a later batch
  accepted --> applied: Smart or Instant edit lands
  accepted --> blocked: agent cannot apply
  accepted --> [*]: Collect mode, applied at done
```

### Acceptance Examples

- AE1. **Covers R12, R36.** Given the riffer has spoken three units on one page without a pause longer than the checkpoint threshold, when they navigate to another page, then the interviewer emits a checkpoint, the three units are released as one batch, and the coding agent wakes once.
- AE2. **Covers R37.** Given execution mode is Collect, when the coding agent wakes with an accepted unit, then nothing in the app changes until the riffer says done, and the unit stays accepted on the board.
- AE3. **Covers R37.** Given execution mode is Smart, when a unit reads "make this red" with a clear anchor, then the agent applies it at the checkpoint; when a unit reads "rethink the onboarding flow", then it goes to the residual list and the board shows it as blocked with that reason.
- AE4. **Covers R16.** Given the riffer draws a box around a card while saying nothing, when the stroke completes, then a unit is created whose statement is the drawing and whose anchor is the card's selector.
- AE5. **Covers R4.** Given a host enables live mode without an endpoint, when the riffer stops, then no interviewer ever spoke, the downloaded zip contains `events.json`, the recording, and annotations, and `ce-riffrec-feedback-analysis` reads it without changes.
- AE6. **Covers R8, R39.** Given the coding agent posts a question while the riffer is mid-sentence, when the riffer finishes the sentence, then the interviewer voices the question and not before, and the agent is already parked on its wake.
- AE7. **Covers R17, R38.** Given Smart mode applies an edit that triggers a full page reload, when the page comes back, then the board, strokes, pins, and transcript are still there, the interviewer resumes without asking the riffer to repeat themselves, and the overlay asks once to re-share the screen.
- AE8. **Covers R34.** Given no OpenAI key in the environment, when the riffer picks live, then polish names the missing key and offers traditional instead of starting a session.
- AE9. **Covers R42.** Given the page is reached over plain HTTP on another machine, when polish hands over the URL, then it says microphone and screen capture will be refused until the URL is HTTPS.
- AE10. **Covers R4, R23.** Given a session whose endpoint stops answering after ten units, when the riffer keeps talking and then stops, then the indicator showed buffering locally from the moment of loss, and the zip contains transcript, units, and annotations for the whole session.
- AE11. **Covers R42.** Given the page is HTTPS through a tunnel and the endpoint origin is plain HTTP, when polish prepares the handoff, then it refuses to hand over that pair and names the endpoint origin as the one that must be HTTPS.
- AE12. **Covers R11, R12.** Given the riffer says "make this red — no, forget that", when the checkpoint fires, then the unit shows as withdrawn on the board and the coding agent's batch does not contain it.
- AE13. **Covers R38.** Given Instant mode applies an edit that crashes the page, when the page's stream does not reconnect, then the endpoint marks the batch page-lost, the session does not end and no archive downloads, and the agent's next action is to fix or revert before it parks again.
- AE14. **Covers R35.** Given polish installed riffrec and started the endpoint, when the riffer declines the consent screen, then no session starts, the endpoint stops, polish offers traditional, and its report names the setup commit.
- AE15. **Covers R37.** Given execution mode is Instant, when a unit reads "make the header nicer" with a clear anchor, then the agent applies its best reading at the checkpoint and the unit shows the guess it made.

### Success Criteria

- A riffer on Thinkroom can talk and draw for five minutes and end with applied commits for the clear units, a spoken answer for every ambiguous one, and a residual list for the rest — without opening a terminal.
- Every applied change traces to a unit whose anchors name the element that was pointed at; no applied change traces to a guess about "this" or "here".
- **Evidence ablation:** the same session log is re-emitted to the coding agent under at least three evidence profiles (transcript and anchors only; transcript, anchors, strokes, and composited frame; everything), and triage accuracy and applied-change correctness are scored against the riffer's per-unit confirmation captured at session end (R44). The winning profile becomes the default in R19 and the plan is updated to say so.
- A collaborator at the riffer's machine can run a session without seeing a key, a token, or a terminal.
- Hosts that never enable live mode see no change in bundle behavior and no new network calls.

### Scope Boundaries

**Deferred for later**

- The dashboard as a hosted consumer: live streams to dashboard.riffrec.com, a hosted Cursor agent triaging, mirroring local sessions to the board. With it, collaborators without an agent and clients' testers.
- A framework-agnostic script embed for non-React hosts.
- Alternative Realtime voice providers behind a provider boundary.
- A frame-seeing interviewer, once the ablation shows whether frames help.
- Excalidraw as a host-provided adapter for full-canvas sketching.
- Per-unit voice overrides ("just do it", "note it") layered on the execution mode.
- A clean, un-annotated frame alongside the composited one if strokes prove to occlude what matters.

**Outside this product's identity**

- A browser extension or bookmarklet as the overlay carrier.
- Riffrec Desktop as the live-mode carrier.
- An injecting proxy in front of the dev server.
- Any CE-hosted relay or telemetry; the endpoint is always the user's own or a host they chose.
- Autonomous review or QA during a riff; the coding agent acts only on what the riffer asked.

**Deferred to Follow-Up Work**

- The compound-stack-rails changelog entry that installs the real package at the template's stub drop-in and maps `RIFFREC_ENDPOINT` (the stub's commented `mount({ endpoint, publicKey })` API diverges from riffrec's real surface and needs reconciling there).
- Enabling live mode in Thinkroom and Atelier: both already mount `RiffrecProvider forceEnable`; enabling live mode is a `live` configuration once the riffrec release ships.
- An agent-initiated checkpoint request (the coding agent asking for the batch early).
- A richer terminal board mirror beyond the wake envelope and the helper's `status` summary.

### Dependencies / Assumptions

- OpenAI Realtime API with ephemeral client secrets, WebRTC connection, input transcription, semantic turn detection, and function tools, as used in `breathwork-live`. The Realtime session cannot be resumed after disconnect; R38 depends on re-seeding from the transcript.
- A browser display-capture stream dies with the page and can restart only from a user gesture; R17's segmentation depends on this.
- The riffer's OpenAI key lives in their shell environment for polish sessions; the value from `breathwork-live` is reused by exporting it, never by reading that app's configuration.
- `ce-prototype`'s helper is copied into `ce-polish`, not imported; CE skills are self-contained.
- A parked CLI agent is single-threaded; Instant mode's parallelism comes from the agent spawning work, not from the wake returning more than once.
- Thinkroom and Atelier run riffrec with `forceEnable` in production; template-derived fleet apps ship a no-op stub with a drop-in point (see How This Work Fits Together). Live-mode consent and indicator requirements assume the `forceEnable` posture.
- Hot reload keeps the page's JavaScript state on most edits; full reloads and crashes are the cases R38 covers.
- Evidence: the pain of the zip flow is asserted from the user's experience and Atelier D58, not from measured sessions; the ablation in Success Criteria is the first measurement.

### Outstanding Questions

**Deferred to Implementation**

- Exact checkpoint silence threshold, retroactive-attach window, and page-lost grace window; KTD9 and KTD10 give defaults to start from.
- Periodic screenshot cadence and frame resolution; start at one frame every 10 seconds at viewport size, halve if the session log grows past 200 MB per ten minutes.
- How much transcript re-seeds the interviewer after a reconnect; start with the last two minutes and the statements of all non-withdrawn units, capped at 6,000 characters.
- Whether the helper gains a TLS option or relies on the tunnel; v1 relies on the tunnel and documents Tailscale serve, cloudflared, and ngrok.
- Which `ce-polish` framework recipes can host riffrec live mode; v1 supports the React-hosting recipes (Vite with React, Next, Remix, Rails with Inertia React via the Procfile recipe) and says so on a non-React project.

### Sources / Research

- `docs/requirements.md` — original RiffRec requirements, including R17 and the "no real-time analysis" boundary this plan revises.
- `README.md` — session format and host-managed output contract; line 7 changes under R28.
- `src/RiffrecProvider.tsx` (`start` at 296–368, `stop` at 244–294, unmount effect at 370), `src/output/session.ts` (`SessionWriter.stop` 94–124), `src/output/zip.ts` (`ZipWriter.writeSession` 47–68), `src/capture/screen.ts` (in-memory chunks), `src/capture/network.ts` (fetch patching), `src/capture/element.ts` (selector and bounding box), `src/types.ts` (event union 64–68, `RiffrecConfig` 116–131), `src/output/filesystem.ts` (IndexedDB usage pattern).
- Repository `EveryInc/compound-engineering-plugin`: `skills/ce-polish/SKILL.md` and `references/run.md` (the traditional loop and startup tuple); `skills/ce-prototype/scripts/light-webserver.js` (dispatch 1234–1249, routes 966–1136, token 725 and 1150–1168, held queue and flush 727–835, SSE 1056–1080, lifecycle 1183–1194, `wait` client 684–721), `assets/annotate.js` (pin payload 364–378, POST 529–538), `references/annotation-loop.md`, `references/preview.md`; `tests/skills/ce-prototype-server.test.ts` (Bun.spawn pattern at 47–51); `tests/skill-conventions.test.ts` (same-skill path rule); `tests/release-metadata.test.ts` (skill count 35); `skills/ce-riffrec-feedback-analysis/`; `STRATEGY.md`.
- Repository `kieranklaassen/breathwork-live`: `app/frontend/lib/breathwork/realtimeClient.ts` (`RealtimeClient` connect/sendToolResult/muteMic/disconnect, `parseRealtimeEvent`), `app/services/openai/realtime_secrets.rb` (session body: model, instructions, audio input transcription and turn detection, tools), `app/services/breathwork/agent_tools.rb` (flat `{ type: "function", name, description, parameters }` tool shape), `docs/solutions/realtime-voice-session-architecture.md` (dropped transcript during active response; junk transcripts in noise; audible routing must be explicit).
- Repository `kieranklaassen/riffrec-dashboard`: `AGENTS.md`, `docs/plans/2026-07-15-002-feat-extract-run-pipeline-plan.md` (KTD12: polling over SSE), `config/routes.rb` (`/integrate/:stack`).
- Repository `kieranklaassen/compound-stack-rails`: `app/frontend/lib/riffrec_provider.tsx` (the stub), `config/initializers/riffrec.rb`, `docs/changelog/0.1.0-001-initial-template.md` (entry format).
- Repository `kieranklaassen/atelier`: `docs/decisions.md` D58 and D60.
- tldraw licensing: tldraw.dev, "20 things I wish AI chatbots knew about tldraw" — production use requires a license key since SDK 4.0.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Riffrec live mode lives under `src/live/` and is lazy-loaded.** `RiffrecProvider` imports `src/live/LiveOverlay` through `React.lazy` only when the `live` prop is set, so hosts that never enable live mode ship no live code, no Realtime client, and no `perfect-freehand` (tsup ESM code-splitting). The Node build entry `src/noop.tsx` exports matching no-ops. Existing capture and output modules change only at the seams named in U6 and U7. Governs R1, R27, R29, Success Criteria (bundle).
- KTD2. **Stream envelope.** Every page → endpoint message is `{ schema_version: "live/1", session_id, seq, t, type, payload }`; `seq` is a per-session monotonic integer; the endpoint deduplicates on `(session_id, seq)` and acknowledges the highest contiguous `seq`; after an outage the page replays from the last acknowledged `seq`. Event `type` values: the four existing riffrec events plus `transcript`, `unit`, `unit_update`, `unit_withdraw`, `annotation`, `checkpoint`, `answer`, `frame`, `mic`, `mode`, `stream_state`. `frame` envelopes are posted alone, never batched with other events. A `schema_version` the endpoint does not support is rejected with HTTP 409 and the version it expects; the page shows the incompatible-endpoint indicator state rather than parsing best-effort. Governs R2, R3, R30, R31.
- KTD3. **Token and origin bootstrap without cookies.** The consumer hands the page its session token and the endpoint origin in the URL fragment (`#riffrec_live=<page token>&endpoint=<origin>`); riffrec reads both on load, before any capture starts, strips them with the unpatched `history.replaceState` before any history entry, and keeps them in `sessionStorage` under the session id. `live.endpoint` on the provider is a fallback for hosts that run a fixed endpoint. Every page request carries `Authorization: Bearer <page token>` and `X-Riffrec-Session: <session_id>`. The SSE stream is consumed with a fetch-based stream reader, not `EventSource`, so the token travels in the header and never in a URL. `redactUrl` strips `riffrec_live` and `endpoint` from any captured fragment as defense in depth. The prototype's `SameSite=Strict` cookie cannot cross the app/endpoint origin pair (R41), which is why the cookie path is dropped. Governs R31, R32, R41, R42.
- KTD4. **Mint is proxied through, and owned by, the endpoint.** The page POSTs `/mint` with `{ session_id }` only; the endpoint holds the tool definitions and default persona (a copy of riffrec's, per KTD18), appends the session brief to the instructions after scanning it for secret shapes (known key prefixes, `KEY=`/`TOKEN=`/`SECRET=` assignments, URLs with credential params — refusing with `503 { reason: "brief_contains_secret" }`), adds turn detection (semantic VAD, `create_response: true`, `interrupt_response: true`) and input transcription, calls OpenAI's client-secret endpoint with the key from its own environment, and returns `{ client_secret, expires_at, model }`. Upstream rejection or timeout returns `502 { reason: "openai_error", upstream_status }` with the upstream body discarded. Mints are limited to one in flight and 5 per minute per session (`429 { retry_after }`), and refused with `403 { reason: "tls_required" }` when the peer is non-loopback and the request does not carry `X-Forwarded-Proto: https`. The endpoint never logs request headers or mint bodies and never persists `client_secret`. Riffrec never sees the key and never accepts one in configuration (R5). The mint is re-issued on every reconnect; the brief is a start-of-session snapshot in v1. Governs R5, R7, R35, R42.
- KTD5. **Interviewer tool set: four flat function tools, the `breathwork-live` shape.** `record_unit(statement, anchors[], transcript_excerpt)`, `update_unit(unit_id, statement?, anchors_add?)` (rejected once a unit has left `initial`), `withdraw_unit(unit_id, reason?)`, `relay_answer(unit_id, answer_text)`. No tool emits checkpoints or reports state: the client owns all timing (KTD9) and the page tells the interviewer about page-side facts — a completed drawing ("the riffer drew on the sidebar toggle"), buffering, a mute — as text conversation items, so it can refer to them without seeing or observing them. No image-bearing tool exists. Tool definitions are exported as data (`src/live/tools.ts`) and copied verbatim into the endpoint. Governs R7, R10–R12.
- KTD6. **Interviewer conversation rules from the breathwork lessons.** Endpoint questions are queued and voiced only when no response is active and the riffer has been silent for 1.5 s; a user turn during an active response is never sent (the API drops it) — the client waits for the response to settle and then flushes. A question interrupted by the riffer is re-queued. Transcripts shorter than three words with no unit-shaped verb are treated as noise and do not create units. The client does not create a response after a tool result unless a question is pending, so `record_unit` does not make the interviewer speak after every unit. The remote audio track is routed through an explicit Web Audio chain whose reachability is asserted in a test. Governs R6, R8, R9.
- KTD7. **Wake envelope, acknowledgment, and exit codes.** `wait` prints one JSON envelope and exits 0 whenever a batch is available: `{ schema_version: "live/1", checkpoint_id, kind: "silence" | "page_change" | "send" | "answer" | "final", mode_at_checkpoint, session_status: "live" | "page_lost", units[], annotations[], answers[] }`. The agent acknowledges a batch with `POST /checkpoints/:id/ack` immediately after parsing it; a batch served without an ack is re-served before any new batch, including after a polish restart (persisted under `state/batches/`). Exit 1 is reserved for a session ended via `/session/end` with nothing held; exit 2 is error; exit 3 (`{ status: "wait-taken" }`) means another process holds the wake for this session (HTTP 409) and the caller must not stop the endpoint. A `page_lost` envelope is returned once per lost episode; further waits block until the page reconnects or a new batch exists. Governs R33, R36, R38.
- KTD8. **Page-lost detection.** After the endpoint relays an `applied` notice it arms a grace window (default 15 s) for the page's SSE stream to reconnect with the same `session_id`; a reconnect inside the window is a reload and the batch stays `live`; no reconnect marks the checkpoint `session_status: "page_lost"`. The page sends `stream_state: "unloading"` on `pagehide` with `fetch(..., { keepalive: true })` (a beacon cannot carry the bearer header) so ordinary reloads classify without waiting for the window. The page mints `session_id`; the endpoint binds each page token to the first `session_id` it sees and answers any other id with `409 { active_session_id }`, which the page shows as an error rather than starting a parallel session. Governs R38.
- KTD9. **Checkpoint mechanics, client-owned.** `session.ts` is the only checkpoint emitter: it arms a 2.5 s timer on the Realtime `speech_stopped` event, resets it on `speech_started`, and emits `checkpoint { trigger: "silence", mode }` when at least one unit is held; it emits `page_change` on navigation and `send` from the Send control, which waits up to 1.5 s for an in-progress turn to end. The endpoint emits `answer` checkpoints whenever an answer event arrives (carrying `answers[]` only, releasing no units) and a `final` checkpoint when the riffer says done, before `/session/end`. A checkpoint that releases nothing does not wake the agent. The endpoint broadcasts `unit_status: "triaging"` on every release; the page treats that event as the release marker, and a withdrawal that arrives after release is forwarded in the next batch as `status: "withdrawn"`. Withdrawals before release are applied before batch serialization. Governs R12, R39, R43.
- KTD10. **Evidence timing.** A frame is captured into a ring buffer at every anchor gesture (click, stroke start, pin) and at the periodic interval; a unit takes the buffered frame nearest its first anchor timestamp, never a fresh capture at tool-call time. While no display stream exists — before the first share, after a reload until re-share, or when share is declined — no frames or composites are produced and units ship with empty `frame_ids`; declined screen share is treated like a denied microphone and the session continues. Composites render through a serialized queue per annotation. A stroke completed within 4 s after a unit's extraction attaches to that unit; otherwise it opens a drawing-only unit. Frames include the overlay's own region; the panel is docked so the agent can discount it. Governs R16–R18, R20.
- KTD11. **Default execution mode is Smart.** Resolved on the brainstorm's stated default; Collect remains one switch away. The page sends a `mode` event on every switch, the checkpoint payload carries the mode at emission, and the endpoint stamps `mode_at_checkpoint` from the releasing checkpoint (or the last seen `mode` for endpoint-emitted checkpoints) so a switch between emission and wake cannot be misread. Governs R37.
- KTD12. **A mode change takes effect at the next checkpoint and covers every accepted-but-unapplied unit.** Switching to Instant or Smart from Collect releases the held accepted units at the next checkpoint; switching to Collect holds anything not yet applied. The switch shows a "pending until next checkpoint" hint. Resolves the review's deferred question. Governs R37.
- KTD13. **Informed Interviewer is v1.** The coding agent writes the brief from repo context it already holds: route list, component names near recently touched files, design tokens, and a one-paragraph recent-changes summary; hard cap 3,000 characters; content limited to those four categories, never file contents or environment values; the endpoint's secret scan (KTD4) is the gate. Resolved on the brainstorm's stated default. Governs R7, R35.
- KTD14. **The riffrec setup commit lands on the current feature branch.** Resolved on the brainstorm's stated default; the live prompt discloses it (R34). Governs R34, R35.
- KTD15. **Segmented recording persisted as it is produced.** `ScreenCapture` writes each `MediaRecorder` timeslice chunk (1 s) to an IndexedDB store keyed by session and segment; a new segment opens after every re-share; `pagehide` closes the current segment; a crash loses at most one chunk. The first segment keeps today's name `recording.webm`; later segments are `recording-002.webm`, `recording-003.webm`, …, all listed in `session.json`'s `files_present`. The zip's 50 MB recording guard applies to the whole `recording(-NNN)?.webm` family as one budget. Governs R17, R38.
- KTD16. **A live session survives the provider unmounting.** The unmount effect that calls `stop()` today applies only to classic sessions (a distinct `RiffrecStatus` value marks live). A live session's state — id, page token, endpoint origin, units, annotations, transcript, mode, `next_seq`, `acked_seq`, and the unsent envelope queue — is persisted to `sessionStorage` on every change and rehydrated on the next mount, so numbering resumes and unsent envelopes replay. Only an explicit `stop()` or `session_ended` ends it, and both clear every `sessionStorage` key the session wrote. Governs R38.
- KTD17. **Own traffic is excluded from capture.** The provider passes the endpoint origin and `api.openai.com` to `NetworkCapture`'s existing exclusion list, so the stream does not record itself. Governs R3, R24.
- KTD18. **The endpoint helper is a copy of `light-webserver.js`, adapted, not a new server.** Copied into `skills/ce-polish/scripts/live-endpoint.js`; disk serving, the overlay files, `/version`, the SSE grace shutdown, and the pending-document handshake are removed; the run-directory lifecycle (pidfile, `state/`, idle timeout, `--owner-pid`, `start`/`status`/`stop`/`wait`) is kept, but owner death and idle timeout stop the process without ending the session and leave `state/` intact so a restarted `start --root` resumes it; only `/session/end` or an explicit `stop` marks the session ended. Credentials are accepted from `Authorization: Bearer` only (query, cookie, and header aliases removed). `state/` is created 0700 and every file 0600. The copy is mandatory: `AGENTS.md`'s "File References in Skills" rule and `tests/skill-conventions.test.ts` forbid cross-skill paths. Governs R31–R33, R40.
- KTD19. **Live-mode skill prose lives in `references/`, not `SKILL.md`.** `SKILL.md` gains only the live/traditional question and three `Read references/...` pointers; consent copy, execution-mode semantics, the wake loop, install steps, and tunnel guidance live in reference files so `SKILL.md` stays under the 8,000-byte ceiling enforced by `tests/codex-skill-prompt-budget.test.ts`. Governs R34–R44.
- KTD20. **Install detection is a bundled script; installation is agent-executed; the endpoint origin is never committed.** `scripts/detect-riffrec.sh` reports whether `riffrec` is a dependency, its version, and whether a `RiffrecProvider` mount exists; the skill prose installs or upgrades to the minimum version that ships live mode, mounts `<RiffrecProvider forceEnable live={{}}>` (origin and token arrive by fragment, KTD3), restarts or hot-reloads the dev server, and probes the page for the live bootstrap before handing over the URL. Governs R35.
- KTD21. **One microphone stream, three consumers.** The consent step acquires a single microphone `MediaStream`; the session injects cloned tracks into the Realtime client (through its existing `getUserMedia` dependency), into `VoiceCapture` (so `voice.webm` stays in live archives), and into the audio-clip recorder (R21). Mute disables every clone, so the indicator, the interviewer, and the recording agree. Governs R4, R6, R21, R22.
- KTD22. **The ablation is built, not hoped for.** At the `final` checkpoint the board runs a confirmation pass (per unit: intended element and intended change confirmed or not, emitted as `unit_update`), and the page POSTs its full-evidence archive to `/session/end` regardless of the wire profile, so `state/log/` holds everything. The helper gains `replay --root <dir> --profile <name> --to <endpoint>` that re-emits a stored session under another profile. Governs R44, Success Criteria (ablation).

### Interface Contracts

These are the hand-over surfaces between units. Each is owned by one unit and consumed by others; the owner publishes it, consumers implement against this text until the owner's fixtures land.

- **I1 — Stream contract** (owner U1; consumers U2, U5, U6, U8, U10). The envelope in KTD2 plus payload shapes: `unit { id, statement, transcript_excerpt, anchors[], evidence { frame_ids[], annotation_ids[], transcript_span, telemetry_window?, audio_clip_id? }, status, confirmed? }`; `anchor { route, selector, component?, rect, t }`; `annotation { id, kind: "stroke" | "pin", points[], bbox, anchor, text?, unit_id?, composite_frame_id? }`; `transcript { id, role: "riffer" | "interviewer", text, t_start, t_end, final }`; `unit_update { unit_id, statement?, anchors_add?, confirmed? }`; `unit_withdraw { unit_id, reason? }`; `checkpoint { id, trigger, mode }`; `answer { unit_id, text }`; `frame { id, t, route, kind: "gesture" | "periodic" | "composite", jpeg_base64 }`; `mic { state: "granted" | "denied" | "muted" | "unmuted" }`; `mode { mode }`; `stream_state { state: "streaming" | "buffering" | "unloading" }`. Published as TypeScript types, a `validateEnvelope` guard, and fixtures for every type, described in `docs/live-stream-contract.md`.
- **I2 — Mint contract** (owner U8; consumer U3). `POST /mint` with `{ session_id }` per KTD4; response `{ client_secret, expires_at, model }`; errors `401` (bad token), `403 { reason: "tls_required" }`, `429 { retry_after }`, `502 { reason: "openai_error", upstream_status }`, `503 { reason: "no_key" | "brief_contains_secret" }`.
- **I3 — Endpoint HTTP surface** (owner U8; consumers U2, U5, U10). Page routes, all requiring `Authorization: Bearer <page token>` and `X-Riffrec-Session`: `POST /events` (envelope batch, returns `{ acked_seq }`; body cap 64 KB, or 2 MB for a lone `frame` envelope; oversize returns `413 { max_bytes }` and does not count toward buffering), `GET /stream` (SSE; event names `unit_status`, `applied`, `ask`, `ack`, `session_ended`), `POST /mint`, `POST /session/end` (accepts the full-evidence archive). Agent routes, all requiring `Authorization: Bearer <agent token>` and returning 403 to any request carrying an `Origin` header: `GET /wait`, `POST /checkpoints/:id/ack`, `POST /units/:id/status` (`{ status, note?, guess? }`), `POST /units/:id/ask` (`{ question }`), `GET /status`. Page routes answer `OPTIONS` with `Access-Control-Allow-Origin` equal to the exact `--app-origin`, `Allow-Headers: Authorization, Content-Type, X-Riffrec-Session`, `Allow-Methods: GET, POST`, `Vary: Origin`, and no credentials flag. A page token on an agent route, or the reverse, returns 403. Per-session disk cap 500 MB; beyond it frames are refused with a `stream_state` reason.
- **I4 — Wake envelope and CLI** (owner U8; consumer U9). `start --root <dir> --app-origin <origin> [--host] [--port] [--owner-pid]` prints `{ url, port, page_token }` once and writes `{ page_token, agent_token, url, app_origin, port, pid, owner_pid, ended: false }` to `state/session.json` (0600); the agent token is never printed. `wait --root <dir>` per KTD7 reads the agent token from the state file and sends it as a bearer header; `status` prints the board summary from `state/` (the same reader `GET /status` uses); `stop` invalidates both tokens, deletes `state/batches/`, and keeps `state/log/`; `replay --root <dir> --profile <name> --to <endpoint>` per KTD22.
- **I5 — Provider configuration** (owner U7; consumer U9). `<RiffrecProvider live={{ endpoint?: string, profile?: EvidenceProfile, autoStart?: boolean, drawShortcut?: string }}>`; token and origin arrive per KTD3; `useRiffrec()` exposes `live: { status, mode, setMode, muted, setMuted, send, stop }`. The install snippet in U9's references mounts `live={{}}`.
- **I6 — Archive additions** (owner U2 and U6; compatibility with `ce-riffrec-feedback-analysis`). New files `transcript.json`, `units.json` (with confirmations), `annotations.json`, `frames/` (jpeg), `clips/` (audio, profile-enabled), segmented recordings per KTD15; `voice.webm` stays; `session.json.files_present` lists every one; `events.json` unchanged. The analyzer reads the first recording segment only.

### High-Level Technical Design

```mermaid
flowchart TB
  subgraph riffrec[riffrec package - src/live, lazy-loaded]
    S[session.ts state machine + checkpoint timers] --> SC[streamClient.ts POST + SSE reader + persisted buffer]
    S --> RT[realtime/ client + interviewer + tools]
    S --> OV[overlay/ DrawingLayer, Board, Indicator, ModeSwitch, Consent]
    S --> EV[evidence/ frames, composite, audio clips, profile, segment store]
    S --> AR[output/session.ts archive with live files]
  end
  subgraph polish[compound-engineering-plugin - skills/ce-polish]
    EP[scripts/live-endpoint.js] --> ST[state/ session.json, batches/, log/, brief.md]
    PR[SKILL.md + references/live-*.md] --> EP
  end
  SC -->|I1 over I3| EP
  RT -->|I2| EP
  EP -->|I4 wake + ack| AG[coding agent]
  RT <-->|WebRTC| OAI[OpenAI Realtime]
```

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> consenting: start live
  consenting --> idle: decline
  consenting --> connecting: accept + mic
  connecting --> live: mint ok + data channel open
  connecting --> live_novoice: no endpoint, mic denied, or mint refused
  connecting --> incompatible: endpoint rejects schema_version
  live --> buffering: POST fails 3 times
  buffering --> live: acked_seq advances
  live --> reconnecting: Realtime drop, pagehide, or crash rehydrate
  reconnecting --> live: mint ok + re-seed
  live --> ended: final checkpoint then stop() or session_ended
  buffering --> ended: stop()
  live_novoice --> ended: stop()
```

Sequencing across units:

```mermaid
flowchart LR
  U1[U1 contract + harness] --> U2[U2 session + stream client]
  U1 --> U4[U4 drawing layer]
  U1 --> U8[U8 endpoint helper]
  U2 --> U3[U3 voice interviewer]
  U2 --> U5[U5 board + consent + indicator]
  U4 --> U5
  U2 --> U6[U6 evidence + segments]
  U4 --> U6
  U3 --> U7[U7 provider integration + docs]
  U5 --> U7
  U6 --> U7
  U8 --> U9[U9 skill prose + install]
  U7 -. min riffrec version .-> U9
  U8 --> U10[U10 helper tests + loop smoke]
  U1 -. fixtures .-> U10
```

### Assumptions

- The Realtime API's client-secret endpoint accepts the session body shape used by `breathwork-live` (model, instructions, audio input transcription and turn detection, tools); a shape change is a stop condition. The client-secret lifetime (600 s in breathwork) bounds the reconnect cadence; reconnects re-mint.
- `perfect-freehand` remains MIT and under 10 KB minified.
- Vite, Next, and Rails-with-Inertia dev servers can be bound to a non-loopback interface by flag or environment; U9 documents the flag per recipe. A remote session needs two HTTPS origins and therefore two tunnels on providers that allow one per account; U9 says so.
- The Compound Engineering plugin's release process (release-please) handles version metadata; U9 and U10 do not bump versions by hand.
- The riffrec release ships before `ce-polish` live mode is used against a real app; U9's install step names the minimum version, so the prose can land first without breaking anything.
- Porting `realtimeClient.ts` is chosen over adopting `@openai/agents-realtime` because the port is a few hundred lines already proven in-fleet and keeps the package light for every host; revisit if the SDK's WebRTC transport becomes materially smaller.

---

## Implementation Units

Each unit names its repository. Units are written to be executed independently by separate agents in fresh clones; a unit's **Interface** field is the surface it must honor exactly. Tests in riffrec that touch DOM, `sessionStorage`, or browser APIs open with `// @vitest-environment jsdom`, following `src/RiffrecProvider.session.test.tsx`.

| U-ID | Title | Repo | Key files | Depends on |
|---|---|---|---|---|
| U1 | Stream contract, tool definitions, test harness | riffrec | `src/live/contract.ts`, `src/live/tools.ts`, `src/live/testing/*`, `docs/live-stream-contract.md` | — |
| U2 | Live session state machine, checkpoints, stream client | riffrec | `src/live/session.ts`, `src/live/streamClient.ts`, `src/live/tokenBootstrap.ts`, `src/live/units.ts`, `src/output/session.ts` | U1 |
| U3 | Voice interviewer | riffrec | `src/live/realtime/*`, `src/capture/voice.ts` | U1, U2 |
| U4 | Drawing layer and pins | riffrec | `src/live/overlay/DrawingLayer.tsx`, `src/live/overlay/strokeAnchor.ts`, `src/live/overlay/Pin.tsx` | U1 |
| U5 | Board, indicator, mode switch, Send, consent, confirmation, ended card | riffrec | `src/live/overlay/LiveOverlay.tsx`, `Board.tsx`, `LiveIndicator.tsx`, `ModeSwitch.tsx`, `SendControl.tsx`, `ConsentDialog.tsx`, `EndedCard.tsx` | U1, U2, U4 |
| U6 | Evidence capture, audio clips, segmented recording | riffrec | `src/live/evidence/*`, `src/capture/screen.ts`, `src/output/segmentStore.ts`, `src/output/zip.ts` | U2, U4 |
| U7 | Provider integration, lazy loading, public API, docs | riffrec | `src/RiffrecProvider.tsx`, `src/useRiffrec.ts`, `src/types.ts`, `src/capture/network.ts`, `README.md`, `CHANGELOG.md`, `docs/requirements.md` | U3, U5, U6 |
| U8 | Live endpoint helper | compound-engineering-plugin | `skills/ce-polish/scripts/live-endpoint.js`, `skills/ce-polish/references/live-stream-contract.md` | U1 (contract text; fixtures when landed) |
| U9 | `ce-polish` live-mode prose and install step | compound-engineering-plugin | `skills/ce-polish/SKILL.md`, `references/live-start.md`, `references/live-loop.md`, `references/live-remote.md`, `references/install-riffrec.md`, `scripts/detect-riffrec.sh`, `docs/guides/ce-polish.md` | U8 (prose); U7 release (install step's minimum version) |
| U10 | Helper tests and loop smoke | compound-engineering-plugin | `tests/skills/ce-polish-live-endpoint.test.ts`, `tests/skills/ce-polish-live-loop.test.ts`, `tests/skills/ce-polish-live-prose.test.ts`, `tests/skills/ce-polish-detect-riffrec.test.ts`, `tests/fixtures/ce-polish-live/` | U8, U1 fixtures |

**Ready now:** U1, U8, U9 (U8 and U9 implement against the Interface Contracts text; U10 reconciles them with U1's fixtures; U9's install step waits only for the riffrec version number).

### U1. Stream contract, tool definitions, and test harness

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** Publish the live-mode wire contract as types, a runtime guard, fixtures, and a document, plus the fakes every other unit tests against.
- **Requirements:** R3, R10, R30; KTD2, KTD5; Interface I1.
- **Dependencies:** none.
- **Files:** create `src/live/contract.ts`, `src/live/contract.test.ts`, `src/live/tools.ts`, `src/live/tools.test.ts`, `src/live/fixtures/` (one JSON fixture per KTD2 event type plus `wake-batch.json`, `mint-request.json`, `mint-response.json`), `src/live/testing/fakeEndpoint.ts`, `src/live/testing/fakeRealtime.ts`, `src/live/index.ts`, `docs/live-stream-contract.md`; modify `src/index.ts` (export live types), `src/noop.tsx` (matching no-op exports).
- **Approach:**
  1. Define the envelope and every payload from I1 and KTD2 in `contract.ts`, with `LIVE_SCHEMA_VERSION = "live/1"` and a `validateEnvelope` guard that rejects unknown types, missing `seq`, or a foreign version.
  2. Define the four tools from KTD5 in `tools.ts` as data in the flat `{ type: "function", name, description, parameters }` shape, with calling-condition prose in each description ("Call when…", "Never call…").
  3. Write one fixture per event type and the wake, mint request, and mint response fixtures; these are the shared truth U8 and U10 copy into the plugin.
  4. `fakeEndpoint.ts`: an in-process endpoint implementing I3 semantics (ack by seq, held queue, release on checkpoint, `unit_status: "triaging"` broadcast, `answer` checkpoints, 409 on version mismatch, 401 on bad token, 413 on oversize). `fakeRealtime.ts`: a scripted driver that emits tool calls, transcript events, and `speech_started`/`speech_stopped` into the interviewer without WebRTC.
  5. `docs/live-stream-contract.md` documents I1–I4 for consumer authors and states the versioning rule from R30.
- **Patterns to follow:** `src/types.ts` for type style and the `RIFFREC_SCHEMA_VERSION` precedent in `src/output/session.ts`; `breathwork-live` `app/services/breathwork/agent_tools.rb` for tool prose.
- **Test scenarios:**
  - `validateEnvelope` accepts every fixture and rejects an envelope missing `seq`, with a wrong `schema_version`, or with an unknown `type`.
  - Every tool definition has a name from the KTD5 set, an object `parameters` schema, and a description containing a calling condition; there are exactly four.
  - `fakeEndpoint` acknowledges `seq` 1..5 as `acked_seq: 5`, ignores a replayed `seq` 3, releases held units only on a checkpoint, and broadcasts `triaging` for each released unit.
  - `fakeEndpoint` returns 401 without a token, 409 for `schema_version: "live/0"`, and 413 for a 3 MB frame.
  - `fakeRealtime` replays a scripted `speech_stopped` → `record_unit` → `speech_started` sequence and the recorded tool results are returned in order.
- **Verification:** `npm run typecheck` and `npm test` pass; a test loads each fixture and checks it against the field list in `docs/live-stream-contract.md`.

### U2. Live session state machine, checkpoints, and stream client

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** Run a live session's lifecycle, own every checkpoint timer, deliver events to the endpoint with sequencing and persisted buffering, consume the SSE return channel, survive reloads with numbering intact, and extend the archive with live files.
- **Requirements:** R1, R2, R4, R11, R12, R23 (state source), R30–R32, R38; KTD2, KTD3, KTD8 (page side), KTD9, KTD16; Interfaces I1, I3, I6.
- **Dependencies:** U1.
- **Files:** create `src/live/session.ts`, `src/live/session.test.ts`, `src/live/checkpoints.ts`, `src/live/checkpoints.test.ts`, `src/live/streamClient.ts`, `src/live/streamClient.test.ts`, `src/live/tokenBootstrap.ts`, `src/live/tokenBootstrap.test.ts`, `src/live/buffer.ts`, `src/live/units.ts`, `src/live/units.test.ts`; modify `src/output/session.ts`, `src/output/session.test.ts`.
- **Approach:**
  1. `session.ts` implements the state machine in the High-Level Technical Design and owns the unit store, mode, `session_id` minting, and persistence to `sessionStorage` per KTD16 (including `next_seq`, `acked_seq`, and the unsent queue).
  2. `checkpoints.ts` is the sole emitter (KTD9): the 2.5 s silence timer driven by Realtime speech events, `page_change` from the navigation observer, `send` from the Send control with the 1.5 s end-of-turn wait; every checkpoint carries the current mode; a checkpoint with nothing held emits nothing.
  3. `streamClient.ts` batches envelopes per animation frame except `frame` envelopes, which post alone; sends `Authorization: Bearer` and `X-Riffrec-Session`; tracks `acked_seq`; backs off on failure; flips to buffering after three consecutive failures; replays from the last ack on recovery; treats 413 as drop-or-downscale, not a failure; reads SSE with a fetch stream reader; sends `stream_state: "unloading"` with `keepalive` on `pagehide`; treats `unit_status: "triaging"` as the release marker.
  4. `tokenBootstrap.ts` runs before any capture starts, reads `#riffrec_live=<token>&endpoint=<origin>`, strips them with the unpatched `history.replaceState`, and stores both per KTD3.
  5. `units.ts` enforces transitions: `initial → withdrawn` before release, `withdrawn` forwarded in the next batch after release; `update` rejected after release; withdrawals applied before serialization.
  6. `output/session.ts` adds `transcript.json`, `units.json`, `annotations.json`, `frames/`, `clips/` when present and lists them in `files_present` (I6); the no-endpoint and lost-endpoint cases produce the two archive shapes in R4; `voice.webm` stays.
- **Patterns to follow:** `src/RiffrecProvider.session.test.tsx` (hoisted mocks, `createRoot`/`act`, `// @vitest-environment jsdom`); `SessionWriter.stop` for archive assembly.
- **Test scenarios:**
  - Covers AE1. Three `record_unit` calls with speech gaps under 2.5 s then a navigation produce exactly one `page_change` checkpoint; three units followed by 2.5 s of silence produce exactly one `silence` checkpoint.
  - Covers AE10. Endpoint fails from `seq` 11 onward: state flips to buffering after three failures, events 11..40 buffer, endpoint returns, replay starts at 11, state flips back to live on the first ack.
  - Covers AE12. A `withdraw_unit` arriving in the same tick as a page-change checkpoint excludes the unit from the serialized batch; a withdrawal after `triaging` arrives forwards `status: "withdrawn"` in the next batch.
  - Covers AE7. State persisted to `sessionStorage` rehydrates after a simulated reload with units, annotations, transcript, mode, `next_seq`, `acked_seq`, and the unsent queue intact; the first post-reload envelope carries `seq = next_seq`.
  - The fragment token and origin are read, removed from `location.hash` before the first history entry, never appear in any envelope or `events.json`, and the token is sent as a bearer header on the first POST.
  - A lone 1.5 MB `frame` envelope posts alone; a 413 drops it without counting toward buffering.
  - `update_unit` on a released unit returns a rejection and leaves the unit unchanged.
  - Covers AE5. Archive for a no-endpoint session contains `events.json`, `recording.webm`, `voice.webm`, `annotations.json`, and no `transcript.json`; archive for a lost-endpoint session adds `transcript.json` and `units.json`.
  - A `409` on version mismatch enters `incompatible`, not buffering; `stop()` clears every `sessionStorage` key the session wrote.
- **Verification:** `npm test` passes including the pre-existing `output/session.test.ts` cases unchanged; `npm run typecheck` passes.

### U3. Voice interviewer

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** Connect to OpenAI Realtime through the endpoint's mint on a shared microphone stream, run the interviewer persona with the four tools, extract units and answers into the session, voice endpoint questions at pauses, and emit speech events for the checkpoint timer.
- **Requirements:** R5–R9, R21 (mic clone), R38 (re-seed); KTD4, KTD5, KTD6, KTD13 (consumer of the brief), KTD21; Interface I2.
- **Dependencies:** U1, U2.
- **Files:** create `src/live/realtime/client.ts`, `src/live/realtime/client.test.ts`, `src/live/realtime/interviewer.ts`, `src/live/realtime/interviewer.test.ts`, `src/live/realtime/persona.ts`, `src/live/realtime/mint.ts`, `src/live/realtime/mint.test.ts`, `src/live/realtime/audioRouting.ts`, `src/live/realtime/audioRouting.test.ts`; modify `src/capture/voice.ts` (accept an injected stream).
- **Approach:**
  1. `client.ts` is a port of `breathwork-live`'s `realtimeClient.ts`: SDP offer with the ephemeral secret, data channel, narrow typed event parser, mute, disconnect, injectable deps; it receives a cloned microphone track from the session rather than acquiring its own (KTD21), and surfaces `speech_started`/`speech_stopped` to `checkpoints.ts`.
  2. `mint.ts` POSTs `/mint` with `{ session_id }` (I2); any non-2xx moves the session to `live_novoice` with the reason; 429 backs off per `retry_after`.
  3. `interviewer.ts` maps tool calls to session actions, queues endpoint questions and voices them per KTD6, re-queues an interrupted question, injects page-side facts as text items (drawings, buffering, mute), gates noise transcripts, does not create a response after a tool result unless a question is pending, and re-seeds on reconnect with the bounded window from Outstanding Questions.
  4. `audioRouting.ts` builds the explicit voice → gain → destination chain and exposes a reachability check.
  5. `persona.ts` holds the default instructions: extract one unit per requested change, ask immediately when a target or value is ambiguous, never invent anchors, acknowledge a withdrawal aloud in a few words.
  6. `voice.ts` accepts an injected `MediaStream` so `VoiceCapture` records the shared clone.
- **Patterns to follow:** `breathwork-live` `realtimeClient.ts`, `toolHandlers.ts`, and the intake coach's mint (auto-responses on, interruptible); `docs/solutions/realtime-voice-session-architecture.md` lessons.
- **Test scenarios:**
  - Covers AE6. With `fakeRealtime`, an endpoint question arriving during an active response is held and delivered only after `response.done` plus 1.5 s of silence.
  - A `record_unit` tool call creates a unit at `initial` with anchors copied verbatim and the transcript excerpt attached; the tool result returns in the same tick and no response is created.
  - A transcript of "uh" or "hmm okay" creates no unit; "make this red" does.
  - `relay_answer` moves the unit's answer into the session and the next batch carries it.
  - After a simulated disconnect, reconnect mints again and the first `session.update` carries the re-seed text bounded to 6,000 characters.
  - Audio routing reachability: the remote track's graph reaches the destination node in a fresh and a reconnected client.
  - Mint `503`, `502`, and `429` each move the session to `live_novoice` with the reason; `429` retries after `retry_after`.
  - Muting the session disables the Realtime track clone and the `VoiceCapture` clone together.
- **Verification:** `npm test` passes; a manual run against a real endpoint mint produces audible speech and a unit on the board within one utterance, and the interviewer does not speak after every unit.

### U4. Drawing layer and pins

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** A full-page drawing layer with hand-drawn freehand strokes and element pins, every mark anchored to route, selector, component, and rect, with a visible active state.
- **Requirements:** R13–R15; KD Drawing layer; Interface I1 annotation shape; I5 `drawShortcut`.
- **Dependencies:** U1.
- **Files:** create `src/live/overlay/DrawingLayer.tsx`, `src/live/overlay/DrawingLayer.test.tsx`, `src/live/overlay/strokeAnchor.ts`, `src/live/overlay/strokeAnchor.test.ts`, `src/live/overlay/Pin.tsx`, `src/live/overlay/Pin.test.tsx`, `src/live/overlay/shortcuts.ts`; modify `package.json` (add `perfect-freehand`).
- **Approach:**
  1. `DrawingLayer.tsx` renders a fixed, full-viewport SVG above the app; it receives `annotations` and `onAnnotation` props (no session dependency); when active it captures pointer events, builds strokes with `perfect-freehand`, emits an `annotation` on stroke completion, sets a crosshair cursor and a thin viewport-edge tint, and renders the toggle pressed; when inactive it is `pointer-events: none` with no affordance.
  2. `strokeAnchor.ts` maps a completed stroke's bbox to the topmost element under its centroid (falling back to the largest-overlap element), producing the anchor via `src/capture/element.ts` and `src/capture/fiber.ts`.
  3. `Pin.tsx` places a note on a clicked element with a small composer, using the prototype's pin record shape (selector, text snippet, rect, comment).
  4. `shortcuts.ts` toggles the layer using `drawShortcut` from I5 with a fixed default, and exposes a programmatic toggle for the overlay control.
- **Patterns to follow:** `compound-engineering-plugin` `skills/ce-prototype/assets/annotate.js` (pin composer, `cssPath`); `src/capture/element.ts`; `// @vitest-environment jsdom`.
- **Test scenarios:**
  - Covers AE4. A closed stroke around a card element produces an annotation whose anchor selector resolves to that card and whose bbox contains its rect.
  - With the layer active, a click on a button underneath does not fire the button's handler and the affordance is visible; with the layer inactive the handler fires and the affordance is absent.
  - A stroke across two elements anchors to the element with the largest overlap.
  - A pin on an input records the input's selector and accessible name but no typed value.
  - The layer renders annotations passed by prop after a remount.
- **Verification:** `npm test` passes; bundle report shows `perfect-freehand` under 10 KB minified added to the live chunk.

### U5. Board, indicator, mode switch, Send, consent, confirmation, and ended card

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** The riffer-facing surfaces of live mode: consent derived from the evidence profile with a shared microphone acquisition, a live indicator with every session state, the optimistic board with withdraw and typed-reply affordances, the mode switch, Send, the session-end confirmation pass, and an ended card.
- **Requirements:** R6 (mute control), R11, R12 (Send), R22, R23, R25 (pause control), R26, R37 (switch UI), R44 (confirmation); KTD11, KTD12, KTD21, KTD22 (page side).
- **Dependencies:** U1, U2, U4.
- **Files:** create `src/live/overlay/LiveOverlay.tsx`, `src/live/overlay/LiveOverlay.test.tsx`, `src/live/overlay/Board.tsx`, `src/live/overlay/Board.test.tsx`, `src/live/overlay/LiveIndicator.tsx`, `src/live/overlay/LiveIndicator.test.tsx`, `src/live/overlay/ModeSwitch.tsx`, `src/live/overlay/ModeSwitch.test.tsx`, `src/live/overlay/SendControl.tsx`, `src/live/overlay/SendControl.test.tsx`, `src/live/overlay/ConsentDialog.tsx`, `src/live/overlay/ConsentDialog.test.tsx`, `src/live/overlay/consentCopy.ts`, `src/live/overlay/consentCopy.test.ts`, `src/live/overlay/EndedCard.tsx`, `src/live/overlay/EndedCard.test.tsx`.
- **Approach:**
  1. `ConsentDialog.tsx` renders copy from `consentCopy.ts` — derived from the active profile, the resolved endpoint origin, and a sentence that the endpoint keeps a local session log until the riffer deletes it (R22, R26) — acquires the single microphone stream (KTD21), and reports denial as `mic: "denied"` while offering drawing-and-board-only.
  2. `LiveIndicator.tsx` renders connecting/reconnecting, streaming, buffering locally, muted, capture paused, and incompatible endpoint (showing the expected version), with a mute toggle wired to `setMuted` and a pause toggle that affects frames and stream only.
  3. `Board.tsx` lists units by status with the needs-info question inline and a typed reply field that emits an `answer` (always available; primary in `live_novoice`), strike-through for withdrawn, a guess note for Instant applications, a withdraw button on `initial` units, and at the `final` checkpoint a confirmation pass per unit (intended element and change confirmed or not) emitted as `unit_update` (KTD22).
  4. `ModeSwitch.tsx` writes the mode into the session and shows "pending until next checkpoint" after a change (KTD12); `SendControl.tsx` calls the session's `send` checkpoint.
  5. `LiveOverlay.tsx` composes these with the drawing layer toggle as a collapsible panel docked to the right edge, collapsing to a pill with the indicator and Send; it never intercepts pointer events outside its own controls.
  6. `EndedCard.tsx` replaces the zip download notice when the session ended via `session_ended`: counts by final status and a pointer to the residual list.
- **Patterns to follow:** `src/RiffrecRecorder.tsx` consent dialog and inline-style approach; the provider-level stop control in `src/RiffrecProvider.tsx`; `// @vitest-environment jsdom`.
- **Test scenarios:**
  - Consent copy for a profile with `audio_clip` enabled names audio clips going to the endpoint; without it, the copy does not; the copy names the fragment-supplied origin and the log retention sentence.
  - Covers AE14. Declining consent leaves the session idle and emits no events.
  - Mic denied: session enters `live_novoice`, the indicator shows muted, the board and drawing layer remain usable, and a typed reply on a needs-info unit produces an `answer` event.
  - Toggling mute flips the indicator to muted and back and calls `setMuted`.
  - The indicator renders every state in KTD16's machine with its label copy.
  - Covers AE2, AE15. Board renders a Collect-mode accepted unit with no applied marker, and an Instant-mode applied unit with its guess note.
  - Clicking withdraw on an `initial` unit marks it withdrawn and excludes it from the next batch; the button is absent on released units.
  - Send emits one `send` checkpoint; a second Send with nothing held emits none; a mode change shows the pending hint until the next checkpoint.
  - At `final`, the confirmation pass emits one `unit_update` with `confirmed` per unit; the ended card shows counts and no zip notice.
  - Strokes passed from the session store rehydrate into the drawing layer after a simulated reload.
- **Verification:** `npm test` passes; a manual session shows every indicator state as the fake endpoint is stopped, restarted, and version-bumped.

### U6. Evidence capture, audio clips, and segmented recording

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** Gesture-buffered and periodic screenshots, composited frames, utterance audio clips, the evidence profile applied on the wire, stroke-to-unit attachment, and a screen recording that survives reloads as persisted segments.
- **Requirements:** R16 (attachment window), R17–R21, R25 (pause semantics); KTD10, KTD15, KTD21 (clip consumer); Interface I6.
- **Dependencies:** U2, U4.
- **Files:** create `src/live/evidence/frames.ts`, `src/live/evidence/frames.test.ts`, `src/live/evidence/composite.ts`, `src/live/evidence/composite.test.ts`, `src/live/evidence/audioClip.ts`, `src/live/evidence/audioClip.test.ts`, `src/live/evidence/profile.ts`, `src/live/evidence/profile.test.ts`, `src/live/evidence/attach.ts`, `src/live/evidence/attach.test.ts`, `src/output/segmentStore.ts`, `src/output/segmentStore.test.ts`; modify `src/capture/screen.ts`, `src/capture/screen.test.ts`, `src/output/session.ts`, `src/output/zip.ts`, `src/output/zip.test.ts`.
- **Approach:**
  1. `frames.ts` draws the display stream's current frame into a ring buffer (last 12) at every anchor gesture and on the periodic timer; a unit picks the frame nearest its first anchor timestamp; with no display stream it yields nothing and units ship with empty `frame_ids` (KTD10).
  2. `composite.ts` renders the current frame plus the annotation's strokes into one JPEG through a serialized queue and cross-references ids (R20).
  3. `audioClip.ts` records the shared microphone clone between `speech_started` and `speech_stopped` and attaches the clip by id to the unit extracted from that utterance; serialized only when the profile enables `audio_clip`.
  4. `profile.ts` defines `EvidenceProfile` and applies it when the stream client serializes a unit: transcript excerpt, anchors (always), strokes, composite, telemetry window, audio clip.
  5. `attach.ts` attaches a completed annotation to the most recent unit extracted within the 4 s window, else creates a drawing-only unit.
  6. `screen.ts` gains timeslice recording into `segmentStore.ts`, segment close on `pagehide`, a re-share prompt hook after rehydration, and treats declined share like a denied mic; `output/session.ts` assembles segments per KTD15; `zip.ts` applies the 50 MB guard to the whole `recording(-NNN)?.webm` family. Pause stops frame capture and stream serialization only.
- **Patterns to follow:** `src/output/filesystem.ts` for the IndexedDB open/store pattern; `src/capture/screen.ts` `MediaRecorder` handling; `src/output/zip.ts` `filterZipSessionFiles`.
- **Test scenarios:**
  - Covers AE4 (KTD10 attachment window). A stroke completing 2 s after a unit attaches to it; one completing 6 s after opens a drawing-only unit.
  - The frame attached to a unit is the buffered frame captured at the click, not a frame captured when the tool call resolves (assert by frame id and timestamp).
  - A unit extracted after a reload and before re-share has empty `frame_ids` and no composite; capture resumes after the re-share hook fires.
  - Two annotations completing 10 ms apart produce two composites with the correct strokes each and distinct ids.
  - An utterance produces one audio clip attached to its unit; with `audio_clip` disabled the clip is not serialized.
  - Profile `anchors_transcript_only` serializes a unit without frames or strokes; the default profile includes one composite and strokes.
  - Covers AE7. Chunks persist every second; after a simulated reload the previous segment is closed and listed as `recording.webm`, and a new `recording-002.webm` starts only after re-share.
  - The zip guard excludes recording segments once their total exceeds 50 MB and keeps `events.json`.
  - Pause: no new frames and no stream serialization while paused; recording chunks keep arriving.
- **Verification:** `npm test` passes; a manual session with one reload yields an archive with `recording.webm` and `recording-002.webm` both playable.

### U7. Provider integration, lazy loading, public API, and documentation

- **Repo:** `kieranklaassen/riffrec`
- **Goal:** Wire live mode into `RiffrecProvider` and `useRiffrec` behind a lazy import, keep classic sessions unchanged, exclude own traffic from capture, and update the package's documents.
- **Requirements:** R1, R24, R27–R29, R38 (unmount behavior); KTD1, KTD16, KTD17; Interface I5.
- **Dependencies:** U3, U5, U6.
- **Files:** modify `src/RiffrecProvider.tsx`, `src/RiffrecProvider.test.ts`, `src/useRiffrec.ts`, `src/types.ts`, `src/capture/network.ts`, `src/capture/network.test.ts`, `src/index.ts`, `src/noop.tsx`, `tsup.config.ts` (code splitting if not already enabled), `README.md`, `CHANGELOG.md`, `docs/requirements.md`; create `src/RiffrecProvider.live.test.tsx`.
- **Approach:**
  1. `types.ts` adds `live?: RiffrecLiveConfig` (I5, including `drawShortcut`) to `RiffrecConfig`, a live `RiffrecStatus` value, and the `live` slice with `muted`/`setMuted` to `RiffrecContextValue`; no option accepts an OpenAI key (R5).
  2. `RiffrecProvider.tsx` lazy-loads `src/live/LiveOverlay` only when `live` is set and the production guard allows (KTD1); `start()` with a live config runs the live state machine; the unmount effect skips `stop()` for the live status (KTD16); `stop()` on a live session ends it and assembles the archive per R4.
  3. The provider passes the endpoint origin and `api.openai.com` to `NetworkCapture`'s exclusion list (KTD17); `redactUrl` strips the live fragment keys (KTD3).
  4. `README.md` replaces the "does not call an LLM" sentence and documents the `live` config, the fragment bootstrap, the endpoint contract pointer, and the archive additions; `CHANGELOG.md` gets the live-mode entry; `docs/requirements.md` rewrites legacy R17 and the "no real-time analysis" boundary and links this plan.
- **Patterns to follow:** existing `forceEnable`/`forceEnableParam` guard at `src/RiffrecProvider.tsx` 218–237; `window.__RIFFREC_PATCHED__` double-mount guard; `NetworkCapture.start(sessionStart, onEvent, excludeUrls)`.
- **Test scenarios:**
  - A provider without `live` behaves exactly as today: the existing `RiffrecProvider.session.test.tsx` suite passes unchanged and the live chunk is not requested.
  - Covers AE13. Unmounting a provider mid-live-session does not call the archive writer and the session rehydrates on remount.
  - Requests to the endpoint origin and `api.openai.com` produce no `network_request` events; other requests still do; a URL carrying `#riffrec_live=` is captured without the fragment.
  - In production without `forceEnable`, `live` renders nothing and makes no network calls.
  - `useRiffrec().live.setMode("collect")` changes the mode carried on the next checkpoint; `setMuted(true)` mutes.
- **Verification:** `npm run typecheck`, `npm test`, and `npm run build` pass; `dist/` contains a separate live chunk and the main chunk for a host without `live` grows by no more than the provider glue; README renders the new sections.

### U8. Live endpoint helper

- **Repo:** `EveryInc/compound-engineering-plugin`
- **Goal:** The local endpoint polish runs: a copy of the prototype helper adapted to the stream contract, with two credentials, mint, event intake, SSE, agent wake with acknowledgment, agent posts, page-lost detection, batch persistence, single-owner wake, session archive intake, and replay.
- **Requirements:** R31–R33, R38 (page-lost), R39 (answer checkpoint), R40 (no file serving), R43 (final checkpoint), R44 (log and replay); KTD2, KTD4, KTD7, KTD8, KTD9 (endpoint side), KTD18, KTD22; Interfaces I2, I3, I4.
- **Dependencies:** U1's contract text now; U1's fixtures for U10.
- **Files:** create `skills/ce-polish/scripts/live-endpoint.js` (copied from `skills/ce-prototype/scripts/light-webserver.js`, then adapted), `skills/ce-polish/references/live-stream-contract.md` (copy of the contract summary and the tool definitions; the skill may not reference riffrec's repo by path).
- **Approach:**
  1. Copy the helper; keep `parseArgs`, the run-directory layout, `start`/`status`/`stop`/`wait`, idle timeout, `--owner-pid`, and `touch()`; remove `screens/`, overlay files, `/version`, every file-serving branch, `armSseGrace`, and the pending-document handshake; owner death and idle timeout stop the process without ending the session (KTD18); reduce credential parsing to `Authorization: Bearer`.
  2. On `start`, mint `page_token` and `agent_token`, write `state/session.json` (0600) per I4, print `{ url, port, page_token }` once; create `state/` 0700.
  3. Add `--app-origin` with exact-origin CORS and `OPTIONS` handling on page routes; agent routes emit no CORS headers and return 403 to any request with an `Origin` header.
  4. Add `/mint` per KTD4 and I2 (owned tools and persona from the copied contract, brief secret scan, rate limits, TLS check, upstream errors, no logging of headers or bodies, never persist `client_secret`).
  5. Replace `/annotation` with `POST /events` (dedup by `(session_id, seq)`, `{ acked_seq }`, body caps and 413, session-id binding with 409, disk cap), `GET /stream` (SSE with the I3 event names, `unit_status: "triaging"` on release), `POST /session/end` (accepts the archive into `state/log/`, marks ended, invalidates tokens); keep `/wait` returning the KTD7 envelope; add `POST /checkpoints/:id/ack`, `POST /units/:id/status`, `POST /units/:id/ask`, `GET /status`.
  6. Implement checkpoint release for `silence`/`page_change`/`send` from page checkpoints, endpoint-emitted `answer` (answers only) and `final`; `mode_at_checkpoint` stamping; page-lost grace (KTD8); persisted un-acked batches under `state/batches/` re-served first; 409 for a second concurrent `wait`.
  7. Add `replay --root --profile --to` (KTD22) that re-emits `state/log/` under a profile to another endpoint using the page-route contract.
- **Patterns to follow:** the prototype helper's own structure (dispatch 1234–1249, routes 966–1136, token 725, held queue 727–835, SSE 1056–1080, lifecycle 1183–1194, `wait` 684–721); `breathwork-live` `app/services/openai/realtime_secrets.rb` for the mint body.
- **Test scenarios:** owned by U10; this unit lands with U10's endpoint suite passing against it.
- **Verification:** `bun test tests/skills/ce-polish-live-endpoint.test.ts` passes; `bun test tests/skill-conventions.test.ts` passes; `node skills/ce-polish/scripts/live-endpoint.js start --root <tmp> --app-origin http://localhost:3000` prints the start envelope without the agent token, and `status` prints a board summary.

### U9. `ce-polish` live-mode prose and install step

- **Repo:** `EveryInc/compound-engineering-plugin`
- **Goal:** The skill asks live or traditional, and live mode is fully described in references: preconditions and disclosure, install detection and installation to a minimum riffrec version, brief writing, endpoint start and URL handoff with fragment token and origin, the wake loop per execution mode with acknowledgment, questions, page-lost recovery, wait-taken handling, remote sessions, and session end with the residual list and log path.
- **Requirements:** R34–R44; KTD3, KTD7, KTD11–KTD14, KTD19, KTD20; Interfaces I4, I5.
- **Dependencies:** U8 (CLI surface per I4); the riffrec release (U7) for the minimum version the install step names.
- **Files:** modify `skills/ce-polish/SKILL.md`, `docs/guides/ce-polish.md`, `README.md` (only if the skill's one-line description changes); create `skills/ce-polish/references/live-start.md`, `skills/ce-polish/references/live-loop.md`, `skills/ce-polish/references/live-remote.md`, `skills/ce-polish/references/install-riffrec.md`, `skills/ce-polish/scripts/detect-riffrec.sh`.
- **Approach:**
  1. `SKILL.md`: add step 1a "Ask live or traditional" with the disclosure line from R34 and `Read references/live-start.md` for live; keep the traditional loop untouched; stay under 8,000 bytes (KTD19).
  2. `live-start.md`: key precondition (else name it and offer traditional); run `scripts/detect-riffrec.sh`; install or upgrade per `install-riffrec.md`; write the brief per KTD13 to `state/brief.md`; start the endpoint with `--app-origin` (the browser-facing origin), `--owner-pid`, and `--host` when remote; restart or hot-reload the dev server after the mount edit; probe the page for the live bootstrap; hand over the URL with `#riffrec_live=<page_token>&endpoint=<origin>` (KTD3); consent decline behavior (R35).
  3. `install-riffrec.md`: add or upgrade `riffrec` to the named minimum version with the project's package manager (reuse `scripts/resolve-package-manager.sh`), mount `<RiffrecProvider forceEnable live={{}}>` at the app root (I5), commit as the disclosed setup commit on the current branch (KTD14).
  4. `live-loop.md`: park on `wait`; on exit 0 acknowledge the checkpoint first, then per `mode_at_checkpoint` decide apply / ask / residual (R37); post statuses and questions; on `session_status: "page_lost"` fix or revert before parking again; on exit 3 stop this run without stopping the endpoint; on `kind: "final"` apply per mode, run `ce-commit`, write the residual list, and report the session log path (R43, R44); never act before a checkpoint (R36).
  5. `live-remote.md`: binding the endpoint and dev server on an interface, the HTTPS rule for both origins and the two-tunnel consequence (R42), tunnel recipes (Tailscale serve, cloudflared, ngrok), the disclosure wording (R40), and that voice is unavailable on plain-HTTP LAN URLs.
  6. `detect-riffrec.sh`: exits 0 with `{ dependency: bool, version: string | null, mount: bool, package_manager }`.
- **Patterns to follow:** `skills/ce-polish/references/run.md` (SKILL_DIR anchor, tuple resolution), `skills/ce-prototype/references/annotation-loop.md` (wait loop prose), `skills/ce-riffrec-feedback-analysis/references/install-riffrec.md` (superseded content), `tests/skills/ce-polish-project-type.test.ts` (script test shape).
- **Test scenarios:** owned by U10 (`ce-polish-detect-riffrec.test.ts` and `ce-polish-live-prose.test.ts`).
- **Verification:** `bun test tests/skill-conventions.test.ts tests/codex-skill-prompt-budget.test.ts tests/release-metadata.test.ts` pass (skill count unchanged at 35; `ce-polish` stays out of the over-budget set); a dry read of `live-start.md` → `live-loop.md` by a fresh agent produces the F1–F3 sequence without consulting this plan.

### U10. Helper tests and the two-agent loop smoke

- **Repo:** `EveryInc/compound-engineering-plugin`
- **Goal:** Prove the endpoint against the published fixtures, prove the detect script and prose gates, and prove the whole loop — fake page, real helper, fake agent — with no human and no LLM.
- **Requirements:** AE1, AE3, AE6, AE10, AE12, AE13 at the helper seam; R31–R33, R38, R39, R44; KTD4, KTD7, KTD8, KTD9, KTD22.
- **Dependencies:** U8; U1's fixtures copied into `tests/fixtures/ce-polish-live/`.
- **Files:** create `tests/skills/ce-polish-live-endpoint.test.ts`, `tests/skills/ce-polish-live-loop.test.ts`, `tests/skills/ce-polish-live-prose.test.ts`, `tests/skills/ce-polish-detect-riffrec.test.ts`, `tests/fixtures/ce-polish-live/*.json` (copied from riffrec `src/live/fixtures/`), `tests/fixtures/ce-polish-live/project-with-riffrec/`, `tests/fixtures/ce-polish-live/project-without-riffrec/`, `tests/helpers/fakeLivePage.ts`, `tests/helpers/fakeLiveAgent.ts`.
- **Approach:**
  1. Spawn the helper with `Bun.spawn(["node", script, "start", ...])` as `ce-prototype-server.test.ts` does; drive it with `fetch`; stub the OpenAI base URL through the helper's environment override.
  2. `fakeLivePage.ts` posts fixture envelopes with sequencing and the session header, consumes `/stream`, and can go silent to simulate loss; `fakeLiveAgent.ts` runs `wait`, asserts the envelope, acks, and posts statuses and questions.
  3. The loop test scripts: three units and a drawing-only unit, one withdrawal, one `page_change` checkpoint → one wake; ack; Smart triage posts one question → `ask` arrives on the stream → the page posts an `answer` → an `answer` checkpoint wakes the agent with `answers[]` only → it posts `applied`.
- **Patterns to follow:** `tests/skills/ce-prototype-server.test.ts`, `tests/skills/ce-prototype-protocol.test.ts`, `tests/skills/ce-polish-project-type.test.ts`.
- **Test scenarios:**
  - Every fixture envelope is accepted with `acked_seq` advancing; a replayed `seq` is acknowledged without duplicating the unit; a foreign `schema_version` returns 409 with the expected version.
  - Covers AE1. Three units then a `page_change` checkpoint produce exactly one wake with three units; an empty checkpoint produces no wake.
  - Covers AE12. A `unit_withdraw` before the checkpoint excludes the unit; one after release appears in the next batch as `withdrawn`.
  - Covers AE6, AE3. An `ask` post surfaces on `/stream`; the answer produces an `answer` checkpoint carrying `answers[]` and no units; the agent's `applied` post surfaces on `/stream`.
  - Covers AE13. After an `applied` notice, closing the page's stream without reconnecting for longer than the grace window makes the next `wait` return `session_status: "page_lost"` once and then block until reconnect.
  - Covers AE10 seam. With the helper stopped, the fake page buffers; after restart with the same root, replayed envelopes are acknowledged from the last ack, and an un-acked batch is re-served to the next `wait` before any new batch.
  - `/mint` without a key returns 503 `no_key`; with a stub key and stubbed OpenAI returning 401 it returns 502 with `upstream_status`; a brief containing `sk-` returns 503 `brief_contains_secret`; a sixth mint in a minute returns 429; a non-loopback plain-HTTP peer returns 403 `tls_required`; `state/` contains neither the stub key nor a minted secret afterwards.
  - A second concurrent `wait` receives 409 and the CLI exits 3 with `wait-taken`.
  - Every route without a credential returns 401; a page token on an agent route and an agent token on a page route return 403; a `?token=` query returns 401; an agent route with an `Origin` header returns 403; `OPTIONS` on `/events` returns the exact app origin and no credentials flag.
  - A 3 MB batch returns 413; a lone 1.5 MB frame is accepted; the start envelope omits `agent_token`; `state/session.json` is mode 0600.
  - `/session/end` stores the archive under `state/log/`, marks ended, and invalidates both tokens; `replay --profile anchors_transcript_only` re-emits the log to a second helper with frames stripped.
  - `detect-riffrec.sh` on the with-riffrec fixture reports dependency true, a version string, and mount true; on the without fixture reports both false and null.
  - Prose test: all skill-local paths resolve; `SKILL.md` under 8,000 bytes; skill count unchanged.
- **Verification:** `bun run test` passes (full suite), then `bun run release:validate` and `bun run plugin:validate` exit 0.

---

## Verification Contract

| Repo | Gate | Command | Applies to | Done signal |
|---|---|---|---|---|
| riffrec | Type check | `npm run typecheck` | U1–U7 | exits 0 |
| riffrec | Unit and integration tests | `npm test` | U1–U7 | all suites pass, including the pre-existing `RiffrecProvider.session.test.tsx` unchanged |
| riffrec | Build | `npm run build` | U7 | `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` produced with a separate live chunk; live types exported |
| riffrec | Bundle budget | inspect build output size | U4, U7 | `perfect-freehand` adds under 10 KB minified to the live chunk; the main chunk for a host without `live` grows by no more than the provider glue; such a host makes no new network calls (asserted in U7 tests) |
| compound-engineering-plugin | Skill conventions and prompt budget | `bun test tests/skill-conventions.test.ts tests/codex-skill-prompt-budget.test.ts` | U8, U9 | no cross-skill path; `SKILL.md` under 8,000 bytes |
| compound-engineering-plugin | Release metadata | `bun test tests/release-metadata.test.ts` | U9 | skill count unchanged (35) |
| compound-engineering-plugin | Helper, detect, and loop tests | `bun test tests/skills/ce-polish-live-*.test.ts tests/skills/ce-polish-detect-riffrec.test.ts` | U8–U10 | all scenarios in U10 pass |
| compound-engineering-plugin | Full gate | `bun run test` then `bun run release:validate` and `bun run plugin:validate` | U8–U10 | exits 0 |
| cross-repo | Loop smoke with a real interviewer | manual: link the local riffrec build into Thinkroom, run `/ce-polish` live with `OPENAI_API_KEY` set | Definition of Done | F1–F3 observed once; AE7 observed once with a forced reload; the interviewer does not speak after every unit |
| cross-repo | Evidence ablation | `replay` one session log under three profiles to a fresh agent (KTD22) | Success Criteria | scored per unit against the confirmation pass; result recorded in this plan's R19 |

---

## Definition of Done

**Global**

- Every unit's test scenarios exist as tests and pass in its repository's gate.
- The riffrec release publishes the lazy-loaded live subtree, the contract document, and the archive additions; a host without `live` behaves as before and loads no live code (R27, Success Criteria).
- The `ce-polish` release ships the helper, the references, the detect script, and the guide update with `SKILL.md` under 8,000 bytes.
- The cross-repo loop smoke has been run once on Thinkroom against a local link of the riffrec build before publish: talk and draw for five minutes, see applied commits, one spoken question answered, one typed answer, a residual list, and a session log (Success Criteria).
- Abandoned attempts are removed: no cookie or query-string credential paths in the helper, no `EventSource` fallback, no screens-serving or SSE-grace remnants in the copied helper, no tool definitions for emitting checkpoints or reporting state.
- `docs/requirements.md` and `README.md` in riffrec reflect the new posture (R28); this plan's R19 default is updated after the ablation.

**Per unit**

- U1: fixtures and document agree (test-enforced); exactly four tools; types exported from `dist`.
- U2: silence and page-change checkpoints, buffering and replay, withdrawal ordering before and after release, rehydration with sequencing, fragment hygiene, and both archive shapes covered.
- U3: question queueing, interruption re-queue, noise gating, no response after tool results, re-seed bound, mint error handling, shared-mic mute, audio-routing reachability covered; one manual audible run.
- U4: anchoring, pointer capture, active affordance, prop-driven rehydration covered; size budget met.
- U5: consent copy from profile and origin, mic denial with typed reply, mute toggle, every indicator state, withdraw affordance, mode switch with pending hint, Send, confirmation pass, ended card covered.
- U6: gesture-time frames, no-stream behavior, composite queue, audio clips, attachment window, segments across a reload, zip guard covered.
- U7: classic behavior unchanged and live chunk not loaded; unmount does not end a live session; own traffic and fragment excluded; docs updated.
- U8: two credentials, every I3 route and error code, mint hardening, page-lost, batch persistence and acknowledgment, single-owner wake, archive intake, replay implemented.
- U9: prose paths resolve; detect script reports version; a fresh agent can run F1–F3 from the references alone.
- U10: all listed scenarios pass; fixtures identical to riffrec's.
