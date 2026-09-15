---
title: Live Voice Mode - Plan
type: feat
date: 2026-09-15
topic: live-voice-mode
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Live Voice Mode - Plan

## Goal Capsule

- **Objective:** RiffRec gains a **live mode** that delivers a session as a stream — voice transcript, units, drawings, evidence, events — to a configured endpoint instead of a zip at `stop()`, and `ce-polish` gains a **live mode** that consumes that stream: the user's own running coding agent wakes at checkpoints with batched units and applies them per a user-selected execution mode. Both parts ship together as one work unit; the stream has no consumer without polish, and polish has no stream without riffrec.
- **Product authority:** Kieran Klaassen's voice note (2026-09-14) and the brainstorm dialogue of 2026-09-14/15, revised after the document review of 2026-09-15. Surrounding areas — the dashboard as a hosted consumer, non-React hosts, collaborator and client-tester audiences without their own agent — are not active scope (see How This Work Fits Together).
- **Open blockers:** none. Three product questions are marked Resolve Before Planning and each carries a default; one review item is parked under Deferred / Open Questions with a proposed default. Planning can proceed on the defaults if they stand.

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
- **Informed Interviewer, degrading to plain Interviewer.** When the consumer supplies a session brief (for polish: routes, component names, design tokens, recent changes, written by the coding agent at session start), the interviewer's instructions carry it so its questions are grounded in the app. The brief is non-secret app metadata — never environment values, credentials, or user data — and it is sent to OpenAI as session instructions. Without a brief the interviewer runs on the package default persona. Recommended by the agent; not yet confirmed by the user. Governs R7, R35.
- **The v1 interviewer hears and reads; it does not see.** Audio and text only. A consumer-supplied tool set may not carry image content; frames go to the endpoint, never to OpenAI. A frame-seeing interviewer is deferred until the ablation shows whether frames help the coding agent. Governs R7, R22.
- **Two lanes.** Units appear on the board instantly and optimistically from the interviewer; the coding agent wakes only at a checkpoint. (session-settled: user-directed — chosen over continuous per-unit wake, wake only on the user's cue, and interviewer-decides-alone: speed where the user is looking, judgment where it is expensive.) Governs R10–R12, R36.
- **Checkpoints are a stream event, coarser than an utterance.** The interviewer emits one when the riffer falls silent for longer than a threshold set in planning, or changes pages; the overlay's Send control emits one on demand. One sentence per change must not become one wake per unit. Consumers decide what a checkpoint triggers; polish flushes held units into the agent's wake. Governs R12, R36.
- **Execution mode is a user switch in the UI: Instant, Smart, Collect.** All three act at checkpoint cadence; they differ in what the agent does with a batch, not when. (session-settled: user-directed — chosen over a single fixed policy.) Default is an open question, leaning Smart. Governs R37, R38.
- **Capture everything; attach a tunable evidence profile; decide the default by experiment.** (session-settled: user-directed — chosen over a fixed Lean/Rich/Everything tier: the user wants as much evidence as possible captured, screenshots rather than video on the wire, and an ablation to learn what helps the agent.) Starting default on the wire: transcript excerpt, anchors, structured strokes, one composited frame. Anchors are part of every unit regardless of profile. Governs R10, R17–R21, Success Criteria.
- **Drawing layer is a thin custom overlay on `perfect-freehand` plus the prototype's pin mechanics.** No tldraw in the package: tldraw's production license-key requirement would fall on every host app that runs riffrec live in production. Excalidraw stays an optional host-provided adapter later. (session-settled: user-directed — chosen over tldraw SDK and Excalidraw: no production license or key may be imposed on host apps, and the package must stay light enough to ship into every fleet app.) Governs R13–R16.
- **Full loop in v1, no staged slice.** Voice interviewer, units board, drawing overlay, agent wake, and the execution-mode switch ship together. (session-settled: user-directed — chosen over any single-slice first cut.) Scope risk: this is five surfaces across two repositories landing at once; the plan accepts it and names it here once.
- **R17 of the original RiffRec requirements is rewritten, not deleted.** The package still holds no long-lived key and makes no server-side LLM calls; the voice widget connects to OpenAI Realtime from the browser using an ephemeral secret the endpoint mints. Governs R5, R28.
- **Coverage is React-first.** The package stays React-first. Avoid gratuitous React coupling in the overlay, board, and voice widget, but no maintained framework-agnostic boundary is required in v1; the script embed stays deferred. Resolved after review against the agent's earlier assumption of a required boundary. Governs R29.
- **Installing riffrec is a disclosed, permanent setup commit.** Live polish tells the riffer, before installing, that live mode adds riffrec to the app as a dependency and a provider mount, committed on the current branch; riffrec stays after the session, matching the fleet posture. Whether the commit lands on the feature branch or on its own branch first is an open question. Governs R34, R35.
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

**Resolve Before Planning**

- Default execution mode. Leaning Smart; Collect is the safe alternative.
- Informed Interviewer or plain Interviewer as the v1 behavior when a brief is available. Recommended: Informed. Plain leaves every codebase-grounded ambiguity to checkpoint-time questions from the coding agent; only Informed delivers the live "which one?" the Problem Frame promises.
- Whether the riffrec setup commit stays on the polish feature branch or lands first on its own branch. Default: it stays on the polish feature branch.

**Deferred to Planning**

- The freehand implementation within the constraints in Key Decisions (`perfect-freehand` leaning), stroke-to-element anchoring heuristics, and the pin composer.
- Event and unit schemas, sequence and retry semantics, and how the endpoint issues the session token.
- How the session token reaches the page across the app and endpoint origins without appearing in a URL, and CORS on the copied helper.
- Checkpoint heuristics: the silence threshold, page change, and how Send interacts with an in-progress utterance.
- A retroactive attach window for drawing that precedes the interviewer's unit extraction (R16).
- Periodic screenshot cadence, frame resolution, and the composite rendering path.
- Session brief content and size cap; how a non-polish consumer supplies one.
- Realtime session maximum duration and secret expiry against session length; reconnection after reload and how much transcript re-seeds the interviewer.
- Excluding live mode's own endpoint and Realtime traffic from the package's network capture.
- Which framework recipes in `ce-polish` can host riffrec live mode, and what the skill says on a non-React project.
- Tunnel guidance in the skill: Tailscale serve, cloudflared, ngrok; whether the helper gains a TLS option or relies on the tunnel; binding the dev server on the chosen interface.
- Board rendering inside the overlay and the terminal mirror the coding agent sees.

### Sources / Research

- `docs/requirements.md` — original RiffRec requirements, including R17 and the "no real-time analysis" boundary this plan revises.
- `README.md` — session format and host-managed output contract; line 7 changes under R28.
- `src/RiffrecProvider.tsx`, `src/RiffrecRecorder.tsx`, `src/types.ts`, `src/capture/element.ts`, `src/capture/screen.ts`, `src/capture/network.ts` — production guard, `download`/`onSessionComplete`, click anchors, display-capture lifetime, fetch patching.
- Repository `EveryInc/compound-engineering-plugin`: `skills/ce-polish/SKILL.md` and `references/run.md` (the traditional loop and startup tuple); `skills/ce-prototype/scripts/light-webserver.js`, `assets/annotate.js`, `references/annotation-loop.md`, `references/preview.md` (the endpoint pattern this plan copies); `skills/ce-riffrec-feedback-analysis/` (the zip consumer); `STRATEGY.md` (no telemetry, bring your own harness).
- Repository `kieranklaassen/breathwork-live`: `app/services/openai/realtime_secrets.rb`, `app/frontend/lib/breathwork/realtimeClient.ts`, `app/services/breathwork/agent_tools.rb`, `docs/solutions/realtime-voice-session-architecture.md` — the Realtime pattern, the `watch` frame tool, and the dropped-transcript lesson.
- Repository `kieranklaassen/riffrec-dashboard`: `AGENTS.md`, `docs/plans/2026-07-15-002-feat-extract-run-pipeline-plan.md` (KTD12: polling over SSE), `config/routes.rb` (`/integrate/:stack`).
- Repository `kieranklaassen/compound-stack-rails`: `README.md`, `config/initializers/riffrec.rb`, `app/frontend/lib/riffrec_provider.tsx` (the stub), `docs/changelog/` — the fleet rollout mechanism.
- Repository `kieranklaassen/atelier`: `docs/decisions.md` D58 and D60.
- tldraw licensing: tldraw.dev, "20 things I wish AI chatbots knew about tldraw" — production use requires a license key since SDK 4.0.

## Deferred / Open Questions

### From 2026-09-15 review

- **Execution-mode switch behavior on mid-session change is unspecified** — R37 (P2, design-lens, confidence 75)

  Two implementers would build different transitions for a riffer who flips Instant / Smart / Collect while units are already accepted but not yet applied — whether Collect's held batch applies retroactively on a switch to Instant, or only units accepted afterwards. Proposed default: a mode change takes effect at the next checkpoint and covers every accepted-but-unapplied unit.
