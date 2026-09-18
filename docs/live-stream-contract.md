# Live Stream Contract (`live/1`)

This document is the wire contract for riffrec live mode. It covers the four
hand-over surfaces a consumer (an endpoint and the agent behind it) implements
against:

- **I1 — Stream contract**: the envelope the page posts and every payload shape.
- **I2 — Mint contract**: how the page obtains an ephemeral OpenAI Realtime secret.
- **I3 — Endpoint HTTP surface**: page routes, agent routes, headers, and error codes.
- **I4 — Wake envelope and CLI**: what the agent receives when it wakes.

The TypeScript source of truth is `src/live/contract.ts` (types and the
`validateEnvelope` guard) and `src/live/tools.ts` (the interviewer tool set).
Fixtures under `src/live/fixtures/` hold one valid example per event type plus
`wake-batch.json`, `mint-request.json`, and `mint-response.json`. A test loads
every fixture and checks it against the field tables below, so the tables, the
fixtures, and the types cannot drift apart. Everything exported from
`src/live/index.ts` is re-exported from the package root, including the Node entry.

## Versioning

The stream is versioned independently from the zip schema. Every envelope
carries `schema_version: "live/1"` (`LIVE_SCHEMA_VERSION`). Breaking changes bump
the version and are documented in `CHANGELOG.md`. An endpoint that does not
support the version it receives rejects the batch with HTTP `409` and
`{ "expected_schema_version": "<version it supports>" }`; the page then shows
the incompatible-endpoint indicator state and stops posting rather than parsing
best-effort. Adding an optional payload field or a new event type is not a
breaking change; consumers must ignore fields they do not know, but must reject
event types they do not know (the guard does).

Field tables use the columns Field, Type, Required, Description. `Required: yes`
means the field is always present; `no` means it may be absent (never `null`
unless the type says so). Timestamps named `t`, `t_start`, `t_end` are
milliseconds since session start, matching `events.json`. All identifiers are
opaque strings minted by the page.

## I1 — Stream contract

### `envelope`

Every page → endpoint message. `seq` is a per-session monotonic integer starting
at 1. The endpoint deduplicates on `(session_id, seq)` and acknowledges the
highest contiguous `seq` it holds; after an outage the page replays from the last
acknowledged `seq`. `frame` envelopes are posted alone, never batched with other
events.

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | `"live/1"` | yes | Contract version. |
| `session_id` | string | yes | Session id minted by the page; also sent as the `X-Riffrec-Session` header. |
| `seq` | integer ≥ 1 | yes | Per-session monotonic sequence number. |
| `t` | number | yes | Milliseconds since session start when the event was produced. |
| `type` | event type | yes | One of the fifteen event types below. |
| `payload` | object | yes | Shape determined by `type`. |

Event types: `click`, `network_request`, `console_error`, `navigation`
(the existing `events.json` events, unchanged), `transcript`, `unit`,
`unit_update`, `unit_withdraw`, `annotation`, `checkpoint`, `answer`, `frame`,
`mic`, `mode`, `stream_state`.

### Shared shapes

#### `anchor`

Where a unit or annotation points. Anchors are part of every unit regardless of
evidence profile.

| Field | Type | Required | Description |
|---|---|---|---|
| `route` | string | yes | Pathname (plus search) of the page at anchor time. |
| `selector` | string | yes | CSS selector for the element, as `events.json` clicks record it. |
| `component` | string or null | no | React component name when available. |
| `rect` | rect | yes | `{ x, y, width, height }` of the element in CSS pixels. |
| `t` | number | yes | Timestamp of the gesture that produced the anchor. |

#### `evidence`

Attached to every unit; which optional members are populated depends on the
evidence profile the consumer declared.

| Field | Type | Required | Description |
|---|---|---|---|
| `frame_ids` | string[] | yes | Ids of `frame` events attached to the unit; empty when no display stream exists. |
| `annotation_ids` | string[] | yes | Ids of `annotation` events attached to the unit. |
| `transcript_span` | span | yes | `{ t_start, t_end }` of the speech the unit came from. |
| `telemetry_window` | telemetry window | no | `{ t_start, t_end, events[] }`: network and console events within ±10 s (profile-enabled). |
| `audio_clip_id` | string | no | Id of the audio clip of the utterance (profile-enabled). |

#### `confirmation`

The riffer's confirmation pass at the `final` checkpoint: `{ element: boolean, change: boolean }`
— whether the intended element and the intended change were confirmed.

#### `point`

`{ x: number, y: number, pressure?: number }` in CSS pixels relative to the viewport.

### Existing riffrec events

The payload of a `click`, `network_request`, `console_error`, or `navigation`
envelope is the corresponding `events.json` event, unchanged, including its own
`t` and `type`. See `docs/requirements.md` for the full shapes; the tables below
list the fields the fixtures carry.

### `click`

| Field | Type | Required | Description |
|---|---|---|---|
| `t` | number | yes | Timestamp. |
| `type` | `"click"` | yes | Event type, repeated inside the payload. |
| `component` | string or null | yes | Nearest React component name. |
| `componentPath` | string[] or null | no | React component path from the root. |
| `element` | element info | yes | DOM context: `tag`, `text`, `id`, `selector`, and the optional production-safe fields. |

### `network_request`

| Field | Type | Required | Description |
|---|---|---|---|
| `t` | number | yes | Timestamp. |
| `type` | `"network_request"` | yes | Event type. |
| `url` | string | yes | Redacted URL. |
| `method` | string | yes | HTTP method. |
| `status` | number | yes | Response status, `0` on network failure. |
| `duration_ms` | number | yes | Request duration. |

### `console_error`

| Field | Type | Required | Description |
|---|---|---|---|
| `t` | number | yes | Timestamp. |
| `type` | `"console_error"` | yes | Event type. |
| `message` | string | yes | Sanitized message. |
| `stack` | string or null | yes | Stack trace when available. |
| `component` | string or null | yes | React component context when available. |

### `navigation`

| Field | Type | Required | Description |
|---|---|---|---|
| `t` | number | yes | Timestamp. |
| `type` | `"navigation"` | yes | Event type. |
| `from` | string | yes | Previous route. |
| `to` | string | yes | New route. |

### `transcript`

One transcript segment from either side of the conversation. A segment may be
sent more than once with the same `id` while `final` is `false`; the final
segment supersedes earlier ones.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Segment id, stable across partial and final sends. |
| `role` | one of `riffer`, `interviewer` | yes | Who spoke. |
| `text` | string | yes | Transcript text. |
| `t_start` | number | yes | Segment start. |
| `t_end` | number | yes | Segment end. |
| `final` | boolean | yes | Whether the segment will change again. |

### `unit`

One requested change, sent the moment the interviewer extracts it. Status
follows `initial` → `triaging` → `accepted` or `needs_info`, then `applied` or
`blocked` when the consumer acts, and `withdrawn` when the riffer retracts it.
Endpoint status updates arrive over SSE (`unit_status`) and overwrite by id.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable unit id. |
| `statement` | string | yes | Normalized one-sentence statement of the change. |
| `transcript_excerpt` | string | yes | The riffer's own words, verbatim. |
| `anchors` | anchor[] | yes | Elements pointed at, clicked, or drawn on; always present, may be empty. |
| `evidence` | evidence | yes | Attached evidence per the active profile. |
| `status` | unit status | yes | One of `initial`, `triaging`, `accepted`, `needs_info`, `applied`, `blocked`, `withdrawn`. |
| `confirmed` | confirmation | no | Present after the final confirmation pass. |

### `unit_update`

Refinement of a unit that is still `initial`. Anchors in `anchors_add` are
appended; `statement` replaces the statement.

| Field | Type | Required | Description |
|---|---|---|---|
| `unit_id` | string | yes | Unit being refined. |
| `statement` | string | no | Replacement statement. |
| `anchors_add` | anchor[] | no | Anchors to append. |
| `confirmed` | confirmation | no | Confirmation from the final pass. |

### `unit_withdraw`

The riffer retracted a unit. Before release the endpoint drops it from the held
batch; after release it is forwarded in the next batch with `status: "withdrawn"`.

| Field | Type | Required | Description |
|---|---|---|---|
| `unit_id` | string | yes | Unit being withdrawn. |
| `reason` | string | no | The riffer's reason, when given. |

### `annotation`

A completed stroke or pin, anchored to the element it landed on. When the
annotation belongs to a unit, `unit_id` is set; a composited frame (the view
with the stroke drawn on it) cross-references by `composite_frame_id`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Annotation id. |
| `kind` | one of `stroke`, `pin` | yes | Freehand stroke or placed pin. |
| `points` | point[] | yes | Stroke points; a pin carries one point. |
| `bbox` | rect | yes | Bounding box of the points. |
| `anchor` | anchor | yes | Element the annotation landed on. |
| `text` | string | no | Typed or spoken note for a pin. |
| `unit_id` | string | no | Unit the annotation attaches to. |
| `composite_frame_id` | string | no | Id of the composited `frame` for this annotation. |

### `checkpoint`

Marks the point up to which held units are released to the consumer. The page
emits `silence`, `page_change`, `send`, and `final` (the overlay's Done control,
after the confirmation pass and before `/session/end`). The endpoint itself
produces `answer` checkpoints (when an `answer` event arrives) and `mode_change`
checkpoints (when a `mode` event leaves Collect, KTD12); those two appear only as
wake-batch kinds, never on the wire from the page. A `silence`, `page_change`,
or `send` checkpoint that releases nothing does not wake the agent; an `answer`,
`mode_change`, or `final` checkpoint always wakes it, carrying the answers and
the accepted-but-unapplied backlog even when the held queue is empty (KTD9).

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Checkpoint id, echoed as `checkpoint_id` in the wake batch. |
| `trigger` | one of `silence`, `page_change`, `send`, `answer`, `mode_change`, `final` | yes | What produced the checkpoint. The page sends only `silence`, `page_change`, `send`, `final`. |
| `mode` | one of `instant`, `smart`, `collect` | yes | Execution mode at emission. |

### `answer`

The riffer answered a question the agent asked about a unit (relayed by the
interviewer or typed on the board). The endpoint emits an `answer` checkpoint
carrying `answers[]` only.

| Field | Type | Required | Description |
|---|---|---|---|
| `unit_id` | string | yes | Unit the question was attached to. |
| `text` | string | yes | The riffer's answer. |

### `frame`

A JPEG screenshot. Posted alone in its own `POST /events` body, which may be up
to 2 MB. Frames include the overlay's own docked panel region.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Frame id, referenced from `evidence.frame_ids` and `composite_frame_id`. |
| `t` | number | yes | Capture timestamp. |
| `route` | string | yes | Route at capture time. |
| `kind` | one of `gesture`, `periodic`, `composite` | yes | Why the frame was captured. |
| `jpeg_base64` | string | yes | Base64 JPEG bytes without a data-URL prefix. Empty when `dropped` is set. |
| `dropped` | one of `quota`, `oversize` | no | Present when the page discarded the bytes but kept the frame's `seq` so numbering stays contiguous: `quota` when the buffering queue evicted it, `oversize` after a `413`. Consumers keep the id and metadata and treat the frame as absent. |

### `mic`

Microphone state changes, so the endpoint and the indicator agree.

| Field | Type | Required | Description |
|---|---|---|---|
| `state` | one of `granted`, `denied`, `muted`, `unmuted` | yes | New microphone state. |

### `mode`

The riffer switched execution mode. The switch takes effect at the next
checkpoint; the endpoint stamps `mode_at_checkpoint` from the releasing
checkpoint's `mode`, or from the last seen `mode` event for endpoint-emitted
checkpoints.

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | one of `instant`, `smart`, `collect` | yes | New execution mode. Default is `smart`. |

### `stream_state`

Page-side delivery state. `unloading` is sent on `pagehide` with
`fetch(..., { keepalive: true })` so an ordinary reload classifies without
waiting for the page-lost grace window.

| Field | Type | Required | Description |
|---|---|---|---|
| `state` | one of `streaming`, `buffering`, `unloading` | yes | Delivery state. |

## I2 — Mint contract

`POST /mint` with the page credentials and the body below. The endpoint owns the
tool definitions (a verbatim copy of `LIVE_TOOLS`) and persona, appends the
session brief after scanning it for secret shapes, adds semantic turn detection
and input transcription, calls OpenAI's client-secret endpoint with the key from
its own environment, and returns the response below. Riffrec never sees the key
and accepts none in configuration. The page re-mints on every reconnect.

**Reconciliation after connect.** The page answers the tool calls and attaches
the screenshots, so once the data channel opens it reads the session the
endpoint minted (`session.created`) and sends one `session.update` only when
something it must be able to answer is missing:

- tools in `LIVE_TOOLS` the mint did not carry are appended; tools the endpoint
  did define are kept verbatim, in the endpoint's order (the endpoint's copies
  win, so it may refine descriptions);
- a persona that lacks the `[SCREEN CONTEXT]` section (`SCREEN_CONTEXT_MARKER`)
  gets `SCREEN_CONTEXT_SECTION` appended;
- a session with no riffrec tool at all gets `DEFAULT_INTERVIEWER_INSTRUCTIONS`
  and all of `LIVE_TOOLS`.

An endpoint that copies `DEFAULT_INTERVIEWER_INSTRUCTIONS` (which contains the
section) and `LIVE_TOOLS` verbatim is never patched. An endpoint persona must not
tell the interviewer it cannot see the screen: the page contradicts that with
notes and frames, and the appended section says it supersedes such statements.

### `mint_request`

| Field | Type | Required | Description |
|---|---|---|---|
| `session_id` | string | yes | The page's session id. |

### `mint_response`

| Field | Type | Required | Description |
|---|---|---|---|
| `client_secret` | string | yes | Ephemeral Realtime client secret. Never persisted or logged by the endpoint. |
| `expires_at` | number | yes | Unix epoch seconds when the secret expires. |
| `model` | string | yes | Realtime model the secret was minted for. |

Errors: `401` bad page token; `403 { "reason": "tls_required" }` when the peer is
non-loopback and the request lacks `X-Forwarded-Proto: https`;
`429 { "retry_after": <seconds> }` beyond one in flight or five per minute per
session; `502 { "reason": "openai_error", "upstream_status": <n> }` on upstream
rejection or timeout (upstream body discarded);
`503 { "reason": "no_key" | "brief_contains_secret" }`.

## I3 — Endpoint HTTP surface

Two credentials: the **page token** (given to the page in the URL fragment,
sent as `Authorization: Bearer <page token>`) and the **agent token** (in the
endpoint's state file, never printed). No route answers without a credential. A
page token on an agent route, or an agent token on a page route, returns `403`.
Agent routes return `403` to any request carrying an `Origin` header.

Every page request also carries `X-Riffrec-Session: <session_id>`. The endpoint
binds each page token to the first `session_id` it sees and answers any other id
with `409 { "active_session_id": "<bound id>" }`.

### Page routes

| Route | Body | Response |
|---|---|---|
| `POST /events` | JSON array of envelopes | `200 { "acked_seq": <n> }`. Body cap 64 KB (`LIVE_EVENTS_BODY_MAX_BYTES`), or 2 MB for a body holding a lone `frame` envelope (`LIVE_FRAME_BODY_MAX_BYTES`); oversize returns `413 { "max_bytes": <cap> }` and does not count toward buffering. Any envelope with an unsupported `schema_version` returns `409 { "expected_schema_version": "live/1" }`; any other invalid envelope returns `400 { "reason": <LiveEnvelopeRejection>, "seq": <n> }`. |
| `GET /stream` | — | `text/event-stream`. Event names: `unit_status`, `applied`, `ask`, `ack`, `session_ended` (data shapes below). Consumed with a fetch-based reader so the bearer header travels with it; never `EventSource`. |
| `POST /mint` | `mint_request` | `mint_response` or an I2 error. |
| `POST /session/end` | full-evidence archive | `200 {}`; the session is ended and `session_ended` is broadcast. A `2xx` here (or a `session_ended` event) is the page's signal that the stream was the delivery: it assembles its archive for the host's `onSessionComplete` but does not download the zip unless the host opted in. Any other outcome makes the page fall back to the zip and report the reason. |

Page routes answer `OPTIONS` with `Access-Control-Allow-Origin` equal to the
exact configured app origin, `Access-Control-Allow-Headers: Authorization, Content-Type, X-Riffrec-Session`,
`Access-Control-Allow-Methods: GET, POST`, `Vary: Origin`, and no credentials flag.
Per-session disk cap is 500 MB; beyond it frames are refused with a
`stream_state` reason.

### SSE events (endpoint → page)

| Event | Data | Meaning |
|---|---|---|
| `unit_status` | `{ unit_id, status, note?, guess? }` | Status overwrite by id. `triaging` is broadcast for every unit released by a checkpoint and is the page's release marker. |
| `applied` | `{ checkpoint_id, unit_ids[] }` | The agent applied a batch; arms the page-lost grace window. |
| `ask` | `{ unit_id, question }` | A question for the interviewer to voice at the next pause. |
| `ack` | `{ acked_seq }` | Highest contiguous `seq` acknowledged. |
| `session_ended` | `{ reason? }` | The session is over; the page clears its state. |

### Agent routes

| Route | Body | Response |
|---|---|---|
| `GET /wait` | — | Blocks until a batch is available, then the `wake_batch` below. `409 { "status": "wait-taken" }` when another process holds the wait. |
| `POST /checkpoints/:id/ack` | — | `200 {}`. A batch served without an ack is re-served before any new batch. |
| `POST /units/:id/status` | `{ status, note?, guess? }` | `200 {}`; broadcast to the page as `unit_status`. |
| `POST /units/:id/ask` | `{ question }` | `200 {}`; broadcast to the page as `ask`; the unit becomes `needs_info`. |
| `GET /status` | — | Board summary: `{ session_id, ended, mode, acked_seq, mic, stream_state, units[], held_unit_ids[], pending_batch_ids[] }`. |

## I4 — Wake envelope and CLI

`wait --root <dir>` prints one `wake_batch` JSON envelope and exits `0` whenever a
batch is available. Exit `1`: the session ended via `/session/end` with nothing
held. Exit `2`: error. Exit `3` (`{ "status": "wait-taken" }`): another process
holds the wake; the caller must not stop the endpoint. A `page_lost` envelope is
returned once per lost episode. The agent acknowledges a batch with
`POST /checkpoints/:id/ack` immediately after parsing it.

### `wake_batch`

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | `"live/1"` | yes | Contract version. |
| `checkpoint_id` | string | yes | Id of the releasing checkpoint. |
| `kind` | one of `silence`, `page_change`, `send`, `answer`, `mode_change`, `final` | yes | What produced the checkpoint. `answer`, `mode_change`, and `final` batches are served even when no unit was newly held. |
| `mode_at_checkpoint` | one of `instant`, `smart`, `collect` | yes | Execution mode stamped at release. |
| `session_status` | one of `live`, `page_lost` | yes | Whether the page is still connected. |
| `units` | unit[] | yes | Released units (status `triaging`), plus post-release withdrawals as `withdrawn`. `mode_change` and `final` batches also carry the accepted-but-unapplied backlog (units the agent reported `accepted` with no `applied`/`blocked` since), which is how Collect applies at done (KTD12). |
| `annotations` | annotation[] | yes | Annotations released with this batch. |
| `answers` | answer[] | yes | Answers since the last batch; the only member of an `answer` checkpoint. |

Other CLI verbs: `start --root <dir> --app-origin <origin> [--host] [--port] [--owner-pid]`
prints `{ url, port, page_token }` once and writes `state/session.json` (0600);
`status` prints the board summary; `stop` invalidates both tokens; `replay --root <dir> --profile <name> --to <endpoint>`
re-emits a stored session under another evidence profile.

## Interviewer tools

The interviewer's tool set is exactly five flat function tools, exported as
`LIVE_TOOLS` from `src/live/tools.ts` and copied verbatim into the endpoint's
mint body: `record_unit(statement, anchors[], transcript_excerpt)`,
`update_unit(unit_id, statement?, anchors_add?)` (rejected once a unit has left
`initial`), `withdraw_unit(unit_id, reason?)`, `relay_answer(unit_id, answer_text)`,
and `look_at_screen(reason?)`. No tool emits checkpoints or reports state, and
no tool *parameter* carries image content. Tool `anchors` are text references
(an anchor id the page announced, or the riffer's words) which the page resolves
to `anchor` objects.

### `look_at_screen`

```json
{
  "type": "function",
  "name": "look_at_screen",
  "description": "See the riffer's screen right now. …",
  "parameters": {
    "type": "object",
    "properties": { "reason": { "type": "string", "description": "Why you need to see the screen, in a few words." } },
    "required": [],
    "additionalProperties": false
  }
}
```

When the model calls it, the page grabs the current view (or takes the latest
buffered frame), sends a `conversation.item.create` with a `user` message whose
content is `[{ type: "input_image", image_url: "data:image/jpeg;base64,…" }, { type: "input_text", text: "<caption>" }]`,
then the `function_call_output`, then `response.create` (deferred until the
calling response's `response.done` when one is active). Result shapes:

| Result | Meaning |
|---|---|
| `{ ok: true, frame_id, route, age_ms, fresh }` | The screenshot precedes this result in the conversation. `fresh` is false when the latest buffered frame stood in. |
| `{ ok: false, reason: "no_frame", detail }` | The screen is not shared or capture is paused. |
| `{ ok: false, reason: "frames_disabled", detail }` | The evidence profile is `frames: "none"`; nothing visual leaves the page. |
| `{ ok: false, reason: "send_failed", detail }` | The image item could not be sent. |

The frame is buffered like a gesture frame (the next unit attaches to it) and
released to the endpoint as a `frame` envelope even under `frames: "one"`.

### Page → interviewer announcements

Page-side facts reach the interviewer as `system`-role `input_text` items
(`conversation.item.create`), never as tool calls, and are held while a response
is active. Endpoint personas and tests should key on these shapes:

| Shape | When |
|---|---|
| `[PAGE] The riffer clicked <description> (anchor id: anchor_NNNN).` | Every click on the host page. `<description>` is `<accessible name or tag>[ with text "<visible text, ≤80 chars>"][ in component <Component>] (selector <css>, route </path>)`. Repeated clicks on the same selector inside 1 s refresh the anchor but send no second note. Clicks on riffrec's own panel are not announced. |
| `[PAGE] The riffer drew on <description> (anchor id: anchor_NNNN).` | A completed stroke. |
| `[PAGE] The riffer pinned <description> (anchor id: anchor_NNNN).` | A pin. |
| `[PAGE] Screenshot of the riffer's current view on </path>, <attached because they just clicked there \| attached because they just drew there \| attached because they referred to something on screen \| captured just now \| captured N s ago> (frame id: frame_NNNN). The riffrec panel docked at the top right is not part of the app.` | The caption of an image item: proactive (first three) or `look_at_screen` (last two). Proactive frames are rate-limited to one per 5 s, a `look_at_screen` counts against the same limit, and speech triggers only when the transcript contains a deictic or visual word (`isVisualReference`). |
| `[PAGE] The riffer muted their microphone; expect silence.` / `… unmuted their microphone.` | Mute toggles. |
| `[PAGE] The page lost its connection to the coding agent and is buffering; units still land on the board.` / `… reconnected …` | Stream state changes. |
| `[ENDPOINT QUESTION] The coding agent asks about unit <id>: "<question>" …` | An `ask` from the endpoint, voiced at the next pause. |
| `[RECONNECT] Your connection was replaced mid-session. …` | The re-seed on a replacement connection. |

Anchor ids are `anchor_NNNN`, minted per connection in announcement order; the
most recent one is what "this", "here", and "that" resolve to when a
`record_unit` reference matches nothing else within 8 s.
