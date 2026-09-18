"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } async function _asyncNullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return await rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }










var _chunkDQNE5VTNcjs = require('./chunk-DQNE5VTN.cjs');













var _chunk4XWUXLDEcjs = require('./chunk-4XWUXLDE.cjs');

// src/live/LiveOverlay.tsx
var _react = require('react');

// src/output/segmentStores.ts
var DB_NAME = "riffrec-recording-segments";
var DB_VERSION = 1;
var SEGMENTS_STORE = "segments";
var CHUNKS_STORE = "chunks";
function segmentKey(sessionId, segment) {
  return `${sessionId}/${String(segment).padStart(4, "0")}`;
}
function chunkKey(sessionId, segment, index) {
  return `${segmentKey(sessionId, segment)}/${String(index).padStart(8, "0")}`;
}
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(_nullishCoalesce(request.error, () => ( new Error("IndexedDB request failed."))));
  });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(_nullishCoalesce(transaction.error, () => ( new Error("IndexedDB transaction failed."))));
    transaction.onabort = () => reject(_nullishCoalesce(transaction.error, () => ( new Error("IndexedDB transaction aborted."))));
  });
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEGMENTS_STORE)) db.createObjectStore(SEGMENTS_STORE);
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) db.createObjectStore(CHUNKS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(_nullishCoalesce(request.error, () => ( new Error("Failed to open riffrec recording segment store."))));
  });
}
function isSegmentMeta(value) {
  return typeof value === "object" && value !== null && typeof value.segment === "number" && typeof value.mimeType === "string";
}
var IndexedDbSegmentStore = class {
  constructor() {
    this.db = null;
  }
  open() {
    if (!this.db) this.db = openDb();
    return this.db;
  }
  async openSegment(sessionId, mimeType) {
    const existing = await this.listSegments(sessionId);
    const segment = existing.reduce((max, meta2) => Math.max(max, meta2.segment), 0) + 1;
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, "readwrite");
    const meta = { sessionId, segment, mimeType, closed: false, chunkCount: 0 };
    transaction.objectStore(SEGMENTS_STORE).put(meta, segmentKey(sessionId, segment));
    await transactionDone(transaction);
    return segment;
  }
  async appendChunk(sessionId, segment, index, chunk) {
    const db = await this.open();
    const transaction = db.transaction([CHUNKS_STORE, SEGMENTS_STORE], "readwrite");
    transaction.objectStore(CHUNKS_STORE).put(chunk, chunkKey(sessionId, segment, index));
    const segments = transaction.objectStore(SEGMENTS_STORE);
    const key = segmentKey(sessionId, segment);
    const current = await requestToPromise(segments.get(key));
    if (isSegmentMeta(current)) {
      segments.put({ ...current, chunkCount: Math.max(current.chunkCount, index + 1) }, key);
    }
    await transactionDone(transaction);
  }
  async closeSegment(sessionId, segment) {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, "readwrite");
    const segments = transaction.objectStore(SEGMENTS_STORE);
    const key = segmentKey(sessionId, segment);
    const current = await requestToPromise(segments.get(key));
    if (isSegmentMeta(current)) segments.put({ ...current, closed: true }, key);
    await transactionDone(transaction);
  }
  async listSegments(sessionId) {
    const db = await this.open();
    const store = db.transaction(SEGMENTS_STORE, "readonly").objectStore(SEGMENTS_STORE);
    const values = await requestToPromise(store.getAll(sessionRange(sessionId)));
    return values.filter(isSegmentMeta).sort((a, b) => a.segment - b.segment);
  }
  async readSegment(sessionId, segment) {
    const db = await this.open();
    const chunks = db.transaction(CHUNKS_STORE, "readonly").objectStore(CHUNKS_STORE);
    const prefix = `${segmentKey(sessionId, segment)}/`;
    const values = await requestToPromise(chunks.getAll(IDBKeyRange.bound(prefix, `${prefix}\uFFFF`)));
    const blobs = values.filter((value) => value instanceof Blob && value.size > 0);
    if (blobs.length === 0) return null;
    const metas = await this.listSegments(sessionId);
    const mimeType = _nullishCoalesce(_optionalChain([metas, 'access', _ => _.find, 'call', _2 => _2((meta) => meta.segment === segment), 'optionalAccess', _3 => _3.mimeType]), () => ( blobs[0].type));
    return new Blob(blobs, { type: mimeType });
  }
  async clear(sessionId) {
    const db = await this.open();
    const transaction = db.transaction([CHUNKS_STORE, SEGMENTS_STORE], "readwrite");
    transaction.objectStore(CHUNKS_STORE).delete(sessionRange(sessionId));
    transaction.objectStore(SEGMENTS_STORE).delete(sessionRange(sessionId));
    await transactionDone(transaction);
  }
};
function sessionRange(sessionId) {
  const prefix = `${sessionId}/`;
  return IDBKeyRange.bound(prefix, `${prefix}\uFFFF`);
}
var MemorySegmentStore = class {
  constructor() {
    this.segments = /* @__PURE__ */ new Map();
    this.chunks = /* @__PURE__ */ new Map();
  }
  async openSegment(sessionId, mimeType) {
    const existing = await this.listSegments(sessionId);
    const segment = existing.reduce((max, meta) => Math.max(max, meta.segment), 0) + 1;
    this.segments.set(segmentKey(sessionId, segment), { sessionId, segment, mimeType, closed: false, chunkCount: 0 });
    return segment;
  }
  async appendChunk(sessionId, segment, index, chunk) {
    this.chunks.set(chunkKey(sessionId, segment, index), chunk);
    const key = segmentKey(sessionId, segment);
    const meta = this.segments.get(key);
    if (meta) meta.chunkCount = Math.max(meta.chunkCount, index + 1);
  }
  async closeSegment(sessionId, segment) {
    const meta = this.segments.get(segmentKey(sessionId, segment));
    if (meta) meta.closed = true;
  }
  async listSegments(sessionId) {
    return [...this.segments.values()].filter((meta) => meta.sessionId === sessionId).map((meta) => ({ ...meta })).sort((a, b) => a.segment - b.segment);
  }
  async readSegment(sessionId, segment) {
    const prefix = `${segmentKey(sessionId, segment)}/`;
    const blobs = [...this.chunks.entries()].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, blob]) => blob).filter((blob) => blob.size > 0);
    if (blobs.length === 0) return null;
    const mimeType = _nullishCoalesce(_optionalChain([this, 'access', _4 => _4.segments, 'access', _5 => _5.get, 'call', _6 => _6(segmentKey(sessionId, segment)), 'optionalAccess', _7 => _7.mimeType]), () => ( blobs[0].type));
    return new Blob(blobs, { type: mimeType });
  }
  async clear(sessionId) {
    const prefix = `${sessionId}/`;
    for (const key of [...this.chunks.keys()]) if (key.startsWith(prefix)) this.chunks.delete(key);
    for (const key of [...this.segments.keys()]) if (key.startsWith(prefix)) this.segments.delete(key);
  }
};
function createDefaultSegmentStore() {
  return typeof indexedDB !== "undefined" ? new IndexedDbSegmentStore() : new MemorySegmentStore();
}

// src/live/evidence/attach.ts
var ATTACH_LOOKBACK_MS = 4e3;
var DRAWING_ONLY_AFTER_SPEECH_MS = 4e3;
var AnnotationAttacher = class {
  constructor(options) {
    this.speaking = false;
    /** Increments on every `speech_started`; held strokes remember theirs. */
    this.utterance = 0;
    /** True from `speech_started` until `record_unit` claims or the grace timer fires. */
    this.utteranceOpen = false;
    this.graceTimer = null;
    this.held = [];
    this.lastUnit = null;
    this.disposed = false;
    this.now = options.now;
    this.onHeldExpired = options.onHeldExpired;
    this.lookbackMs = _nullishCoalesce(options.lookbackMs, () => ( ATTACH_LOOKBACK_MS));
    this.drawingOnlyMs = _nullishCoalesce(options.drawingOnlyMs, () => ( DRAWING_ONLY_AFTER_SPEECH_MS));
    this.setTimer = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.clearTimer = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
  }
  get isSpeaking() {
    return this.speaking;
  }
  get isUtteranceOpen() {
    return this.utteranceOpen;
  }
  get lastUnitId() {
    return _nullishCoalesce(_optionalChain([this, 'access', _8 => _8.lastUnit, 'optionalAccess', _9 => _9.id]), () => ( null));
  }
  heldAnnotations() {
    return this.held.map((entry) => entry.annotation);
  }
  speechStarted() {
    if (this.disposed) return;
    this.speaking = true;
    this.utterance += 1;
    this.utteranceOpen = true;
    this.clearGrace();
  }
  speechStopped() {
    if (this.disposed || !this.speaking) return;
    this.speaking = false;
    this.clearGrace();
    this.graceTimer = this.setTimer(() => {
      this.graceTimer = null;
      this.utteranceOpen = false;
      this.releaseHeld();
    }, this.drawingOnlyMs);
  }
  /** Decides where a completed stroke or pin belongs; holds it when the riffer is mid-utterance. */
  annotationCompleted(annotation) {
    if (this.disposed) return { kind: "drawing_only" };
    if (this.utteranceOpen) {
      this.held.push({ annotation, utterance: this.utterance });
      return { kind: "held" };
    }
    if (this.lastUnit && this.now() - this.lastUnit.t <= this.lookbackMs) {
      return { kind: "attached", unitId: this.lastUnit.id };
    }
    return { kind: "drawing_only" };
  }
  /**
   * A unit is being opened — `record_unit` arrived, or a drawing-only unit is
   * created. `create` receives the held annotations the unit claims (so they
   * ride in its `annotation_ids`) and returns the unit id, which then becomes
   * the look-back target.
   */
  unitExtracted(create) {
    const claimed = this.takeClaimable();
    const unitId = create(claimed.map((entry) => entry.annotation));
    this.lastUnit = { id: unitId, t: this.now() };
    if (!this.speaking) {
      this.utteranceOpen = false;
      this.clearGrace();
    }
    return unitId;
  }
  dispose() {
    this.disposed = true;
    this.clearGrace();
    this.held = [];
  }
  /**
   * Everything held from utterances that have ended. While a new utterance is
   * already in progress, its own strokes stay held for its `record_unit`.
   */
  takeClaimable() {
    if (!this.speaking) {
      const all = this.held;
      this.held = [];
      return all;
    }
    const claimable = this.held.filter((entry) => entry.utterance < this.utterance);
    this.held = this.held.filter((entry) => entry.utterance >= this.utterance);
    return claimable;
  }
  releaseHeld() {
    const released = this.held;
    this.held = [];
    for (const entry of released) {
      const unitId = this.onHeldExpired(entry.annotation);
      if (unitId) this.lastUnit = { id: unitId, t: this.now() };
    }
  }
  clearGrace() {
    if (this.graceTimer === null) return;
    this.clearTimer(this.graceTimer);
    this.graceTimer = null;
  }
};

// src/live/evidence/audioClip.ts
var CLIP_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
function chooseClipMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  return _nullishCoalesce(CLIP_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)), () => ( "audio/webm"));
}
function defaultRecorderFactory(stream, mimeType) {
  return new MediaRecorder(stream, { mimeType });
}
function clipFileName(clip) {
  const extension = clip.mimeType.startsWith("audio/ogg") ? "ogg" : "webm";
  return `${clip.id}.${extension}`;
}
var AudioClipRecorder = class {
  constructor(options) {
    this.clips = [];
    this.active = null;
    /** Finished utterances' clips that no unit has taken yet, oldest first. */
    this.unclaimed = [];
    this.now = options.now;
    this.createId = options.createId;
    this.createRecorder = _nullishCoalesce(options.createRecorder, () => ( defaultRecorderFactory));
    this.mimeType = _nullishCoalesce(options.mimeType, () => ( chooseClipMimeType()));
    this.onClip = _nullishCoalesce(options.onClip, () => ( (() => {
    })));
    this.onError = _nullishCoalesce(options.onError, () => ( (() => {
    })));
    this.stream = _nullishCoalesce(options.stream, () => ( null));
  }
  get hasSource() {
    return this.stream !== null;
  }
  get isRecording() {
    return this.active !== null;
  }
  /** KTD21: the microphone clone; null when the mic was denied or the clone was stopped. */
  setStream(stream) {
    if (this.active) this.finishActive();
    this.stream = stream;
  }
  speechStarted() {
    if (!this.stream) return null;
    if (this.active) this.finishActive();
    const clip = { id: this.createId(), t_start: this.now(), t_end: null, blob: null, mimeType: this.mimeType };
    let recorder;
    try {
      recorder = this.createRecorder(this.stream, this.mimeType);
    } catch (error) {
      this.onError(error);
      return null;
    }
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => this.settle(clip, chunks, recorder);
    recorder.onerror = (event) => {
      this.onError(event);
      this.settle(clip, chunks, recorder);
    };
    try {
      recorder.start();
    } catch (error) {
      this.onError(error);
      return null;
    }
    this.active = { clip, recorder, chunks };
    this.clips.push(clip);
    return clip;
  }
  /** Stops the utterance's recorder; the clip is claimable immediately, its bytes follow. */
  speechStopped() {
    if (!this.active) return null;
    const { clip } = this.active;
    this.finishActive();
    return clip;
  }
  /** The id of the clip a `record_unit` arriving now would take; null when none is pending. */
  pendingClipId() {
    return _nullishCoalesce(_optionalChain([(_nullishCoalesce(_nullishCoalesce(this.unclaimed[0], () => ( _optionalChain([this, 'access', _10 => _10.active, 'optionalAccess', _11 => _11.clip]))), () => ( null))), 'optionalAccess', _12 => _12.id]), () => ( null));
  }
  /** The clip for the utterance `record_unit` came from; null when none is pending. */
  claim(unitId) {
    const clip = _nullishCoalesce(_nullishCoalesce(this.unclaimed.shift(), () => ( _optionalChain([this, 'access', _13 => _13.active, 'optionalAccess', _14 => _14.clip]))), () => ( null));
    if (!clip) return null;
    clip.unit_id = unitId;
    return clip.id;
  }
  all() {
    return [...this.clips];
  }
  /** `clips/<id>.<ext>` for the archive (I6); clips without bytes yet are skipped. */
  archiveFiles() {
    const files = {};
    for (const clip of this.clips) {
      if (clip.blob) files[clipFileName(clip)] = clip.blob;
    }
    return files;
  }
  dispose() {
    if (this.active) this.finishActive();
    this.stream = null;
  }
  finishActive() {
    if (!this.active) return;
    const { clip, recorder } = this.active;
    this.active = null;
    clip.t_end = this.now();
    if (!clip.unit_id) this.unclaimed.push(clip);
    try {
      if (recorder.state === "inactive") _optionalChain([recorder, 'access', _15 => _15.onstop, 'optionalCall', _16 => _16(void 0)]);
      else recorder.stop();
    } catch (error) {
      this.onError(error);
    }
  }
  settle(clip, chunks, recorder) {
    if (clip.blob) return;
    if (clip.t_end === null) clip.t_end = this.now();
    if (chunks.length === 0) return;
    clip.blob = new Blob(chunks, { type: recorder.mimeType || this.mimeType });
    this.onClip(clip);
  }
};

// src/live/overlay/DrawingLayer.tsx

var _perfectfreehand = require('perfect-freehand');

// src/live/overlay/Pin.tsx


// src/live/overlay/strokeAnchor.ts
var OVERLAY_ATTRIBUTE = "data-riffrec-overlay";
var OVERLAY_SELECTOR = `[${OVERLAY_ATTRIBUTE}]`;
var CONTAINMENT_SLACK = 4;
function computeBbox(points) {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
function intersectionArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}
function rectContains(outer, inner, slack = 0) {
  return inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;
}
function elementRect(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
function rectArea(rect) {
  return rect.width * rect.height;
}
function isDocumentChrome(element) {
  const tag = element.tagName.toLowerCase();
  return tag === "html" || tag === "body";
}
function isOverlayNode(element) {
  return element.closest(OVERLAY_SELECTOR) !== null;
}
function isEligible(element, options) {
  if (isDocumentChrome(element) || isOverlayNode(element)) return false;
  return options.ignore ? !options.ignore(element) : true;
}
function elementsUnderPoint(point, doc, options) {
  const view = doc.defaultView;
  if (view && (point.x < 0 || point.y < 0 || point.x > view.innerWidth || point.y > view.innerHeight)) {
    return [];
  }
  if (typeof doc.elementsFromPoint === "function") {
    return doc.elementsFromPoint(point.x, point.y).filter((element) => isEligible(element, options));
  }
  if (typeof doc.elementFromPoint === "function") {
    const element = doc.elementFromPoint(point.x, point.y);
    return element && isEligible(element, options) ? [element] : [];
  }
  return [];
}
function widenToEnclosedAncestor(element, bbox, options) {
  let current = element;
  let parent = current.parentElement;
  while (parent && isEligible(parent, options) && rectContains(bbox, elementRect(parent), CONTAINMENT_SLACK)) {
    current = parent;
    parent = current.parentElement;
  }
  return current;
}
function depthOf(element) {
  let depth = 0;
  let current = element;
  while (current) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}
function largestOverlapTarget(bbox, doc, options) {
  let bestPartial = null;
  let bestContainer = null;
  for (const element of Array.from(_nullishCoalesce(_optionalChain([doc, 'access', _17 => _17.body, 'optionalAccess', _18 => _18.querySelectorAll, 'call', _19 => _19("*")]), () => ( [])))) {
    if (!isEligible(element, options)) continue;
    const rect = elementRect(element);
    if (rectArea(rect) <= 0) continue;
    const overlap = intersectionArea(bbox, rect);
    if (overlap <= 0) continue;
    const depth = depthOf(element);
    if (rectContains(rect, bbox) && rectArea(rect) > rectArea(bbox)) {
      if (!bestContainer || rectArea(rect) < bestContainer.area || rectArea(rect) === bestContainer.area && depth > bestContainer.depth) {
        bestContainer = { element, area: rectArea(rect), depth };
      }
      continue;
    }
    if (!bestPartial || overlap > bestPartial.area || overlap === bestPartial.area && depth > bestPartial.depth) {
      bestPartial = { element, area: overlap, depth };
    }
  }
  return _nullishCoalesce(_nullishCoalesce(_optionalChain([bestPartial, 'optionalAccess', _20 => _20.element]), () => ( _optionalChain([bestContainer, 'optionalAccess', _21 => _21.element]))), () => ( null));
}
function resolveStrokeTarget(points, options = {}) {
  const doc = _nullishCoalesce(options.document, () => ( (typeof document !== "undefined" ? document : null)));
  if (!doc || points.length === 0) return null;
  const bbox = computeBbox(points);
  const [underCentroid] = elementsUnderPoint(rectCenter(bbox), doc, options);
  if (underCentroid) {
    return widenToEnclosedAncestor(underCentroid, bbox, options);
  }
  return largestOverlapTarget(bbox, doc, options);
}
function resolvePointTarget(point, options = {}) {
  const doc = _nullishCoalesce(options.document, () => ( (typeof document !== "undefined" ? document : null)));
  if (!doc) return null;
  return _nullishCoalesce(elementsUnderPoint(point, doc, options)[0], () => ( null));
}
function buildAnchor(element, options) {
  return {
    route: options.route,
    selector: _chunkDQNE5VTNcjs.buildSelector.call(void 0, element),
    component: _chunkDQNE5VTNcjs.getComponentName.call(void 0, element),
    rect: elementRect(element),
    t: options.t
  };
}
function buildFallbackAnchor(bbox, options) {
  return {
    route: options.route,
    selector: "body",
    component: null,
    rect: bbox,
    t: options.t
  };
}
function anchorStroke(points, options) {
  const target = resolveStrokeTarget(points, options);
  return target ? buildAnchor(target, options) : buildFallbackAnchor(computeBbox(points), options);
}

// src/live/overlay/Pin.tsx
var _jsxruntime = require('react/jsx-runtime');
var SNIPPET_LIMIT = 80;
var PIN_RADIUS = 11;
function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 1)}\u2026` : value;
}
function normalizeText(value) {
  const text = _optionalChain([value, 'optionalAccess', _22 => _22.replace, 'call', _23 => _23(/\s+/g, " "), 'access', _24 => _24.trim, 'call', _25 => _25()]);
  return text ? text : null;
}
function isFormControl(element) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}
function textWithoutControls(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll("input, textarea, select").forEach((control) => control.remove());
  return normalizeText(copy.textContent);
}
function labelledByText(element) {
  const ids = element.getAttribute("aria-labelledby");
  if (!ids) return null;
  const doc = element.ownerDocument;
  const parts = ids.split(/\s+/).map((id) => {
    const labelled = doc.getElementById(id);
    return labelled ? textWithoutControls(labelled) : null;
  }).filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}
function labelText(element) {
  if (!isFormControl(element)) return null;
  const labels = Array.from(_nullishCoalesce(element.labels, () => ( [])));
  const wrapping = element.closest("label");
  if (wrapping && !labels.includes(wrapping)) labels.push(wrapping);
  for (const label of labels) {
    const text = textWithoutControls(label);
    if (text) return text;
  }
  return null;
}
function getAccessibleName(element) {
  const ariaLabel = normalizeText(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  const labelledBy = labelledByText(element);
  if (labelledBy) return labelledBy;
  if (isFormControl(element)) {
    return _nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(labelText(element), () => ( normalizeText(element.getAttribute("placeholder")))), () => ( normalizeText(element.getAttribute("title")))), () => ( normalizeText(element.getAttribute("name")))), () => ( null));
  }
  if (element instanceof HTMLImageElement) {
    return _nullishCoalesce(normalizeText(element.getAttribute("alt")), () => ( normalizeText(element.getAttribute("title"))));
  }
  return _nullishCoalesce(textWithoutControls(element), () => ( normalizeText(element.getAttribute("title"))));
}
var markerStyle = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  fontWeight: 600,
  userSelect: "none"
};
function Pin({ annotation, index }) {
  const point = _nullishCoalesce(annotation.points[0], () => ( { x: annotation.bbox.x, y: annotation.bbox.y }));
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
    "g",
    {
      "data-riffrec-pin": annotation.id,
      transform: `translate(${point.x} ${point.y})`,
      style: markerStyle,
      "aria-label": annotation.text ? `Pin ${index}: ${annotation.text}` : `Pin ${index}`,
      children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "title", { children: _nullishCoalesce(annotation.text, () => ( `Pin ${index}`)) }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "circle", { r: PIN_RADIUS, fill: "#d92d20", stroke: "#ffffff", strokeWidth: 2 }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "text", { textAnchor: "middle", dominantBaseline: "central", fill: "#ffffff", children: index })
      ]
    }
  );
}
var composerStyle = {
  position: "fixed",
  width: 280,
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 12px 40px rgba(16, 24, 40, 0.24)",
  padding: 12,
  display: "grid",
  gap: 8,
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  pointerEvents: "auto",
  cursor: "default"
};
var snippetStyle = {
  color: "#475467",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var textareaStyle = {
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  padding: 8,
  font: "inherit",
  boxSizing: "border-box"
};
var buttonRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8
};
var buttonStyle = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "6px 12px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};
var secondaryButtonStyle = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};
function composerPosition(point) {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : Infinity;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : Infinity;
  const left = Math.max(8, Math.min(point.x + 16, viewportWidth - 280 - 8));
  const top = Math.max(8, Math.min(point.y + 16, viewportHeight - 180));
  return { left, top };
}
function PinComposer({ point, target, initialValue = "", onSubmit, onCancel }) {
  const [value, setValue] = _react.useState.call(void 0, initialValue);
  const textareaRef = _react.useRef.call(void 0, null);
  const snippet = target ? getAccessibleName(target) : null;
  const selector = target ? _chunkDQNE5VTNcjs.buildSelector.call(void 0, target) : null;
  _react.useEffect.call(void 0, () => {
    _optionalChain([textareaRef, 'access', _26 => _26.current, 'optionalAccess', _27 => _27.focus, 'call', _28 => _28()]);
  }, []);
  const submit = (event) => {
    _optionalChain([event, 'optionalAccess', _29 => _29.preventDefault, 'call', _30 => _30()]);
    const comment = value.trim();
    if (comment.length === 0) return;
    onSubmit(comment);
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
    "form",
    {
      "data-riffrec-pin-composer": "",
      role: "dialog",
      "aria-label": "Pin note",
      style: { ...composerStyle, ...composerPosition(point) },
      onSubmit: submit,
      onPointerDown: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { style: snippetStyle, title: _nullishCoalesce(selector, () => ( void 0)), children: snippet ? truncate(snippet, SNIPPET_LIMIT) : _nullishCoalesce(selector, () => ( "This spot")) }),
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          "textarea",
          {
            ref: textareaRef,
            "aria-label": "Note",
            placeholder: "What should change here?",
            style: textareaStyle,
            value,
            onChange: (event) => setValue(event.target.value),
            onKeyDown
          }
        ),
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: buttonRowStyle, children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", style: secondaryButtonStyle, onClick: onCancel, children: "Cancel" }),
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "submit", style: buttonStyle, disabled: value.trim().length === 0, children: "Save pin" })
        ] })
      ]
    }
  );
}

// src/live/overlay/shortcuts.ts
var DEFAULT_DRAW_SHORTCUT = "Alt+Shift+D";
var MODIFIER_TOKENS = /* @__PURE__ */ new Set(["alt", "option", "ctrl", "control", "meta", "cmd", "command", "shift", "mod"]);
function parseShortcut(shortcut) {
  const parsed = { key: "", alt: false, ctrl: false, meta: false, shift: false, mod: false };
  for (const rawToken of shortcut.split("+")) {
    const token = rawToken.trim();
    if (token.length === 0) return null;
    const lower = token.toLowerCase();
    if (MODIFIER_TOKENS.has(lower)) {
      if (lower === "alt" || lower === "option") parsed.alt = true;
      else if (lower === "ctrl" || lower === "control") parsed.ctrl = true;
      else if (lower === "meta" || lower === "cmd" || lower === "command") parsed.meta = true;
      else if (lower === "shift") parsed.shift = true;
      else parsed.mod = true;
      continue;
    }
    if (parsed.key.length > 0) return null;
    parsed.key = lower;
  }
  return parsed.key.length > 0 ? parsed : null;
}
function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(_nullishCoalesce(navigator.platform, () => ( ""))) || /Mac OS/i.test(_nullishCoalesce(navigator.userAgent, () => ( "")));
}
function keyMatches(event, key) {
  if (typeof event.key === "string" && event.key.toLowerCase() === key) return true;
  const code = typeof event.code === "string" ? event.code.toLowerCase() : "";
  if (key.length === 1 && /[a-z]/.test(key)) return code === `key${key}`;
  if (key.length === 1 && /[0-9]/.test(key)) return code === `digit${key}`;
  return code === key;
}
function matchesShortcut(event, shortcut) {
  const apple = isApplePlatform();
  const wantMeta = shortcut.meta || shortcut.mod && apple;
  const wantCtrl = shortcut.ctrl || shortcut.mod && !apple;
  return event.altKey === shortcut.alt && event.shiftKey === shortcut.shift && event.metaKey === wantMeta && event.ctrlKey === wantCtrl && keyMatches(event, shortcut.key);
}
function hasModifier(shortcut) {
  return shortcut.alt || shortcut.ctrl || shortcut.meta || shortcut.mod;
}
function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
}
function createDrawToggle(options) {
  let active = _nullishCoalesce(options.initialActive, () => ( false));
  const shortcutString = options.shortcut === void 0 ? DEFAULT_DRAW_SHORTCUT : options.shortcut;
  const parsed = shortcutString ? parseShortcut(shortcutString) : null;
  const target = options.target === void 0 ? typeof window !== "undefined" ? window : null : options.target;
  const setActive = (next) => {
    if (next === active) return;
    active = next;
    options.onChange(active);
  };
  const onKeyDown = (event) => {
    if (!parsed || !(event instanceof KeyboardEvent) || event.defaultPrevented || event.repeat) return;
    if (!hasModifier(parsed) && isEditableTarget(event.target)) return;
    if (!matchesShortcut(event, parsed)) return;
    event.preventDefault();
    setActive(!active);
  };
  if (parsed && target) {
    target.addEventListener("keydown", onKeyDown);
  }
  return {
    isActive: () => active,
    toggle: () => {
      setActive(!active);
      return active;
    },
    setActive,
    sync: (next) => {
      active = next;
    },
    dispose: () => {
      if (parsed && target) target.removeEventListener("keydown", onKeyDown);
    }
  };
}

// src/live/overlay/DrawingLayer.tsx

var STROKE_OPTIONS = {
  size: 6,
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.45,
  simulatePressure: true
};
var TAP_DISTANCE = 4;
var DEFAULT_Z_INDEX = 2147483e3;
var DEFAULT_STROKE_COLOR = "#d92d20";
function defaultRoute() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}
function defaultNow() {
  return typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now();
}
var idCounter = 0;
function defaultCreateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ann_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `ann_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
function toStrokeInput(points) {
  return points.map((point) => [point.x, point.y, _nullishCoalesce(point.pressure, () => ( 0.5))]);
}
function average(a, b) {
  return (a + b) / 2;
}
function getSvgPathFromStroke(outline) {
  const length = outline.length;
  if (length < 4) return "";
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;
  for (let index = 2, max = length - 1; index < max; index++) {
    a = outline[index];
    b = outline[index + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
  }
  return `${result}Z`;
}
function strokePath(points, last) {
  if (points.length === 0) return "";
  return getSvgPathFromStroke(_perfectfreehand.getStroke.call(void 0, toStrokeInput(points), { ...STROKE_OPTIONS, last }));
}
function pointFromEvent(event) {
  const point = { x: event.clientX, y: event.clientY };
  if (event.pointerType === "pen" && Number.isFinite(event.pressure)) {
    point.pressure = event.pressure;
  }
  return point;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
var rootStyle = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none"
};
var surfaceStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "visible",
  touchAction: "none",
  display: "block"
};
var tintStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  boxShadow: "inset 0 0 0 3px rgba(217, 45, 32, 0.85)"
};
var toggleStyle = {
  position: "absolute",
  right: 16,
  bottom: 88,
  width: 44,
  height: 44,
  borderRadius: 22,
  border: "1px solid #d0d5dd",
  background: "#ffffff",
  color: "#344054",
  boxShadow: "0 8px 24px rgba(16, 24, 40, 0.18)",
  cursor: "pointer",
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  lineHeight: 1
};
var toggleActiveStyle = {
  ...toggleStyle,
  background: DEFAULT_STROKE_COLOR,
  borderColor: DEFAULT_STROKE_COLOR,
  color: "#ffffff",
  boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.35)"
};
function DrawingLayer({
  annotations,
  onAnnotation,
  active: controlledActive,
  defaultActive = false,
  onActiveChange,
  shortcut = DEFAULT_DRAW_SHORTCUT,
  route,
  now = defaultNow,
  createId = defaultCreateId,
  showToggle = true,
  pinOnTap = true,
  zIndex = DEFAULT_Z_INDEX,
  strokeColor = DEFAULT_STROKE_COLOR
}) {
  const [uncontrolledActive, setUncontrolledActive] = _react.useState.call(void 0, defaultActive);
  const active = _nullishCoalesce(controlledActive, () => ( uncontrolledActive));
  const [draft, setDraft] = _react.useState.call(void 0, []);
  const [pendingPin, setPendingPin] = _react.useState.call(void 0, null);
  const pointerIdRef = _react.useRef.call(void 0, null);
  const draftRef = _react.useRef.call(void 0, []);
  const isControlledRef = _react.useRef.call(void 0, controlledActive !== void 0);
  isControlledRef.current = controlledActive !== void 0;
  const onActiveChangeRef = _react.useRef.call(void 0, onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const setActive = _react.useCallback.call(void 0, (next) => {
    if (!isControlledRef.current) setUncontrolledActive(next);
    _optionalChain([onActiveChangeRef, 'access', _31 => _31.current, 'optionalCall', _32 => _32(next)]);
  }, []);
  const activeRef = _react.useRef.call(void 0, active);
  activeRef.current = active;
  const toggleRef = _react.useRef.call(void 0, null);
  _react.useEffect.call(void 0, () => {
    const toggle = createDrawToggle({ shortcut, initialActive: activeRef.current, onChange: setActive });
    toggleRef.current = toggle;
    return () => {
      toggle.dispose();
      if (toggleRef.current === toggle) toggleRef.current = null;
    };
  }, [shortcut, setActive]);
  _react.useEffect.call(void 0, () => {
    _optionalChain([toggleRef, 'access', _33 => _33.current, 'optionalAccess', _34 => _34.sync, 'call', _35 => _35(active)]);
  }, [active]);
  const resetDraft = _react.useCallback.call(void 0, () => {
    draftRef.current = [];
    pointerIdRef.current = null;
    setDraft([]);
  }, []);
  _react.useEffect.call(void 0, () => {
    if (active) return;
    resetDraft();
    setPendingPin(null);
  }, [active, resetDraft]);
  _react.useEffect.call(void 0, () => {
    if (!active || typeof window === "undefined") return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (pendingPin) {
        setPendingPin(null);
      } else {
        setActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, pendingPin, setActive]);
  const anchorOptions = _react.useCallback.call(void 0, () => ({ route: _nullishCoalesce(route, () => ( defaultRoute())), t: now() }), [route, now]);
  const completeStroke = _react.useCallback.call(void 0, 
    (points) => {
      const options = anchorOptions();
      onAnnotation({
        id: createId(),
        kind: "stroke",
        points,
        bbox: computeBbox(points),
        anchor: anchorStroke(points, options)
      });
    },
    [anchorOptions, createId, onAnnotation]
  );
  const completePin = _react.useCallback.call(void 0, 
    (comment) => {
      if (!pendingPin) return;
      const options = anchorOptions();
      const bbox = { x: pendingPin.point.x, y: pendingPin.point.y, width: 0, height: 0 };
      onAnnotation({
        id: createId(),
        kind: "pin",
        points: [pendingPin.point],
        bbox,
        anchor: pendingPin.target ? buildAnchor(pendingPin.target, options) : buildFallbackAnchor(bbox, options),
        text: comment
      });
      setPendingPin(null);
    },
    [anchorOptions, createId, onAnnotation, pendingPin]
  );
  const onPointerDown = (event) => {
    if (!active || event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    if (pendingPin) {
      setPendingPin(null);
      return;
    }
    pointerIdRef.current = event.pointerId;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (e) {
      }
    }
    const point = pointFromEvent(event);
    draftRef.current = [point];
    setDraft([point]);
  };
  const onPointerMove = (event) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const next = [...draftRef.current, pointFromEvent(event)];
    draftRef.current = next;
    setDraft(next);
  };
  const onPointerUp = (event) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const points = [...draftRef.current, pointFromEvent(event)];
    resetDraft();
    const start = points[0];
    const travelled = points.some((point) => distance(point, start) > TAP_DISTANCE);
    if (!travelled) {
      if (pinOnTap) {
        setPendingPin({ point: start, target: resolvePointTarget(start) });
      }
      return;
    }
    completeStroke(points);
  };
  const onPointerCancel = (event) => {
    if (pointerIdRef.current !== event.pointerId) return;
    resetDraft();
  };
  const pins = annotations.filter((annotation) => annotation.kind === "pin");
  const draftPath = draft.length > 0 ? strokePath(draft, false) : "";
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
    "div",
    {
      ...{ [OVERLAY_ATTRIBUTE]: "" },
      "data-riffrec-draw-active": active ? "" : void 0,
      style: { ...rootStyle, zIndex },
      children: [
        active ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { "data-riffrec-draw-tint": "", "aria-hidden": "true", style: tintStyle }) : null,
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
          "svg",
          {
            "data-riffrec-draw-surface": "",
            "aria-hidden": active ? void 0 : "true",
            role: active ? "img" : void 0,
            "aria-label": active ? "Drawing layer" : void 0,
            style: {
              ...surfaceStyle,
              pointerEvents: active ? "auto" : "none",
              cursor: active ? "crosshair" : "default"
            },
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            children: [
              annotations.map(
                (annotation) => annotation.kind === "stroke" ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
                  "path",
                  {
                    "data-riffrec-stroke": annotation.id,
                    d: strokePath(annotation.points, true),
                    fill: strokeColor,
                    fillOpacity: 0.9
                  },
                  annotation.id
                ) : /* @__PURE__ */ _jsxruntime.jsx.call(void 0, Pin, { annotation, index: pins.indexOf(annotation) + 1 }, annotation.id)
              ),
              draftPath ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "path", { "data-riffrec-stroke-draft": "", d: draftPath, fill: strokeColor, fillOpacity: 0.9 }) : null
            ]
          }
        ),
        pendingPin ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          PinComposer,
          {
            point: pendingPin.point,
            target: pendingPin.target,
            onSubmit: completePin,
            onCancel: () => setPendingPin(null)
          }
        ) : null,
        showToggle ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          "button",
          {
            type: "button",
            "data-riffrec-draw-toggle": "",
            "aria-pressed": active,
            "aria-label": active ? "Stop drawing" : "Draw on the page",
            title: shortcut ? `Draw (${shortcut})` : "Draw",
            style: active ? toggleActiveStyle : toggleStyle,
            onClick: () => setActive(!activeRef.current),
            children: "\u270E"
          }
        ) : null
      ]
    }
  );
}

// src/live/evidence/composite.ts
var CompositeRenderer = class {
  constructor(options) {
    this.queue = Promise.resolve();
    this.pendingCount = 0;
    this.disposed = false;
    this.now = options.now;
    this.route = options.route;
    this.createId = options.createId;
    this.draw = _nullishCoalesce(options.draw, () => ( createCanvasCompositeDrawer()));
    this.onFrame = _nullishCoalesce(options.onFrame, () => ( (() => {
    })));
    this.onError = _nullishCoalesce(options.onError, () => ( (() => {
    })));
  }
  get pending() {
    return this.pendingCount;
  }
  /**
   * Queue one composite for `annotation` over `base`. Resolves null when there
   * is no base frame (no display stream, KTD10) or the drawer produced nothing.
   * `frameId` lets the caller reserve the id up front so a unit opened at
   * completion time can already reference the composite.
   */
  render(annotation, base, frameId) {
    if (!base || this.disposed) return Promise.resolve(null);
    this.pendingCount += 1;
    const id = _nullishCoalesce(frameId, () => ( this.createId()));
    const t = this.now();
    const route = this.route();
    const run = this.queue.then(async () => {
      if (this.disposed) return null;
      let jpeg = null;
      try {
        jpeg = await this.draw({ base, annotations: [annotation] });
      } catch (error) {
        this.onError(error);
      }
      if (!jpeg) return null;
      const frame = { id, t, route, kind: "composite", jpeg_base64: jpeg };
      this.onFrame(frame);
      return { frame, annotation: { ...annotation, composite_frame_id: frame.id } };
    });
    this.queue = run.catch(() => void 0).finally(() => {
      this.pendingCount -= 1;
    });
    return run;
  }
  /** Resolves once every queued composite has settled. */
  idle() {
    return this.queue.then(() => void 0);
  }
  dispose() {
    this.disposed = true;
  }
};
var COMPOSITE_STROKE_COLOR = "#d92d20";
var COMPOSITE_PIN_COLOR = "#1d4ed8";
function decodeJpeg(base64, doc) {
  return new Promise((resolve) => {
    const image = doc.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/jpeg;base64,${base64}`;
  });
}
function createCanvasCompositeDrawer(options = {}) {
  const doc = _nullishCoalesce(options.document, () => ( (typeof document !== "undefined" ? document : null)));
  const quality = _nullishCoalesce(options.quality, () => ( 0.7));
  const viewport = _nullishCoalesce(options.viewport, () => ( (() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0
  }))));
  return async ({ base, annotations }) => {
    if (!doc || typeof Path2D === "undefined") return null;
    const image = await decodeJpeg(base.jpeg_base64, doc);
    if (!image || !image.naturalWidth || !image.naturalHeight) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const { width, height } = viewport();
    const scaleX = width > 0 ? canvas.width / width : 1;
    const scaleY = height > 0 ? canvas.height / height : 1;
    context.save();
    context.scale(scaleX, scaleY);
    for (const annotation of annotations) {
      switch (annotation.kind) {
        case "stroke": {
          context.fillStyle = COMPOSITE_STROKE_COLOR;
          context.fill(new Path2D(strokePath(annotation.points, true)));
          break;
        }
        case "pin": {
          const point = annotation.points[0];
          if (!point) break;
          context.fillStyle = COMPOSITE_PIN_COLOR;
          context.beginPath();
          context.arc(point.x, point.y, 9, 0, Math.PI * 2);
          context.fill();
          if (annotation.text) {
            context.font = "14px system-ui, sans-serif";
            context.fillStyle = "#ffffff";
            const label = annotation.text.length > 60 ? `${annotation.text.slice(0, 57)}...` : annotation.text;
            const metrics = context.measureText(label);
            context.fillRect(point.x + 14, point.y - 12, metrics.width + 12, 24);
            context.fillStyle = COMPOSITE_PIN_COLOR;
            context.fillText(label, point.x + 20, point.y + 5);
          }
          break;
        }
        default: {
          const exhaustive = annotation.kind;
          return exhaustive;
        }
      }
    }
    context.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const comma = dataUrl.indexOf(",");
    return comma === -1 ? null : dataUrl.slice(comma + 1);
  };
}

// src/live/evidence/frames.ts
var FRAME_BUFFER_CAPACITY = 12;
var PERIODIC_FRAME_MS = 1e4;
var DEFAULT_FRAME_JPEG_QUALITY = 0.7;
var DEFAULT_FRAME_MAX_WIDTH = 1280;
var FrameBuffer = class {
  constructor(options) {
    this.frames = [];
    this.periodicTimer = null;
    this.paused = false;
    this.disposed = false;
    this.inFlight = 0;
    this.now = options.now;
    this.route = options.route;
    this.createId = options.createId;
    this.capacity = _nullishCoalesce(options.capacity, () => ( FRAME_BUFFER_CAPACITY));
    this.periodicMs = _nullishCoalesce(options.periodicMs, () => ( PERIODIC_FRAME_MS));
    this.grabber = _nullishCoalesce(options.grabber, () => ( null));
    this.setTimer = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.clearTimer = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
    this.onFrame = _nullishCoalesce(options.onFrame, () => ( (() => {
    })));
    this.onError = _nullishCoalesce(options.onError, () => ( (() => {
    })));
  }
  /** True while a display source exists; false yields nothing from `capture`. */
  get hasSource() {
    return this.grabber !== null;
  }
  get isPaused() {
    return this.paused;
  }
  get isPeriodicRunning() {
    return this.periodicTimer !== null;
  }
  get pendingCaptures() {
    return this.inFlight;
  }
  /** Swap the display source; null (stream lost, before re-share) stops the periodic timer. */
  setGrabber(grabber) {
    this.grabber = grabber;
    if (!grabber) this.stopPeriodic();
  }
  /** Convenience over `setGrabber` for a `getDisplayMedia` stream. */
  setDisplayStream(stream, options = {}) {
    this.setGrabber(stream ? createDisplayFrameGrabber(stream, options) : null);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  /** Grab the current view; resolves null with no source, while paused, or when the grab fails. */
  async capture(kind, t = this.now()) {
    const grabber = this.grabber;
    if (!grabber || this.paused || this.disposed) return null;
    const route = this.route();
    this.inFlight += 1;
    let jpeg = null;
    try {
      jpeg = await grabber();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight -= 1;
    }
    if (!jpeg || this.disposed) return null;
    const frame = { id: this.createId(), t, route, kind, jpeg_base64: jpeg };
    this.push(frame);
    this.onFrame(frame);
    return frame;
  }
  startPeriodic() {
    if (this.periodicTimer !== null || this.disposed || !this.grabber) return;
    this.periodicTimer = this.setTimer(() => {
      this.periodicTimer = null;
      void this.capture("periodic").finally(() => this.startPeriodic());
    }, this.periodicMs);
  }
  stopPeriodic() {
    if (this.periodicTimer === null) return;
    this.clearTimer(this.periodicTimer);
    this.periodicTimer = null;
  }
  /** The buffered frame nearest `t` (a unit's first anchor); null when the buffer is empty. */
  nearest(t) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const frame of this.frames) {
      const distance2 = Math.abs(frame.t - t);
      if (distance2 < bestDistance) {
        best = frame;
        bestDistance = distance2;
      }
    }
    return best;
  }
  latest() {
    return _nullishCoalesce(this.frames[this.frames.length - 1], () => ( null));
  }
  all() {
    return [...this.frames];
  }
  get(id) {
    return _nullishCoalesce(this.frames.find((frame) => frame.id === id), () => ( null));
  }
  dispose() {
    this.disposed = true;
    this.stopPeriodic();
    this.grabber = null;
  }
  push(frame) {
    this.frames.push(frame);
    while (this.frames.length > this.capacity) this.frames.shift();
  }
};
function dataUrlToBase64(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.startsWith("data:image/jpeg")) return null;
  const base64 = dataUrl.slice(comma + 1);
  return base64.length > 0 ? base64 : null;
}
function createDisplayFrameGrabber(stream, options = {}) {
  const doc = _nullishCoalesce(options.document, () => ( (typeof document !== "undefined" ? document : null)));
  if (!doc) return async () => null;
  const quality = _nullishCoalesce(options.quality, () => ( DEFAULT_FRAME_JPEG_QUALITY));
  const maxWidth = _nullishCoalesce(options.maxWidth, () => ( DEFAULT_FRAME_MAX_WIDTH));
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const ready = video.play().catch(() => {
  });
  const canvas = doc.createElement("canvas");
  return async () => {
    const [track] = stream.getVideoTracks();
    if (!track || track.readyState === "ended") return null;
    await ready;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const scale = maxWidth > 0 && width > maxWidth ? maxWidth / width : 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return dataUrlToBase64(canvas.toDataURL("image/jpeg", quality));
  };
}

// src/live/evidence/liveEvidence.ts
var TELEMETRY_WINDOW_MS = 1e4;
var RECENT_FRAME_MS = 500;
function currentRoute() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}
function describeAnnotation(annotation) {
  const target = annotation.anchor.component ? `${annotation.anchor.component} (${annotation.anchor.selector})` : annotation.anchor.selector;
  switch (annotation.kind) {
    case "stroke":
      return `Drawing on ${target}`;
    case "pin":
      return annotation.text ? `Pin on ${target}: ${annotation.text}` : `Pin on ${target}`;
    default: {
      const exhaustive = annotation.kind;
      return exhaustive;
    }
  }
}
var LiveEvidence = class {
  constructor(options) {
    this.onPointerDown = () => {
      void this.gesture();
    };
    /** Composite frame id per annotation, for units opened after the composite settled. */
    this.compositeIds = /* @__PURE__ */ new Map();
    /** Units that claimed an annotation before its post settled. */
    this.claimedBy = /* @__PURE__ */ new Map();
    this.paused = false;
    this.disposed = false;
    this.session = options.session;
    this.now = options.now;
    const route = _nullishCoalesce(options.route, () => ( currentRoute));
    this.recentEvents = _nullishCoalesce(options.recentEvents, () => ( (() => [])));
    this.displayGrabber = _nullishCoalesce(options.displayGrabber, () => ( {}));
    const timers = { setTimeout: options.setTimeout, clearTimeout: options.clearTimeout };
    const onError = _nullishCoalesce(options.onError, () => ( (() => {
    })));
    this.frames = new FrameBuffer({
      now: this.now,
      route,
      createId: () => this.session.mintId("frame"),
      periodicMs: options.periodicMs,
      grabber: _nullishCoalesce(options.grabber, () => ( null)),
      onFrame: (frame) => this.session.addFrame(frame),
      onError,
      ...timers
    });
    this.composites = new CompositeRenderer({
      now: this.now,
      route,
      createId: () => this.session.mintId("frame"),
      draw: options.draw,
      onError
    });
    this.clips = new AudioClipRecorder({
      now: this.now,
      createId: () => this.session.mintId("clip"),
      stream: _nullishCoalesce(options.micStream, () => ( null)),
      createRecorder: options.createRecorder,
      onClip: (clip) => {
        if (clip.blob) this.session.addClip(clip.id, clip.blob);
      },
      onError
    });
    this.attacher = new AnnotationAttacher({
      now: this.now,
      onHeldExpired: (annotation) => this.openDrawingOnlyUnit(annotation),
      lookbackMs: options.lookbackMs,
      drawingOnlyMs: options.drawingOnlyMs,
      ...timers
    });
    this.gestureTarget = options.gestureTarget === void 0 ? typeof document !== "undefined" ? document : null : options.gestureTarget;
    _optionalChain([this, 'access', _36 => _36.gestureTarget, 'optionalAccess', _37 => _37.addEventListener, 'call', _38 => _38("pointerdown", this.onPointerDown, true)]);
    if (options.displayStream) this.setDisplayStream(options.displayStream);
  }
  get isPaused() {
    return this.paused;
  }
  get hasDisplay() {
    return this.frames.hasSource;
  }
  /** Re-share hook: a fresh display stream resumes frames; null stops them until the next share. */
  setDisplayStream(stream) {
    if (this.disposed) return;
    this.frames.setDisplayStream(stream, this.displayGrabber);
    if (stream) this.frames.startPeriodic();
  }
  /** Test seam mirroring `setDisplayStream` without a `MediaStream`. */
  setFrameGrabber(grabber) {
    if (this.disposed) return;
    this.frames.setGrabber(grabber);
    if (grabber) this.frames.startPeriodic();
  }
  setMicStream(stream) {
    this.clips.setStream(stream);
  }
  speechStarted() {
    this.attacher.speechStarted();
    this.clips.speechStarted();
  }
  speechStopped() {
    this.attacher.speechStopped();
    this.clips.speechStopped();
  }
  /** An anchor gesture (click, stroke start, pin): buffer a frame now (KTD10). */
  gesture(t = this.now()) {
    if (this.paused) return Promise.resolve(null);
    return this.frames.capture("gesture", t);
  }
  /**
   * `look_at_screen` and proactive frames: the view right now. A gesture frame
   * grabbed within `RECENT_FRAME_MS` (the pointerdown that preceded a click)
   * already is the current view and is reused; otherwise a fresh grab, buffered
   * like a gesture frame so the unit that follows attaches to it; otherwise the
   * most recent buffered frame, marked stale. Null while paused (R25: nothing
   * leaves the page) or when no display source exists.
   */
  async lookAtScreen() {
    if (this.paused || this.disposed) return null;
    const recent = this.frames.latest();
    if (recent && this.now() - recent.t <= RECENT_FRAME_MS) return { frame: recent, fresh: true };
    const fresh = await this.frames.capture("gesture");
    if (fresh) return { frame: fresh, fresh: true };
    const latest = this.frames.latest();
    return latest ? { frame: latest, fresh: false } : null;
  }
  /** R25: stop frames and composites; the screen recording and the clip recorder keep running. */
  pause() {
    this.paused = true;
    this.frames.pause();
  }
  resume() {
    this.paused = false;
    this.frames.resume();
  }
  /**
   * The drawing layer's `onAnnotation`. The attachment is resolved and any
   * drawing-only unit opened synchronously at completion time (so a second
   * stroke a moment later looks back at that unit); the composite frame id is
   * reserved up front, rendered through the queue, and the annotation posts
   * once with `composite_frame_id` and `unit_id` filled as far as known. A
   * reserved id a unit already carries always gets a frame: when the composite
   * does not render, the base view stands in for it.
   */
  async annotationCompleted(annotation) {
    if (this.disposed) return { kind: "drawing_only" };
    const resolution = this.attacher.annotationCompleted(annotation);
    const base = this.paused ? null : this.frames.latest();
    const compositeId = base ? this.session.mintId("frame") : null;
    if (compositeId) this.compositeIds.set(annotation.id, compositeId);
    const referenced = compositeId ? { ...annotation, composite_frame_id: compositeId } : annotation;
    let unitId = null;
    switch (resolution.kind) {
      case "held":
        break;
      case "attached":
        unitId = resolution.unitId;
        break;
      case "drawing_only":
        unitId = this.attacher.unitExtracted(() => this.createDrawingOnlyUnit(referenced, compositeId));
        break;
      default: {
        const exhaustive = resolution;
        return exhaustive;
      }
    }
    const composite = compositeId ? await this.composites.render(referenced, base, compositeId) : null;
    if (this.disposed) return resolution;
    if (composite) {
      this.session.addFrame(composite.frame);
    } else if (base && compositeId) {
      this.session.addFrame({ ...base, id: compositeId, kind: "composite" });
    }
    if (resolution.kind === "held") {
      unitId = _nullishCoalesce(this.claimedBy.get(annotation.id), () => ( null));
      this.claimedBy.delete(annotation.id);
    }
    this.session.addAnnotation(unitId ? { ...referenced, unit_id: unitId } : referenced);
    return resolution;
  }
  /**
   * `record_unit`: claims held annotations, picks the buffered frame nearest
   * the first anchor, takes the utterance's clip, and builds the telemetry
   * window. The profile decides what of this leaves the page.
   */
  recordUnit(input) {
    let unit = null;
    this.attacher.unitExtracted((claimed) => {
      const claimedIds = claimed.map((annotation) => annotation.id);
      const compositeIds = claimed.map((annotation) => this.compositeIds.get(annotation.id)).filter((id) => typeof id === "string");
      const firstAnchorT = _optionalChain([input, 'access', _39 => _39.anchors, 'access', _40 => _40[0], 'optionalAccess', _41 => _41.t]);
      const gestureFrame = firstAnchorT === void 0 ? this.frames.latest() : this.frames.nearest(firstAnchorT);
      const span = _nullishCoalesce(_optionalChain([input, 'access', _42 => _42.evidence, 'optionalAccess', _43 => _43.transcript_span]), () => ( { t_start: _nullishCoalesce(firstAnchorT, () => ( this.now())), t_end: this.now() }));
      const clipId = this.clips.pendingClipId();
      const telemetry = this.telemetryWindow(span.t_start, span.t_end);
      unit = this.session.recordUnit({
        ...input,
        evidence: {
          ...input.evidence,
          transcript_span: span,
          frame_ids: dedupe([..._nullishCoalesce(_optionalChain([input, 'access', _44 => _44.evidence, 'optionalAccess', _45 => _45.frame_ids]), () => ( [])), ...compositeIds, ...gestureFrame ? [gestureFrame.id] : []]),
          annotation_ids: dedupe([..._nullishCoalesce(_optionalChain([input, 'access', _46 => _46.evidence, 'optionalAccess', _47 => _47.annotation_ids]), () => ( [])), ...claimedIds]),
          ...telemetry ? { telemetry_window: telemetry } : {},
          ...clipId ? { audio_clip_id: clipId } : {}
        }
      });
      if (clipId) this.clips.claim(unit.id);
      for (const annotation of claimed) {
        if (!this.session.attachAnnotation(annotation.id, unit.id)) this.claimedBy.set(annotation.id, unit.id);
      }
      return unit.id;
    });
    return unit;
  }
  dispose() {
    this.disposed = true;
    _optionalChain([this, 'access', _48 => _48.gestureTarget, 'optionalAccess', _49 => _49.removeEventListener, 'call', _50 => _50("pointerdown", this.onPointerDown, true)]);
    this.frames.dispose();
    this.composites.dispose();
    this.clips.dispose();
    this.attacher.dispose();
  }
  /** A held annotation whose utterance produced no unit: it becomes its own unit (R16). */
  openDrawingOnlyUnit(annotation) {
    if (this.disposed) return null;
    const unitId = this.createDrawingOnlyUnit(annotation, _nullishCoalesce(this.compositeIds.get(annotation.id), () => ( null)));
    if (!this.session.attachAnnotation(annotation.id, unitId)) this.claimedBy.set(annotation.id, unitId);
    return unitId;
  }
  createDrawingOnlyUnit(annotation, compositeId) {
    return this.session.recordUnit({
      statement: describeAnnotation(annotation),
      transcript_excerpt: "",
      anchors: [annotation.anchor],
      evidence: {
        frame_ids: compositeId ? [compositeId] : [],
        annotation_ids: [annotation.id],
        transcript_span: { t_start: annotation.anchor.t, t_end: this.now() }
      }
    }).id;
  }
  /** R21: network and console events within ±10 s of the utterance; null when there are none. */
  telemetryWindow(tStart, tEnd) {
    const t_start = Math.max(0, tStart - TELEMETRY_WINDOW_MS);
    const t_end = tEnd + TELEMETRY_WINDOW_MS;
    const events = this.recentEvents().filter(
      (event) => (event.type === "network_request" || event.type === "console_error") && event.t >= t_start && event.t <= t_end
    );
    if (events.length === 0) return null;
    return { t_start, t_end, events };
  }
};
function dedupe(ids) {
  return [...new Set(ids)];
}

// src/live/evidence/profile.ts
var ANCHORS_TRANSCRIPT_ONLY_PROFILE = {
  transcript_excerpt: true,
  strokes: false,
  frames: "none",
  telemetry_window: false,
  audio_clip: false
};
var DEFAULT_EVIDENCE_PROFILE = {
  transcript_excerpt: true,
  strokes: true,
  frames: "one",
  telemetry_window: false,
  audio_clip: false
};
var FULL_EVIDENCE_PROFILE = {
  transcript_excerpt: true,
  strokes: true,
  frames: "all",
  telemetry_window: true,
  audio_clip: true
};
var EVIDENCE_PROFILES = {
  anchors_transcript_only: ANCHORS_TRANSCRIPT_ONLY_PROFILE,
  default: DEFAULT_EVIDENCE_PROFILE,
  full: FULL_EVIDENCE_PROFILE
};
function resolveEvidenceProfile(input) {
  if (!input) return { ...DEFAULT_EVIDENCE_PROFILE };
  if (typeof input === "string") return { ...EVIDENCE_PROFILES[input] };
  return { ...DEFAULT_EVIDENCE_PROFILE, ...input };
}
function frameWirePolicy(kind, profile) {
  switch (profile.frames) {
    case "none":
      return "never";
    case "all":
      return "post";
    case "one":
      return kind === "composite" ? "post" : "hold";
    default: {
      const exhaustive = profile.frames;
      return exhaustive;
    }
  }
}
function selectUnitFrames(frameIds, profile, frameKind) {
  switch (profile.frames) {
    case "none":
      return [];
    case "all":
      return [...frameIds];
    case "one": {
      const composite = frameIds.find((id) => frameKind(id) === "composite");
      const chosen = _nullishCoalesce(composite, () => ( frameIds[0]));
      return chosen ? [chosen] : [];
    }
    default: {
      const exhaustive = profile.frames;
      return exhaustive;
    }
  }
}
function applyEvidenceProfile(unit, profile, frameKind = () => null) {
  const { telemetry_window, audio_clip_id, ...evidence } = unit.evidence;
  return {
    ...unit,
    transcript_excerpt: profile.transcript_excerpt ? unit.transcript_excerpt : "",
    evidence: {
      ...evidence,
      frame_ids: selectUnitFrames(unit.evidence.frame_ids, profile, frameKind),
      annotation_ids: profile.strokes ? [...unit.evidence.annotation_ids] : [],
      ...profile.telemetry_window && telemetry_window ? { telemetry_window } : {},
      ...profile.audio_clip && audio_clip_id ? { audio_clip_id } : {}
    }
  };
}

// src/live/realtime/audioRouting.ts
function routeRemoteAudio(context, stream) {
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();
  const edges = /* @__PURE__ */ new Map();
  const link = (from, to) => {
    from.connect(to);
    const set = _nullishCoalesce(edges.get(from), () => ( /* @__PURE__ */ new Set()));
    set.add(to);
    edges.set(from, set);
  };
  link(source, gain);
  link(gain, context.destination);
  if (context.state === "suspended" && typeof context.resume === "function") {
    void context.resume().catch(() => {
    });
  }
  let disposed = false;
  return {
    source,
    gain,
    isReachable: () => !disposed && reaches(edges, source, context.destination),
    setVolume: (volume) => {
      gain.gain.value = Math.max(0, Math.min(1, volume));
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      edges.clear();
      try {
        source.disconnect();
      } catch (e2) {
      }
      try {
        gain.disconnect();
      } catch (e3) {
      }
    }
  };
}
function reaches(edges, from, to) {
  const seen = /* @__PURE__ */ new Set();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of _nullishCoalesce(edges.get(node), () => ( []))) stack.push(next);
  }
  return false;
}
function createDefaultAudioContext() {
  if (typeof window === "undefined") return null;
  const scope = window;
  const Ctor = _nullishCoalesce(scope.AudioContext, () => ( scope.webkitAudioContext));
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch (e4) {
    return null;
  }
}
function defaultCreateStream(tracks) {
  return new MediaStream(tracks);
}
var SharedMicrophone = class {
  constructor(source, options = {}) {
    this.source = source;
    this.clones = /* @__PURE__ */ new Map();
    this.mutedState = false;
    this.stopped = false;
    this.createStream = _nullishCoalesce(options.createStream, () => ( defaultCreateStream));
  }
  get muted() {
    return this.mutedState;
  }
  get isStopped() {
    return this.stopped;
  }
  /** A fresh clone for one consumer; a second call for the same consumer stops the previous clone. */
  clone(consumer) {
    if (this.stopped) throw new Error("SharedMicrophone is stopped");
    this.release(consumer);
    const tracks = this.source.getAudioTracks().map((track) => {
      const clone = track.clone();
      clone.enabled = !this.mutedState;
      return clone;
    });
    this.clones.set(consumer, tracks);
    return this.createStream(tracks);
  }
  tracksFor(consumer) {
    return [..._nullishCoalesce(this.clones.get(consumer), () => ( []))];
  }
  release(consumer) {
    const tracks = this.clones.get(consumer);
    if (!tracks) return;
    for (const track of tracks) track.stop();
    this.clones.delete(consumer);
  }
  setMuted(muted) {
    this.mutedState = muted;
    for (const track of this.source.getAudioTracks()) track.enabled = !muted;
    for (const tracks of this.clones.values()) {
      for (const track of tracks) track.enabled = !muted;
    }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const consumer of [...this.clones.keys()]) this.release(consumer);
    for (const track of this.source.getAudioTracks()) track.stop();
  }
};

// src/live/realtime/sessionConfig.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readSessionConfig(session) {
  const record = isRecord(session) ? session : {};
  const instructions = typeof record.instructions === "string" ? record.instructions : null;
  const tools = Array.isArray(record.tools) ? record.tools.filter(isRecord).map((tool) => ({ ...tool })) : [];
  return { instructions, tools };
}
function reconcileSessionConfig(current) {
  const patch = {};
  const names = new Set(current.tools.map((tool) => tool.name).filter((name) => typeof name === "string"));
  const endpointConfigured = [...names].some((name) => _chunk4XWUXLDEcjs.isLiveToolName.call(void 0, name));
  const missing = _chunk4XWUXLDEcjs.LIVE_TOOLS.filter((tool) => !names.has(tool.name));
  if (missing.length > 0) patch.tools = [...current.tools, ...missing.map((tool) => ({ ...tool }))];
  if (!endpointConfigured) {
    patch.instructions = _chunk4XWUXLDEcjs.DEFAULT_INTERVIEWER_INSTRUCTIONS;
  } else if (!_chunk4XWUXLDEcjs.hasScreenContext.call(void 0, current.instructions)) {
    patch.instructions = _chunk4XWUXLDEcjs.withScreenContext.call(void 0, _nullishCoalesce(current.instructions, () => ( "")));
  }
  return patch.tools || patch.instructions !== void 0 ? patch : null;
}

// src/live/realtime/client.ts
var REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
var DATA_CHANNEL_READY_TIMEOUT_MS = 1e4;
var PEER_DISCONNECTED_GRACE_MS = 1e4;
function asString(value) {
  return typeof value === "string" ? value : "";
}
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function parseToolArgs(value) {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch (e5) {
    return {};
  }
}
var UTTERANCE_SPAN_LIMIT = 64;
function parseRealtimeEvent(raw, context) {
  const message = asRecord(raw);
  const type = asString(message.type);
  switch (type) {
    case "session.created":
      return { type: "session_created", session: readSessionConfig(message.session) };
    case "input_audio_buffer.speech_started":
      return { type: "speech_started", t: context.t };
    case "input_audio_buffer.speech_stopped":
      return { type: "speech_stopped", t: context.t };
    case "conversation.item.input_audio_transcription.completed": {
      const text = asString(message.transcript).trim();
      const itemId = asString(message.item_id);
      const span = itemId ? _optionalChain([context, 'access', _51 => _51.spans, 'optionalAccess', _52 => _52.get, 'call', _53 => _53(itemId)]) : void 0;
      const tStart = _nullishCoalesce(_nullishCoalesce(_optionalChain([span, 'optionalAccess', _54 => _54.start]), () => ( context.utteranceStart)), () => ( context.t));
      const tEnd = span ? _nullishCoalesce(span.end, () => ( Math.max(tStart, context.t))) : _nullishCoalesce(context.utteranceEnd, () => ( context.t));
      return {
        type: "transcript",
        transcript: {
          id: itemId || `riffer_${context.t}`,
          role: "riffer",
          text,
          t_start: tStart,
          t_end: Math.max(tStart, tEnd),
          final: true
        }
      };
    }
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const text = asString(message.transcript).trim();
      const id = asString(message.item_id) || asString(message.response_id) || `interviewer_${context.t}`;
      return {
        type: "transcript",
        transcript: { id, role: "interviewer", text, t_start: context.t, t_end: context.t, final: true }
      };
    }
    case "response.created":
      return { type: "response_started", response_id: asString(asRecord(message.response).id) };
    case "response.done":
      return { type: "response_done", response_id: asString(asRecord(message.response).id) };
    case "response.function_call_arguments.done": {
      const name = asString(message.name);
      const callId = asString(message.call_id);
      if (!_chunk4XWUXLDEcjs.isLiveToolName.call(void 0, name)) return { type: "error", message: `Unknown tool call: ${name || "(unnamed)"}` };
      return {
        type: "tool_call",
        call: { call_id: callId, name, arguments: parseToolArgs(message.arguments) }
      };
    }
    case "error": {
      const error = asRecord(message.error);
      const code = asString(error.code);
      const text = asString(error.message) || "Realtime error";
      return { type: "error", message: code ? `${code}: ${text}` : text };
    }
    default:
      return null;
  }
}
var RealtimeClient = class {
  constructor(options) {
    this.options = options;
    this.pc = null;
    this.dataChannel = null;
    this.audioElement = null;
    this.handlers = null;
    this.muted = false;
    this.closedReported = false;
    this.disconnectTimer = null;
    this.utteranceStart = null;
    this.utteranceEnd = null;
    this.spans = /* @__PURE__ */ new Map();
    const deps = _nullishCoalesce(options.deps, () => ( {}));
    this.fetchImpl = _nullishCoalesce(deps.fetchImpl, () => ( ((input, init) => fetch(input, init))));
    this.createPeerConnection = _nullishCoalesce(deps.createPeerConnection, () => ( (() => new RTCPeerConnection())));
    this.createAudioElement = _nullishCoalesce(deps.createAudioElement, () => ( (() => {
      const element = document.createElement("audio");
      element.autoplay = true;
      return element;
    })));
    this.baseUrl = _nullishCoalesce(deps.baseUrl, () => ( REALTIME_CALLS_URL));
    const builtAt = Date.now();
    this.elapsed = _nullishCoalesce(deps.elapsed, () => ( (() => Date.now() - builtAt)));
    this.schedule = _nullishCoalesce(deps.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.cancel = _nullishCoalesce(deps.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
    this.textRole = _nullishCoalesce(deps.textRole, () => ( "system"));
    this.onParseError = _nullishCoalesce(deps.onParseError, () => ( null));
    this.muted = options.micStream.getAudioTracks().some((track) => !track.enabled);
  }
  get connected() {
    return _optionalChain([this, 'access', _55 => _55.dataChannel, 'optionalAccess', _56 => _56.readyState]) === "open";
  }
  get isMuted() {
    return this.muted;
  }
  /** Resolves once the data channel is open; rejects (and tears down) on any failure. */
  async connect(handlers) {
    if (this.pc) throw new Error("RealtimeClient.connect called twice");
    this.handlers = handlers;
    this.closedReported = false;
    const pc = this.createPeerConnection();
    this.pc = pc;
    const micStream = this.options.micStream;
    for (const track of micStream.getAudioTracks()) {
      track.enabled = !this.muted;
      pc.addTrack(track, micStream);
    }
    pc.ontrack = (event) => {
      const stream = _nullishCoalesce(event.streams[0], () => ( new MediaStream([event.track])));
      const element = this.createAudioElement();
      this.audioElement = element;
      element.muted = true;
      element.srcObject = stream;
      void Promise.resolve(element.play()).catch(() => {
      });
      _optionalChain([this, 'access', _57 => _57.options, 'access', _58 => _58.onRemoteTrack, 'optionalCall', _59 => _59(stream)]);
    };
    const channel = pc.createDataChannel("oai-events");
    this.dataChannel = channel;
    let settled = false;
    let readyResolve = () => {
    };
    let readyReject = () => {
    };
    const channelReady = new Promise((resolve, reject) => {
      readyResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      readyReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
    });
    channelReady.catch(() => {
    });
    channel.onmessage = (event) => this.handleMessage(event.data);
    channel.onopen = () => readyResolve();
    channel.onclose = () => {
      readyReject(new Error("Realtime data channel closed before opening"));
      this.reportClosed("data_channel_closed");
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "failed":
        case "closed":
          this.clearDisconnectTimer();
          readyReject(new Error(`Realtime peer connection ${pc.connectionState} before data channel opened`));
          this.reportClosed(`peer_${pc.connectionState}`);
          break;
        case "disconnected":
          if (this.disconnectTimer === null) {
            this.disconnectTimer = this.schedule(() => {
              this.disconnectTimer = null;
              if (this.pc === pc && pc.connectionState === "disconnected") {
                readyReject(new Error("Realtime peer connection stayed disconnected"));
                this.reportClosed("peer_disconnected");
              }
            }, PEER_DISCONNECTED_GRACE_MS);
          }
          break;
        case "connected":
        case "connecting":
        case "new":
          this.clearDisconnectTimer();
          break;
        default: {
          const exhaustive = pc.connectionState;
          return exhaustive;
        }
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await this.fetchImpl(`${this.baseUrl}?model=${encodeURIComponent(this.options.model)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.secret}`, "Content-Type": "application/sdp" },
        body: _nullishCoalesce(offer.sdp, () => ( ""))
      });
      if (!response.ok) throw new Error(`Realtime SDP exchange failed: ${response.status}`);
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      this.teardown();
      throw error;
    }
    if (channel.readyState === "open") readyResolve();
    const timer = this.schedule(() => {
      readyReject(new Error("Timed out waiting for the Realtime data channel to open"));
    }, DATA_CHANNEL_READY_TIMEOUT_MS);
    try {
      await channelReady;
    } catch (error) {
      this.teardown();
      throw error;
    } finally {
      this.cancel(timer);
    }
  }
  /** A page-side fact or re-seed as a text conversation item; no response is created. */
  sendText(text) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: this.textRole, content: [{ type: "input_text", text }] }
    });
  }
  /**
   * A screenshot the interviewer asked for (`look_at_screen`). Image content is
   * only valid on a `user` message, so the role is fixed here regardless of
   * `textRole`; the caption travels in the same item so the model reads them
   * together.
   */
  sendImage(text, jpegBase64) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          { type: "input_image", image_url: `data:image/jpeg;base64,${jpegBase64}` },
          { type: "input_text", text }
        ]
      }
    });
  }
  /** The `function_call_output` item alone; the interviewer decides whether a response follows (KTD6). */
  sendToolResult(result) {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: result.call_id, output: JSON.stringify(result.output) }
    });
  }
  createResponse() {
    this.send({ type: "response.create" });
  }
  cancelResponse() {
    this.send({ type: "response.cancel" });
  }
  updateSession(patch) {
    this.send({ type: "session.update", session: patch });
  }
  setMuted(muted) {
    this.muted = muted;
    for (const track of this.options.micStream.getAudioTracks()) track.enabled = !muted;
    if (!this.pc) return;
    for (const sender of this.pc.getSenders()) {
      if (_optionalChain([sender, 'access', _60 => _60.track, 'optionalAccess', _61 => _61.kind]) === "audio") sender.track.enabled = !muted;
    }
  }
  close() {
    this.closedReported = true;
    this.teardown();
  }
  handleMessage(data) {
    let raw;
    try {
      raw = JSON.parse(String(data));
    } catch (error) {
      _optionalChain([this, 'access', _62 => _62.onParseError, 'optionalCall', _63 => _63(error, data)]);
      return;
    }
    const t = this.elapsed();
    const event = parseRealtimeEvent(raw, {
      t,
      utteranceStart: this.utteranceStart,
      utteranceEnd: this.utteranceEnd,
      spans: this.spans
    });
    if (!event) return;
    const itemId = asString(asRecord(raw).item_id);
    if (event.type === "speech_started") {
      this.utteranceStart = event.t;
      this.utteranceEnd = null;
      if (itemId) this.rememberSpan(itemId, { start: event.t, end: null });
    } else if (event.type === "speech_stopped") {
      this.utteranceEnd = event.t;
      const span = itemId ? this.spans.get(itemId) : void 0;
      if (span) span.end = event.t;
      else if (itemId && this.utteranceStart !== null) this.rememberSpan(itemId, { start: this.utteranceStart, end: event.t });
    } else if (event.type === "transcript" && itemId) {
      this.spans.delete(itemId);
    }
    this.dispatch(event);
  }
  dispatch(event) {
    const handlers = this.handlers;
    if (!handlers) return;
    try {
      const result = handlers.onEvent(event);
      if (result && typeof result.catch === "function") {
        result.catch((error) => _optionalChain([this, 'access', _64 => _64.onParseError, 'optionalCall', _65 => _65(error, event)]));
      }
    } catch (error) {
      _optionalChain([this, 'access', _66 => _66.onParseError, 'optionalCall', _67 => _67(error, event)]);
    }
  }
  rememberSpan(itemId, span) {
    this.spans.set(itemId, span);
    while (this.spans.size > UTTERANCE_SPAN_LIMIT) {
      const oldest = this.spans.keys().next().value;
      if (oldest === void 0) break;
      this.spans.delete(oldest);
    }
  }
  /** A lost call: tell the interviewer once, then release the peer, element, and mic clone. */
  reportClosed(reason) {
    if (this.closedReported) return;
    this.closedReported = true;
    this.dispatch({ type: "closed", reason });
    this.teardown();
  }
  clearDisconnectTimer() {
    if (this.disconnectTimer !== null) {
      this.cancel(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }
  teardown() {
    this.clearDisconnectTimer();
    const channel = this.dataChannel;
    this.dataChannel = null;
    if (channel) {
      channel.onmessage = null;
      channel.onopen = null;
      channel.onclose = null;
      try {
        channel.close();
      } catch (e6) {
      }
    }
    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch (e7) {
      }
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
  }
  send(payload) {
    const channel = this.dataChannel;
    if (!channel || channel.readyState !== "open") throw new Error("Realtime data channel is not open");
    channel.send(JSON.stringify(payload));
  }
};
function createRealtimeConnector(options) {
  const audioContext = options.audioContext === void 0 ? createDefaultAudioContext() : options.audioContext;
  let route = null;
  let client = null;
  const disposeRoute = () => {
    _optionalChain([route, 'optionalAccess', _68 => _68.dispose, 'call', _69 => _69()]);
    route = null;
  };
  return {
    connect: (secret) => {
      _optionalChain([client, 'optionalAccess', _70 => _70.close, 'call', _71 => _71()]);
      disposeRoute();
      const micStream = options.microphone.clone("realtime");
      client = new RealtimeClient({
        secret: secret.client_secret,
        model: secret.model,
        micStream,
        onRemoteTrack: (stream) => {
          disposeRoute();
          if (audioContext) route = routeRemoteAudio(audioContext, stream);
        },
        deps: { ...options.deps, elapsed: options.elapsed }
      });
      return client;
    },
    get route() {
      return route;
    },
    get client() {
      return client;
    },
    dispose: () => {
      _optionalChain([client, 'optionalAccess', _72 => _72.close, 'call', _73 => _73()]);
      client = null;
      disposeRoute();
      options.microphone.release("realtime");
    }
  };
}

// src/live/realtime/mint.ts
var MINT_MAX_CONSECUTIVE_THROTTLES = 3;
var MINT_DEFAULT_RETRY_AFTER_S = 2;
var MINT_NETWORK_RETRY_MS = 2e3;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJson(response) {
  try {
    const body = await response.json();
    return isRecord2(body) ? body : null;
  } catch (e8) {
    return null;
  }
}
function retryAfterMs(body, response) {
  const fromBody = _optionalChain([body, 'optionalAccess', _74 => _74.retry_after]);
  if (typeof fromBody === "number" && Number.isFinite(fromBody) && fromBody >= 0) return fromBody * 1e3;
  const header = _optionalChain([response, 'access', _75 => _75.headers, 'optionalAccess', _76 => _76.get, 'optionalCall', _77 => _77("Retry-After")]);
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return fromHeader * 1e3;
  return MINT_DEFAULT_RETRY_AFTER_S * 1e3;
}
function refusalReason(status, body) {
  const reason = _optionalChain([body, 'optionalAccess', _78 => _78.reason]);
  switch (reason) {
    case "tls_required":
    case "openai_error":
    case "no_key":
    case "brief_contains_secret":
      return reason;
    default:
      break;
  }
  if (status === 401) return "unauthorized";
  if (status === 403) return "tls_required";
  return "unknown";
}
function parseSecret(body) {
  if (!body) return null;
  const { client_secret, expires_at, model } = body;
  if (typeof client_secret !== "string" || client_secret.length === 0) return null;
  if (typeof expires_at !== "number" || typeof model !== "string") return null;
  return { client_secret, expires_at, model };
}
async function mint(options) {
  const fetchImpl = _nullishCoalesce(options.fetch, () => ( ((input, init) => fetch(input, init))));
  const request = { session_id: options.sessionId };
  let response;
  try {
    response = await fetchImpl(`${options.endpoint}/mint`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        [_chunk4XWUXLDEcjs.LIVE_SESSION_HEADER]: options.sessionId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
  } catch (error) {
    return { ok: false, retryable: true, kind: "network_error", retryAfterMs: MINT_NETWORK_RETRY_MS, error };
  }
  const body = await readJson(response);
  if (response.ok) {
    const secret = parseSecret(body);
    if (secret) return { ok: true, secret };
    return { ok: false, retryable: false, kind: "refused", status: response.status, reason: "invalid_response" };
  }
  if (response.status === 429) {
    return { ok: false, retryable: true, kind: "throttled", status: 429, retryAfterMs: retryAfterMs(body, response) };
  }
  const upstream = _optionalChain([body, 'optionalAccess', _79 => _79.upstream_status]);
  return {
    ok: false,
    retryable: false,
    kind: "refused",
    status: response.status,
    reason: refusalReason(response.status, body),
    ...typeof upstream === "number" ? { upstreamStatus: upstream } : {}
  };
}
async function mintWithRetry(options) {
  const max = _nullishCoalesce(options.maxConsecutiveRetryable, () => ( MINT_MAX_CONSECUTIVE_THROTTLES));
  const schedule = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
  const shouldContinue = _nullishCoalesce(options.shouldContinue, () => ( (() => true)));
  let attempts = 0;
  let consecutive = 0;
  for (; ; ) {
    if (!shouldContinue()) return { ok: false, kind: "abandoned", attempts };
    attempts += 1;
    const outcome = await mint(options);
    if (outcome.ok) return { ok: true, secret: outcome.secret, attempts };
    if (!outcome.retryable) {
      return {
        ok: false,
        kind: "refused",
        status: outcome.status,
        reason: outcome.reason,
        ...outcome.upstreamStatus !== void 0 ? { upstreamStatus: outcome.upstreamStatus } : {},
        attempts
      };
    }
    consecutive += 1;
    if (consecutive >= max) return { ok: false, kind: "exhausted", reason: outcome.kind, attempts };
    _optionalChain([options, 'access', _80 => _80.onRetry, 'optionalCall', _81 => _81(outcome, attempts)]);
    await new Promise((resolve) => {
      schedule(resolve, outcome.retryAfterMs);
    });
  }
}

// src/live/realtime/interviewer.ts
var QUESTION_SILENCE_MS = 1500;
var RESEED_MAX_CHARS = 6e3;
var RESEED_WINDOW_MS = 12e4;
var ANCHOR_RECENCY_MS = 8e3;
var CLICK_ANNOUNCE_DEDUPE_MS = 1e3;
var PROACTIVE_FRAME_MIN_INTERVAL_MS = 5e3;
var MIN_UNIT_WORDS = 3;
var CONNECT_MAX_ATTEMPTS = 3;
var RESPONSE_CONFIRM_TIMEOUT_MS = 1e4;
var RESPONSE_GATE_RESET_MS = 45e3;
var PENDING_TEXT_LIMIT = 50;
var NO_FRAME_DETAIL = "The screen is not being shared, or frame capture is paused, so no screenshot is available; ask the riffer to describe what they see.";
var FRAMES_DISABLED_DETAIL = "This session's evidence profile does not let screenshots leave the page; ask the riffer to describe what they see.";
var VISUAL_REFERENCE_WORDS = /* @__PURE__ */ new Set([
  // English
  "this",
  "that",
  "these",
  "those",
  "here",
  "there",
  "look",
  "see",
  "watch",
  "screen",
  "color",
  "colour",
  "colors",
  "colours",
  "layout",
  "spacing",
  "align",
  "aligned",
  "font",
  "icon",
  "image",
  "picture",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "black",
  "white",
  "gray",
  "grey",
  "bigger",
  "smaller",
  "larger",
  "wider",
  "narrower",
  "taller",
  "shorter",
  "ugly",
  "pretty",
  "nicer",
  // Dutch
  "dit",
  "deze",
  "dat",
  "die",
  "hier",
  "daar",
  "kijk",
  "zie",
  "kleur",
  "kleuren",
  "scherm",
  "mooier",
  "lelijk",
  "groter",
  "kleiner",
  "plaatje",
  // German
  "dies",
  "dieses",
  "diese",
  "dieser",
  "das",
  "dort",
  "schau",
  "siehst",
  "farbe",
  "gr\xF6\xDFer",
  "bildschirm",
  // French
  "ceci",
  "cela",
  "\xE7a",
  "ici",
  "l\xE0",
  "regarde",
  "vois",
  "couleur",
  "\xE9cran",
  // Spanish
  "esto",
  "esta",
  "este",
  "eso",
  "esa",
  "ese",
  "aqu\xED",
  "ah\xED",
  "all\xED",
  "mira",
  "ves",
  "pantalla"
]);
function isVisualReference(text) {
  return words(text).some((token) => VISUAL_REFERENCE_WORDS.has(token));
}
var CHANGE_VERBS = /* @__PURE__ */ new Set([
  "add",
  "align",
  "animate",
  "bigger",
  "bold",
  "bolder",
  "bump",
  "center",
  "centre",
  "change",
  "collapse",
  "color",
  "colour",
  "darken",
  "darker",
  "decrease",
  "delete",
  "disable",
  "drop",
  "duplicate",
  "enable",
  "enlarge",
  "expand",
  "fix",
  "flip",
  "grow",
  "hide",
  "increase",
  "indent",
  "invert",
  "italic",
  "kill",
  "larger",
  "lighten",
  "lighter",
  "lose",
  "lower",
  "make",
  "move",
  "nudge",
  "pad",
  "put",
  "raise",
  "reduce",
  "remove",
  "rename",
  "reorder",
  "replace",
  "resize",
  "restyle",
  "reword",
  "rotate",
  "round",
  "scale",
  "shift",
  "shorten",
  "show",
  "shrink",
  "smaller",
  "sort",
  "space",
  "split",
  "stack",
  "swap",
  "tighten",
  "toggle",
  "turn",
  "underline",
  "undo",
  "unhide",
  "use",
  "widen",
  "wrap"
]);
function words(text) {
  return (_nullishCoalesce(text.toLowerCase().match(/[\p{L}\p{N}']+/gu), () => ( []))).filter((word) => word.length > 0);
}
function isNoiseTranscript(text) {
  const tokens = words(text);
  if (tokens.length === 0) return true;
  if (tokens.length >= MIN_UNIT_WORDS) return false;
  return !tokens.some((token) => CHANGE_VERBS.has(token));
}
function buildReseedText(input) {
  const windowMs = _nullishCoalesce(input.windowMs, () => ( RESEED_WINDOW_MS));
  const maxChars = _nullishCoalesce(input.maxChars, () => ( RESEED_MAX_CHARS));
  const header = "[RECONNECT] Your connection was replaced mid-session. Do not greet or recap aloud. Continue listening. Context so far:";
  const unitLines = input.units.filter((unit) => unit.status !== "withdrawn").map((unit) => `- ${unit.id} (${unit.status}): ${unit.statement}`);
  const transcriptLines = input.transcript.filter((entry) => entry.final && entry.text.trim().length > 0 && entry.t_end >= input.t - windowMs).map((entry) => `${entry.role}: ${entry.text.trim()}`);
  const assemble = (units2, lines2) => {
    const parts = [header];
    if (units2.length > 0) parts.push(`Units on the board:
${units2.join("\n")}`);
    if (lines2.length > 0) parts.push(`Recent transcript:
${lines2.join("\n")}`);
    return parts.join("\n\n");
  };
  let units = unitLines;
  let lines = transcriptLines;
  let text = assemble(units, lines);
  while (text.length > maxChars && lines.length > 0) {
    lines = lines.slice(1);
    text = assemble(units, lines);
  }
  while (text.length > maxChars && units.length > 0) {
    units = units.slice(1);
    text = assemble(units, lines);
  }
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
var PANEL_NOTE = "The riffrec panel docked at the top right is not part of the app.";
function describeTrigger(trigger) {
  switch (trigger) {
    case "click":
      return "attached because they just clicked there";
    case "drawing":
      return "attached because they just drew there";
    case "speech":
      return "attached because they referred to something on screen";
    default: {
      const exhaustive = trigger;
      return exhaustive;
    }
  }
}
function formatQuestion(question) {
  return `[ENDPOINT QUESTION] The coding agent asks about unit ${question.unit_id}: "${question.question}" Read it to the riffer in your own words, then relay their answer with relay_answer for that unit.`;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
var Interviewer = class {
  constructor(options) {
    this.transport = null;
    this.connecting = false;
    this.stopped = false;
    this.generation = 0;
    this.connections = 0;
    this.mintAttempts = 0;
    this.unavailable = null;
    this.responseActive = false;
    this.rifferSpeaking = false;
    this.silenceAnchor = 0;
    this.flushTimer = null;
    this.gateTimer = null;
    /** A `look_at_screen` answered while a response was active: the model continues once that response settles. */
    this.responseOwedAfterTool = false;
    this.queue = [];
    this.voicing = null;
    this.voicingInterrupted = false;
    this.pendingItems = [];
    this.announced = [];
    this.lastAnnouncedClick = null;
    this.lastRifferTranscript = null;
    this.nextAnchorId = 1;
    /** Epoch ms of the last frame that reached the interviewer; 0 before the first. */
    this.lastFrameAt = 0;
    this.frameInFlight = false;
    this.framesShown = 0;
    this.unsubscribe = [];
    this.session = options.session;
    this.connectTransport = options.connect;
    this.microphone = _nullishCoalesce(options.microphone, () => ( null));
    this.evidence = _nullishCoalesce(options.evidence, () => ( null));
    this.fetchImpl = options.fetch;
    this.now = _nullishCoalesce(options.now, () => ( (() => Date.now())));
    this.schedule = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.cancel = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
    this.questionSilenceMs = _nullishCoalesce(options.questionSilenceMs, () => ( QUESTION_SILENCE_MS));
    this.reseedMaxChars = _nullishCoalesce(options.reseedMaxChars, () => ( RESEED_MAX_CHARS));
    this.reseedWindowMs = _nullishCoalesce(options.reseedWindowMs, () => ( RESEED_WINDOW_MS));
    this.anchorRecencyMs = _nullishCoalesce(options.anchorRecencyMs, () => ( ANCHOR_RECENCY_MS));
    this.screenFrames = _nullishCoalesce(options.screenFrames, () => ( true));
    this.proactiveFrameMinIntervalMs = _nullishCoalesce(options.proactiveFrameMinIntervalMs, () => ( PROACTIVE_FRAME_MIN_INTERVAL_MS));
    this.resolveAnchorOverride = options.resolveAnchor;
    this.onError = _nullishCoalesce(options.onError, () => ( (() => {
    })));
    this.onStatus = _nullishCoalesce(options.onStatus, () => ( null));
    this.silenceAnchor = this.now();
    this.unsubscribe.push(
      this.session.on("ask", ({ question }) => this.enqueueQuestion(question)),
      this.session.on("ended", () => this.stop())
    );
  }
  // ---------------------------------------------------------------------
  // Lifecycle (U7)
  // ---------------------------------------------------------------------
  /** Mints, connects, and moves the session to `live`; resolves when settled either way. */
  async start() {
    if (this.stopped) return;
    for (const question of this.session.openQuestions()) this.enqueueQuestion(question);
    await this.connectVoice(this.session.voiceState === "reconnecting");
  }
  /** Explicit re-attempt after a settled refusal (the "later retry hook"). */
  async retryVoice() {
    if (this.stopped || this.transport || this.connecting) return;
    await this.connectVoice(this.connections > 0 || this.session.voiceState === "reconnecting");
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.generation += 1;
    this.clearFlushTimer();
    this.clearGateTimer();
    this.responseOwedAfterTool = false;
    for (const off of this.unsubscribe.splice(0)) off();
    const transport = this.transport;
    this.transport = null;
    if (transport) {
      try {
        transport.close();
      } catch (error) {
        this.onError(error);
      }
    }
    _optionalChain([this, 'access', _82 => _82.microphone, 'optionalAccess', _83 => _83.release, 'call', _84 => _84("realtime")]);
    this.emitStatus();
  }
  get status() {
    return {
      connected: this.transport !== null,
      connecting: this.connecting,
      responseActive: this.responseActive,
      rifferSpeaking: this.rifferSpeaking,
      queuedQuestions: this.queue.map((entry) => _nullishCoalesce(this.session.questionFor(entry.unit_id), () => ( toUnitQuestion(entry)))),
      voicing: this.voicing ? _nullishCoalesce(this.session.questionFor(this.voicing.unit_id), () => ( toUnitQuestion(this.voicing))) : null,
      unavailable: this.unavailable,
      mintAttempts: this.mintAttempts,
      connections: this.connections,
      framesShown: this.framesShown
    };
  }
  // ---------------------------------------------------------------------
  // Page-side hooks (U5, U6)
  // ---------------------------------------------------------------------
  /** The mute hook: flips every microphone clone, the Realtime sender, and the session's mic state together (KTD21). */
  setMuted(muted) {
    if (this.session.isMuted === muted) return;
    _optionalChain([this, 'access', _85 => _85.microphone, 'optionalAccess', _86 => _86.setMuted, 'call', _87 => _87(muted)]);
    if (this.transport) {
      try {
        this.transport.setMuted(muted);
      } catch (error) {
        this.onError(error);
      }
    }
    this.session.setMuted(muted);
    this.announce(muted ? "The riffer muted their microphone; expect silence." : "The riffer unmuted their microphone.");
  }
  /** A completed stroke or pin (KTD5): the interviewer learns the element by name and by anchor id, and sees the view. */
  announceDrawing(drawing) {
    const entry = this.rememberAnchor(drawing.anchor, drawing.description, drawing.anchorId);
    const verb = drawing.kind === "pin" ? "pinned" : "drew on";
    this.announce(`The riffer ${verb} ${drawing.description} (anchor id: ${entry.id}).`);
    void this.attachFrame("drawing");
    return entry;
  }
  /** An anchor the page resolved without a gesture to report; silent, but available to "this"/"that" resolution. */
  noteAnchor(anchor, description, anchorId) {
    return this.rememberAnchor(anchor, description, anchorId);
  }
  /**
   * A click the page anchored: the interviewer learns the element by name and
   * by anchor id as it happens, so "this" and "here" resolve without asking.
   * Repeated clicks on the same element inside `CLICK_ANNOUNCE_DEDUPE_MS`
   * refresh the anchor but send no second note.
   */
  announceClick(anchor, description, anchorId) {
    const now = this.elapsed();
    const last = this.lastAnnouncedClick;
    const repeat = last !== null && last.selector === anchor.selector && now - last.t <= CLICK_ANNOUNCE_DEDUPE_MS;
    const entry = this.rememberAnchor(anchor, description, _nullishCoalesce(anchorId, () => ( (repeat ? last.id : void 0))));
    this.lastAnnouncedClick = { selector: anchor.selector, t: now, id: entry.id };
    if (!repeat) {
      this.announce(`The riffer clicked ${description} (anchor id: ${entry.id}).`);
      void this.attachFrame("click");
    }
    return entry;
  }
  announceBuffering(state) {
    this.announce(
      state === "buffering" ? "The page lost its connection to the coding agent and is buffering; units still land on the board." : "The page reconnected to the coding agent; buffered units were delivered."
    );
  }
  /** Any page-side fact as a text item; held while a response is active or the link is down (KTD6). */
  announce(text) {
    this.deliver({ kind: "text", text: `[PAGE] ${text}` });
  }
  announcedAnchors() {
    return [...this.announced];
  }
  /**
   * Shows the interviewer the screen without being asked: after a click or a
   * drawing, or when the riffer's words point at something on screen. One frame
   * per `proactiveFrameMinIntervalMs` at most, and never while another grab is
   * in flight, so a click burst or a long sentence costs one image.
   */
  async attachFrame(trigger) {
    if (!this.screenFrames || !_optionalChain([this, 'access', _88 => _88.evidence, 'optionalAccess', _89 => _89.lookAtScreen]) || this.stopped || !this.transport) return;
    if (this.frameInFlight || this.now() - this.lastFrameAt < this.proactiveFrameMinIntervalMs) return;
    this.frameInFlight = true;
    try {
      const look = await this.evidence.lookAtScreen();
      if (!look || look.frame.jpeg_base64.length === 0 || this.stopped) return;
      this.lastFrameAt = this.now();
      this.deliver({
        kind: "image",
        text: `[PAGE] Screenshot of the riffer's current view on ${look.frame.route}, ${describeTrigger(trigger)} (frame id: ${look.frame.id}). ${PANEL_NOTE}`,
        jpegBase64: look.frame.jpeg_base64,
        frameId: look.frame.id
      });
    } catch (error) {
      this.onError(error);
    } finally {
      this.frameInFlight = false;
    }
  }
  deliver(item) {
    if (this.stopped) return;
    if (!this.transport || this.responseActive) {
      this.pendingItems.push(item);
      if (this.pendingItems.length > PENDING_TEXT_LIMIT) this.pendingItems.shift();
      return;
    }
    this.sendItem(this.transport, item);
  }
  sendItem(transport, item) {
    switch (item.kind) {
      case "text":
        this.sendText(item.text);
        return;
      case "image":
        this.sendFrame(transport, item);
        return;
      default: {
        const exhaustive = item;
        return exhaustive;
      }
    }
  }
  /** One image item to the model; on success the frame counts against the rate limit and is released to the endpoint. */
  sendFrame(transport, item) {
    try {
      transport.sendImage(item.text, item.jpegBase64);
    } catch (error) {
      this.onError(error);
      return false;
    }
    this.lastFrameAt = this.now();
    this.framesShown += 1;
    _optionalChain([this, 'access', _90 => _90.evidence, 'optionalAccess', _91 => _91.frameShown, 'optionalCall', _92 => _92(item.frameId)]);
    return true;
  }
  // ---------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------
  async connectVoice(reconnect) {
    if (this.stopped || this.connecting || this.transport) return;
    const endpoint = this.session.endpoint;
    const token = this.session.pageToken;
    if (!endpoint || !token) {
      this.unavailable = { kind: "no_endpoint" };
      this.session.voiceUnavailable();
      this.emitStatus();
      return;
    }
    const generation = ++this.generation;
    const alive = () => !this.stopped && generation === this.generation && this.session.status !== "ended";
    this.connecting = true;
    this.unavailable = null;
    this.session.voiceConnecting();
    this.emitStatus();
    try {
      for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt += 1) {
        const minted = await this.mint(alive);
        if (!alive()) return;
        if (!minted.ok) {
          this.settleUnavailable(minted);
          return;
        }
        try {
          const transport = await this.connectTransport(minted.secret);
          if (!alive()) {
            transport.close();
            return;
          }
          const connectResult = transport.connect({ onEvent: (event) => this.handleEvent(transport, event) });
          if (connectResult) await connectResult;
          if (!alive()) {
            transport.close();
            return;
          }
          this.becomeConnected(transport, reconnect);
          return;
        } catch (error) {
          this.onError(error);
          if (attempt === CONNECT_MAX_ATTEMPTS) {
            this.unavailable = { kind: "connect_failed", message: error instanceof Error ? error.message : String(error) };
            this.session.voiceUnavailable();
            return;
          }
        }
      }
    } finally {
      if (generation === this.generation) this.connecting = false;
      this.emitStatus();
    }
  }
  async mint(alive) {
    const result = await mintWithRetry({
      endpoint: this.session.endpoint,
      token: this.session.pageToken,
      sessionId: this.session.id,
      fetch: this.fetchImpl,
      setTimeout: this.schedule,
      clearTimeout: this.cancel,
      shouldContinue: alive,
      onRetry: () => this.emitStatus()
    });
    this.mintAttempts += result.attempts;
    return result;
  }
  settleUnavailable(result) {
    switch (result.kind) {
      case "abandoned":
        return;
      case "refused":
        this.unavailable = {
          kind: "refused",
          reason: result.reason,
          status: result.status,
          ...result.upstreamStatus !== void 0 ? { upstreamStatus: result.upstreamStatus } : {}
        };
        break;
      case "exhausted":
        this.unavailable = { kind: "exhausted", reason: result.reason };
        break;
      default: {
        const exhaustive = result;
        return exhaustive;
      }
    }
    this.session.voiceUnavailable();
  }
  becomeConnected(transport, reconnect) {
    this.transport = transport;
    this.connections += 1;
    this.responseActive = false;
    this.responseOwedAfterTool = false;
    this.rifferSpeaking = false;
    this.voicing = null;
    this.voicingInterrupted = false;
    this.silenceAnchor = this.now();
    if (reconnect) {
      this.sendText(
        buildReseedText({
          transcript: this.session.fullTranscript(),
          units: this.session.allUnits(),
          t: this.elapsed(),
          windowMs: this.reseedWindowMs,
          maxChars: this.reseedMaxChars
        })
      );
    }
    if (this.session.isMuted) {
      try {
        transport.setMuted(true);
      } catch (error) {
        this.onError(error);
      }
    }
    this.flushPendingTexts();
    this.session.voiceConnected();
    this.scheduleFlush();
  }
  handleLost() {
    const lost = this.transport;
    this.transport = null;
    if (lost) {
      try {
        lost.close();
      } catch (error) {
        this.onError(error);
      }
    }
    this.clearFlushTimer();
    this.clearGateTimer();
    this.responseActive = false;
    this.responseOwedAfterTool = false;
    const texts = this.pendingItems.filter((item) => item.kind === "text");
    this.pendingItems.splice(0, this.pendingItems.length, ...texts);
    if (this.voicing) {
      this.requeue(this.voicing);
      this.voicing = null;
    }
    if (this.stopped) return;
    this.session.voiceLost();
    this.emitStatus();
    void this.connectVoice(true).catch((error) => this.onError(error));
  }
  // ---------------------------------------------------------------------
  // Server events
  // ---------------------------------------------------------------------
  handleEvent(transport, event) {
    if (transport !== this.transport && event.type !== "closed") return;
    switch (event.type) {
      case "session_created":
        this.applySessionConfig(transport, event.session);
        break;
      case "speech_started":
        this.rifferSpeaking = true;
        this.clearFlushTimer();
        if (this.voicing) this.voicingInterrupted = true;
        this.session.speechStarted();
        _optionalChain([this, 'access', _93 => _93.evidence, 'optionalAccess', _94 => _94.speechStarted, 'optionalCall', _95 => _95()]);
        break;
      case "speech_stopped":
        this.rifferSpeaking = false;
        this.silenceAnchor = this.now();
        this.session.speechStopped();
        _optionalChain([this, 'access', _96 => _96.evidence, 'optionalAccess', _97 => _97.speechStopped, 'optionalCall', _98 => _98()]);
        this.scheduleFlush();
        break;
      case "transcript":
        this.handleTranscript(event.transcript);
        break;
      case "tool_call":
        this.handleToolCall(event.call);
        break;
      case "response_started":
        this.responseActive = true;
        this.clearFlushTimer();
        this.armGateTimer(RESPONSE_GATE_RESET_MS, "response.done never arrived");
        break;
      case "response_done":
        this.responseActive = false;
        this.clearGateTimer();
        this.silenceAnchor = this.now();
        if (this.voicing) {
          if (this.voicingInterrupted) this.requeue(this.voicing);
          this.voicing = null;
          this.voicingInterrupted = false;
        }
        this.flushPendingTexts();
        if (this.responseOwedAfterTool) {
          this.responseOwedAfterTool = false;
          this.createResponseNow(transport, "look_at_screen follow-up");
        }
        this.scheduleFlush();
        break;
      case "error":
        this.handleError(event.message);
        break;
      case "closed":
        if (transport === this.transport) this.handleLost();
        break;
      default: {
        const exhaustive = event;
        return exhaustive;
      }
    }
    this.emitStatus();
  }
  handleTranscript(transcript) {
    if (transcript.text.trim().length === 0) return;
    if (transcript.role === "riffer") {
      this.lastRifferTranscript = transcript;
      if (isVisualReference(transcript.text)) void this.attachFrame("speech");
    }
    this.session.addTranscript(transcript);
  }
  handleError(message) {
    this.onError(new Error(`riffrec live interviewer: ${message}`));
    if (message.includes("conversation_already_has_active_response")) {
      if (this.voicing) {
        this.requeue(this.voicing);
        this.voicing = null;
        this.voicingInterrupted = false;
      }
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, "no response.done after a busy error");
    }
  }
  /**
   * `session.created`: the endpoint's mint owns the persona and may override
   * any tool it copied; the page adds only what it must be able to answer
   * (missing tools, the screen-context section) and leaves the rest alone.
   */
  applySessionConfig(transport, session) {
    const patch = reconcileSessionConfig(session);
    if (!patch) return;
    try {
      transport.updateSession({ type: "realtime", ...patch });
    } catch (error) {
      this.onError(error);
    }
  }
  // ---------------------------------------------------------------------
  // Tools (KTD5)
  // ---------------------------------------------------------------------
  handleToolCall(call) {
    const transport = this.transport;
    if (!transport) return;
    if (call.name === "look_at_screen") {
      void this.lookAtScreen(transport, call).catch((error) => this.onError(error));
      return;
    }
    let output;
    try {
      output = this.runTool(call);
    } catch (error) {
      this.onError(error);
      output = { ok: false, reason: "tool_error", message: error instanceof Error ? error.message : String(error) };
    }
    this.sendToolResult(transport, { call_id: call.call_id, output });
    this.scheduleFlush();
  }
  runTool(call) {
    switch (call.name) {
      case "record_unit":
        return this.recordUnit(call.arguments);
      case "update_unit":
        return this.updateUnit(call.arguments);
      case "withdraw_unit":
        return this.withdrawUnit(call.arguments);
      case "relay_answer":
        return this.relayAnswer(call.arguments);
      default: {
        const exhaustive = call;
        return exhaustive;
      }
    }
  }
  /**
   * `look_at_screen`: the page grabs the current view, attaches it as an image
   * item, answers the call, and — unlike every other tool (KTD6) — asks for a
   * response, because the model called it mid-answer and would otherwise fall
   * silent until the riffer speaks again.
   */
  async lookAtScreen(transport, call) {
    let look = null;
    if (this.screenFrames) {
      try {
        look = await _asyncNullishCoalesce(await _optionalChain([this, 'access', _99 => _99.evidence, 'optionalAccess', _100 => _100.lookAtScreen, 'optionalCall', _101 => _101()]), async () => ( null));
      } catch (error) {
        this.onError(error);
      }
    }
    if (this.transport !== transport || this.stopped) return;
    let output;
    if (!this.screenFrames) {
      output = { ok: false, reason: "frames_disabled", detail: FRAMES_DISABLED_DETAIL };
    } else if (!look || look.frame.jpeg_base64.length === 0) {
      output = { ok: false, reason: "no_frame", detail: NO_FRAME_DETAIL };
    } else {
      const ageMs = Math.max(0, Math.round(this.elapsed() - look.frame.t));
      const when = look.fresh ? "captured just now" : `captured ${Math.max(1, Math.round(ageMs / 1e3))} s ago`;
      const sent = this.sendFrame(transport, {
        kind: "image",
        text: `[PAGE] Screenshot of the riffer's current view on ${look.frame.route}, ${when} (frame id: ${look.frame.id}). ${PANEL_NOTE}`,
        jpegBase64: look.frame.jpeg_base64,
        frameId: look.frame.id
      });
      output = sent ? { ok: true, frame_id: look.frame.id, route: look.frame.route, age_ms: ageMs, fresh: look.fresh } : { ok: false, reason: "send_failed", detail: NO_FRAME_DETAIL };
    }
    this.sendToolResult(transport, { call_id: call.call_id, output });
    if (this.responseActive) this.responseOwedAfterTool = true;
    else this.createResponseNow(transport, "look_at_screen follow-up");
    this.emitStatus();
  }
  sendToolResult(transport, result) {
    try {
      transport.sendToolResult(result);
    } catch (error) {
      this.onError(error);
    }
  }
  /** `response.create` with the same confirmation gate a voiced question uses. */
  createResponseNow(transport, why) {
    try {
      transport.createResponse();
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, `${why}: response.create was never confirmed`);
    } catch (error) {
      this.onError(error);
    }
  }
  recordUnit(args) {
    const raw = args;
    if (!isRecord3(raw) || typeof raw.statement !== "string" || raw.statement.trim().length === 0) {
      return { ok: false, reason: "invalid_arguments", detail: "statement is required" };
    }
    const statement = raw.statement.trim();
    const excerpt = typeof raw.transcript_excerpt === "string" ? raw.transcript_excerpt.trim() : "";
    const refs = stringList(raw.anchors);
    const spoken = excerpt.length > 0 ? excerpt : statement;
    if (isNoiseTranscript(spoken)) {
      return {
        ok: false,
        reason: "noise",
        detail: "Fewer than three words and no change verb; not a unit. Wait for a concrete request."
      };
    }
    const { anchors, unresolved } = this.resolveAnchors(refs);
    const span = this.lastRifferTranscript ? { t_start: this.lastRifferTranscript.t_start, t_end: this.lastRifferTranscript.t_end } : void 0;
    const input = {
      statement,
      transcript_excerpt: excerpt,
      anchors,
      ...span ? { evidence: { transcript_span: span } } : {}
    };
    const unit = _optionalChain([this, 'access', _102 => _102.evidence, 'optionalAccess', _103 => _103.recordUnit]) ? this.evidence.recordUnit(input) : this.session.recordUnit(input);
    return {
      ok: true,
      unit_id: unit.id,
      anchors_resolved: anchors.length,
      ...unresolved.length > 0 ? { anchors_unresolved: unresolved } : {}
    };
  }
  updateUnit(args) {
    const raw = args;
    if (!isRecord3(raw) || typeof raw.unit_id !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id is required" };
    }
    const refs = stringList(raw.anchors_add);
    const { anchors, unresolved } = this.resolveAnchors(refs);
    const statement = typeof raw.statement === "string" && raw.statement.trim().length > 0 ? raw.statement.trim() : void 0;
    const result = this.session.updateUnit(raw.unit_id, {
      ...statement !== void 0 ? { statement } : {},
      ...anchors.length > 0 ? { anchors_add: anchors } : {}
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        detail: result.reason === "released" ? "The coding agent already picked this unit up; record the refinement as a new unit." : result.reason === "withdrawn" ? "That unit was withdrawn; record a new one if the riffer still wants it." : "No unit with that id in this session."
      };
    }
    return { ok: true, unit_id: result.unit.id, ...unresolved.length > 0 ? { anchors_unresolved: unresolved } : {} };
  }
  withdrawUnit(args) {
    const raw = args;
    if (!isRecord3(raw) || typeof raw.unit_id !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id is required" };
    }
    const reason = typeof raw.reason === "string" && raw.reason.trim().length > 0 ? raw.reason.trim() : void 0;
    const result = this.session.withdrawUnit(raw.unit_id, reason);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.dropQuestion(raw.unit_id);
    return { ok: true, unit_id: result.unit.id, after_release: result.afterRelease };
  }
  relayAnswer(args) {
    const raw = args;
    if (!isRecord3(raw) || typeof raw.unit_id !== "string" || typeof raw.answer_text !== "string") {
      return { ok: false, reason: "invalid_arguments", detail: "unit_id and answer_text are required" };
    }
    const text = raw.answer_text.trim();
    if (text.length === 0) return { ok: false, reason: "invalid_arguments", detail: "answer_text is empty" };
    const answer = this.session.relayAnswer(raw.unit_id, text);
    if (!answer) return { ok: false, reason: "unknown_unit" };
    this.dropQuestion(raw.unit_id);
    return { ok: true, unit_id: answer.unit_id };
  }
  // ---------------------------------------------------------------------
  // Anchors
  // ---------------------------------------------------------------------
  rememberAnchor(anchor, description, anchorId) {
    const id = _nullishCoalesce(anchorId, () => ( `anchor_${String(this.nextAnchorId++).padStart(4, "0")}`));
    const entry = { id, anchor, description, t: this.elapsed() };
    const index = this.announced.findIndex((existing) => existing.id === id);
    if (index === -1) this.announced.push(entry);
    else this.announced[index] = entry;
    return entry;
  }
  resolveAnchors(refs) {
    const anchors = [];
    const unresolved = [];
    for (const ref of refs) {
      const anchor = this.resolveAnchor(ref);
      if (anchor) {
        if (!anchors.some((existing) => existing === anchor)) anchors.push(anchor);
      } else {
        unresolved.push(ref);
      }
    }
    return { anchors, unresolved };
  }
  resolveAnchor(ref) {
    if (this.resolveAnchorOverride) return this.resolveAnchorOverride(ref, this.announcedAnchors());
    const needle = ref.trim().toLowerCase();
    if (needle.length === 0) return null;
    const byId = this.announced.find((entry) => entry.id.toLowerCase() === needle);
    if (byId) return byId.anchor;
    const byDescription = [...this.announced].reverse().find((entry) => entry.description.toLowerCase() === needle || entry.anchor.selector.toLowerCase() === needle);
    if (byDescription) return byDescription.anchor;
    const recent = this.announced[this.announced.length - 1];
    if (recent && this.elapsed() - recent.t <= this.anchorRecencyMs) return recent.anchor;
    return null;
  }
  // ---------------------------------------------------------------------
  // Endpoint questions (KTD6)
  // ---------------------------------------------------------------------
  enqueueQuestion(question) {
    if (question.answered) return;
    if (this.queue.some((entry) => entry.unit_id === question.unit_id)) return;
    if (_optionalChain([this, 'access', _104 => _104.voicing, 'optionalAccess', _105 => _105.unit_id]) === question.unit_id) return;
    this.queue.push({ unit_id: question.unit_id, question: question.question, requeued: 0 });
    this.scheduleFlush();
    this.emitStatus();
  }
  requeue(question) {
    if (this.queue.some((entry) => entry.unit_id === question.unit_id)) return;
    this.queue.unshift({ ...question, requeued: question.requeued + 1 });
  }
  dropQuestion(unitId) {
    const index = this.queue.findIndex((entry) => entry.unit_id === unitId);
    if (index !== -1) this.queue.splice(index, 1);
  }
  scheduleFlush() {
    this.clearFlushTimer();
    if (!this.canFlush()) return;
    const wait = this.questionSilenceMs - (this.now() - this.silenceAnchor);
    if (wait <= 0) {
      this.flush();
      return;
    }
    this.flushTimer = this.schedule(() => {
      this.flushTimer = null;
      this.flush();
    }, wait);
  }
  canFlush() {
    return !this.stopped && this.transport !== null && !this.responseActive && !this.rifferSpeaking && this.voicing === null && this.queue.length > 0;
  }
  flush() {
    if (!this.canFlush()) return;
    if (this.now() - this.silenceAnchor < this.questionSilenceMs) {
      this.scheduleFlush();
      return;
    }
    const next = this.queue.shift();
    const current = this.session.questionFor(next.unit_id);
    const unit = this.session.unit(next.unit_id);
    if (current && current.answered || !unit || unit.status === "withdrawn") {
      this.scheduleFlush();
      return;
    }
    this.voicing = next;
    this.voicingInterrupted = false;
    try {
      this.transport.sendText(formatQuestion(next));
      this.transport.createResponse();
      this.responseActive = true;
      this.armGateTimer(RESPONSE_CONFIRM_TIMEOUT_MS, "response.create was never confirmed");
    } catch (error) {
      this.onError(error);
      this.voicing = null;
      this.requeue(next);
    }
    this.emitStatus();
  }
  /** Reopens the response gate after `ms` unless `response.done` clears it first. */
  armGateTimer(ms, why) {
    this.clearGateTimer();
    this.gateTimer = this.schedule(() => {
      this.gateTimer = null;
      if (!this.responseActive) return;
      this.onError(new Error(`riffrec live interviewer: response gate reset (${why})`));
      this.responseActive = false;
      this.silenceAnchor = this.now();
      if (this.voicing) {
        this.requeue(this.voicing);
        this.voicing = null;
        this.voicingInterrupted = false;
      }
      this.flushPendingTexts();
      this.scheduleFlush();
    }, ms);
  }
  clearGateTimer() {
    if (this.gateTimer !== null) {
      this.cancel(this.gateTimer);
      this.gateTimer = null;
    }
  }
  flushPendingTexts() {
    const transport = this.transport;
    if (!transport) return;
    for (const item of this.pendingItems.splice(0)) this.sendItem(transport, item);
  }
  sendText(text) {
    if (!this.transport) return;
    try {
      this.transport.sendText(text);
    } catch (error) {
      this.onError(error);
    }
  }
  clearFlushTimer() {
    if (this.flushTimer !== null) {
      this.cancel(this.flushTimer);
      this.flushTimer = null;
    }
  }
  elapsed() {
    return Math.max(0, this.now() - this.session.startedAt);
  }
  emitStatus() {
    _optionalChain([this, 'access', _106 => _106.onStatus, 'optionalCall', _107 => _107(this.status)]);
  }
};
function toUnitQuestion(entry) {
  return { unit_id: entry.unit_id, question: entry.question, t: 0, answered: false };
}
function createInterviewer(options) {
  return new Interviewer(options);
}

// src/live/buffer.ts
var FRAME_DB_NAME = "riffrec-live-frames";
var FRAME_DB_VERSION = 1;
var FRAME_STORE_NAME = "frames";
function frameKey(sessionId, frameId) {
  return `${sessionId}/${frameId}`;
}
function requestToPromise2(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(_nullishCoalesce(request.error, () => ( new Error("IndexedDB request failed."))));
  });
}
function openFrameDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FRAME_DB_NAME, FRAME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FRAME_STORE_NAME)) {
        db.createObjectStore(FRAME_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(_nullishCoalesce(request.error, () => ( new Error("Failed to open riffrec live frame store."))));
  });
}
var IndexedDbFrameStore = class {
  constructor() {
    this.db = null;
  }
  open() {
    if (!this.db) this.db = openFrameDb();
    return this.db;
  }
  async put(sessionId, frameId, jpegBase64) {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    await requestToPromise2(store.put(jpegBase64, frameKey(sessionId, frameId)));
  }
  async get(sessionId, frameId) {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readonly").objectStore(FRAME_STORE_NAME);
    const value = await requestToPromise2(store.get(frameKey(sessionId, frameId)));
    return typeof value === "string" ? value : null;
  }
  async delete(sessionId, frameId) {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    await requestToPromise2(store.delete(frameKey(sessionId, frameId)));
  }
  async clear(sessionId) {
    const db = await this.open();
    const store = db.transaction(FRAME_STORE_NAME, "readwrite").objectStore(FRAME_STORE_NAME);
    const prefix = `${sessionId}/`;
    const range = IDBKeyRange.bound(prefix, `${prefix}\uFFFF`);
    await requestToPromise2(store.delete(range));
  }
};
var MemoryFrameStore = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
  }
  async put(sessionId, frameId, jpegBase64) {
    this.entries.set(frameKey(sessionId, frameId), jpegBase64);
  }
  async get(sessionId, frameId) {
    return _nullishCoalesce(this.entries.get(frameKey(sessionId, frameId)), () => ( null));
  }
  async delete(sessionId, frameId) {
    this.entries.delete(frameKey(sessionId, frameId));
  }
  async clear(sessionId) {
    const prefix = `${sessionId}/`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
};
function createDefaultFrameStore() {
  return typeof indexedDB !== "undefined" ? new IndexedDbFrameStore() : new MemoryFrameStore();
}
function isFrameEnvelope(envelope) {
  return envelope.type === "frame";
}
function stripFrame(envelope) {
  return { ...envelope, payload: { ...envelope.payload, jpeg_base64: "" } };
}
function tombstoneFrame(envelope, reason) {
  const payload = { ...envelope.payload, jpeg_base64: "", dropped: reason };
  return { ...envelope, payload };
}
function fillerEnvelope(sessionId, seq, t) {
  return { schema_version: _chunk4XWUXLDEcjs.LIVE_SCHEMA_VERSION, session_id: sessionId, seq, t, type: "stream_state", payload: { state: "buffering" } };
}
function isPlaceholder(envelope) {
  if (isFrameEnvelope(envelope)) return envelope.payload.dropped !== void 0;
  return envelope.type === "stream_state" && envelope.payload.state === "buffering";
}
function shrinkEnvelope(envelope) {
  if (envelope.type === "unit" && envelope.payload.evidence.telemetry_window) {
    const { telemetry_window: _dropped, ...evidence } = envelope.payload.evidence;
    return { ...envelope, payload: { ...envelope.payload, evidence } };
  }
  return null;
}
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}
var UnsentQueue = class _UnsentQueue {
  constructor(sessionId, frameStore, options = {}) {
    this.sessionId = sessionId;
    this.frameStore = frameStore;
    this.entries = [];
    /** Frame ids whose JPEG lives only in the frame store (rehydrated queue). */
    this.detached = /* @__PURE__ */ new Set();
    /** Frame ids the store does not hold yet (write pending or failed); their bytes stay inline when persisted. */
    this.pendingPuts = /* @__PURE__ */ new Set();
    /** Envelopes replaced by a filler or tombstone since construction. */
    this.evictions = 0;
    this.onStoreError = _nullishCoalesce(options.onStoreError, () => ( (() => {
    })));
    this.onStoreSettled = _nullishCoalesce(options.onStoreSettled, () => ( (() => {
    })));
  }
  /**
   * Rebuilds the queue from `sessionStorage`. `entries` is null when the last
   * persist had to drop the queue; every `seq` in `(ackedSeq, nextSeq)` that is
   * missing is then re-created as a filler so the endpoint's contiguous ack
   * can advance past the loss.
   */
  static fromPersisted(sessionId, entries, range, frameStore, options) {
    const queue = new _UnsentQueue(sessionId, frameStore, options);
    const bySeq = /* @__PURE__ */ new Map();
    for (const entry of _nullishCoalesce(entries, () => ( []))) {
      if (entry.seq <= range.ackedSeq || entry.seq >= range.nextSeq) continue;
      bySeq.set(entry.seq, entry);
    }
    for (let seq = range.ackedSeq + 1; seq < range.nextSeq; seq += 1) {
      const entry = _nullishCoalesce(bySeq.get(seq), () => ( fillerEnvelope(sessionId, seq, range.t)));
      queue.entries.push(entry);
      if (!isFrameEnvelope(entry) || entry.payload.dropped) continue;
      if (entry.payload.jpeg_base64 === "") {
        queue.detached.add(entry.payload.id);
      } else {
        queue.writeFrame(entry);
      }
    }
    return queue;
  }
  get length() {
    return this.entries.length;
  }
  get isEmpty() {
    return this.entries.length === 0;
  }
  /** Lowest queued `seq`, or null when empty. */
  get headSeq() {
    return _nullishCoalesce(_optionalChain([this, 'access', _108 => _108.entries, 'access', _109 => _109[0], 'optionalAccess', _110 => _110.seq]), () => ( null));
  }
  all() {
    return [...this.entries];
  }
  /** Frames still carrying bytes (in memory or detached in the store). */
  liveFrameCount() {
    return this.entries.filter((entry) => isFrameEnvelope(entry) && !entry.payload.dropped).length;
  }
  /** Envelopes that still carry real content and could be evicted. */
  evictableCount() {
    return this.entries.filter((entry) => !isPlaceholder(entry)).length;
  }
  enqueue(envelope) {
    this.entries.push(envelope);
    if (isFrameEnvelope(envelope) && envelope.payload.jpeg_base64 !== "" && !envelope.payload.dropped) {
      this.writeFrame(envelope);
    }
  }
  writeFrame(envelope) {
    const id = envelope.payload.id;
    this.pendingPuts.add(id);
    this.frameStore.put(this.sessionId, id, envelope.payload.jpeg_base64).then(
      () => {
        if (this.pendingPuts.delete(id)) {
          this.onStoreSettled();
          return;
        }
        this.frameStore.delete(this.sessionId, id).catch(this.onStoreError);
      },
      (error) => {
        this.onStoreError(error);
      }
    );
  }
  /** Drops every envelope the endpoint has acknowledged. */
  ackThrough(ackedSeq) {
    const acked = this.entries.filter((entry) => entry.seq <= ackedSeq);
    this.entries = this.entries.filter((entry) => entry.seq > ackedSeq);
    for (const entry of acked) {
      if (isFrameEnvelope(entry)) {
        this.detached.delete(entry.payload.id);
        this.pendingPuts.delete(entry.payload.id);
        this.frameStore.delete(this.sessionId, entry.payload.id).catch(this.onStoreError);
      }
    }
    return acked;
  }
  /**
   * The next body to post: a lone frame (with bytes rehydrated from the store
   * when the queue came back from `sessionStorage`), or up to `limit` non-frame
   * envelopes that fit under the batch cap, in `seq` order.
   */
  async nextBatch(limit = Number.POSITIVE_INFINITY) {
    const head = this.entries[0];
    if (!head) return null;
    if (isFrameEnvelope(head)) {
      const hydrated = await this.hydrate(head);
      return { envelopes: [hydrated], frame: true };
    }
    const envelopes = [];
    let bytes = 2;
    for (const entry of this.entries) {
      if (isFrameEnvelope(entry) || envelopes.length >= limit) break;
      const size = byteLength(JSON.stringify(entry)) + 1;
      if (envelopes.length > 0 && bytes + size > _chunk4XWUXLDEcjs.LIVE_EVENTS_BODY_MAX_BYTES) break;
      envelopes.push(entry);
      bytes += size;
    }
    return { envelopes, frame: false };
  }
  async hydrate(envelope) {
    if (envelope.payload.jpeg_base64 !== "" || envelope.payload.dropped) return envelope;
    if (!this.detached.has(envelope.payload.id)) return envelope;
    let stored = null;
    try {
      stored = await this.frameStore.get(this.sessionId, envelope.payload.id);
    } catch (error) {
      this.onStoreError(error);
    }
    if (stored === null) {
      const dropped = tombstoneFrame(envelope, "quota");
      this.replace(envelope.seq, dropped);
      this.detached.delete(envelope.payload.id);
      this.evictions += 1;
      return dropped;
    }
    return { ...envelope, payload: { ...envelope.payload, jpeg_base64: stored } };
  }
  /** Replaces a queued frame with its tombstone; used after a `413`. */
  dropFrame(seq, reason) {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry || !isFrameEnvelope(entry)) return null;
    const dropped = tombstoneFrame(entry, reason);
    this.replace(seq, dropped);
    this.forgetFrame(entry.payload.id);
    this.evictions += 1;
    return dropped;
  }
  /**
   * Replaces one queued envelope with a smaller form (`shrinkEnvelope`) or,
   * when nothing can be shed, a same-`seq` filler. Returns the replacement.
   */
  shrinkOrFill(seq, t) {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry) return null;
    if (isFrameEnvelope(entry)) return this.dropFrame(seq, "oversize");
    const replacement = _nullishCoalesce(shrinkEnvelope(entry), () => ( fillerEnvelope(this.sessionId, seq, t)));
    this.replace(seq, replacement);
    this.evictions += 1;
    return replacement;
  }
  /**
   * A same-`seq` stand-in for an envelope the endpoint refused as malformed
   * (`400`): a shrunk copy when the envelope has something to shed, otherwise a
   * filler; a frame goes straight to a filler, since its metadata was what was
   * refused. Returns null once the entry is already a filler — nothing smaller
   * exists, and the caller treats the rejection as a failure.
   */
  replaceRejected(seq, t) {
    const entry = this.entries.find((candidate) => candidate.seq === seq);
    if (!entry) return null;
    if (isFrameEnvelope(entry)) {
      const filler = fillerEnvelope(this.sessionId, seq, t);
      this.replace(seq, filler);
      this.forgetFrame(entry.payload.id);
      this.evictions += 1;
      return filler;
    }
    if (isPlaceholder(entry)) return null;
    const replacement = _nullishCoalesce(shrinkEnvelope(entry), () => ( fillerEnvelope(this.sessionId, seq, t)));
    this.replace(seq, replacement);
    this.evictions += 1;
    return replacement;
  }
  /**
   * Evicts the oldest `count` envelopes that still carry content, keeping
   * their `seq` as fillers or tombstones. Returns how many were evicted.
   */
  evictOldest(count, t) {
    let evicted = 0;
    for (const entry of this.entries) {
      if (evicted >= count) break;
      if (isPlaceholder(entry)) continue;
      if (isFrameEnvelope(entry)) {
        this.replace(entry.seq, tombstoneFrame(entry, "quota"));
        this.forgetFrame(entry.payload.id);
      } else {
        this.replace(entry.seq, fillerEnvelope(this.sessionId, entry.seq, t));
      }
      evicted += 1;
    }
    this.evictions += evicted;
    return evicted;
  }
  /** The `sessionStorage` form: frames without their bytes once the store holds them. */
  toPersisted() {
    return this.entries.map((entry) => {
      if (!isFrameEnvelope(entry)) return entry;
      if (this.pendingPuts.has(entry.payload.id)) return entry;
      return stripFrame(entry);
    });
  }
  async clearStore() {
    this.pendingPuts.clear();
    try {
      await this.frameStore.clear(this.sessionId);
    } catch (error) {
      this.onStoreError(error);
    }
  }
  forgetFrame(id) {
    this.detached.delete(id);
    this.pendingPuts.delete(id);
    this.frameStore.delete(this.sessionId, id).catch(this.onStoreError);
  }
  replace(seq, next) {
    this.entries = this.entries.map((entry) => entry.seq === seq ? next : entry);
  }
};
function isQuotaExceededError(error) {
  if (!(error instanceof Error) && (typeof error !== "object" || error === null)) return false;
  const candidate = error;
  return candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" || candidate.code === 22 || candidate.code === 1014;
}
function persistWithQuotaGuard(storage, key, queue, build, options) {
  const fraction = _nullishCoalesce(options.evictFraction, () => ( 0.25));
  let evicted = false;
  for (; ; ) {
    try {
      storage.setItem(key, build("full", queue ? queue.toPersisted() : []));
      return evicted ? "stored_after_eviction" : "stored";
    } catch (error) {
      if (!isQuotaExceededError(error)) return "failed";
      const evictable = _nullishCoalesce(_optionalChain([queue, 'optionalAccess', _111 => _111.evictableCount, 'call', _112 => _112()]), () => ( 0));
      if (queue && evictable > 0) {
        queue.evictOldest(Math.max(1, Math.ceil(evictable * fraction)), options.t);
        evicted = true;
        continue;
      }
      break;
    }
  }
  try {
    storage.setItem(key, build("without_queue", null));
    return "stored_without_queue";
  } catch (error) {
    if (!isQuotaExceededError(error)) return "failed";
  }
  try {
    storage.setItem(key, build("minimal", null));
    return "stored_minimal";
  } catch (e9) {
    return "failed";
  }
}

// src/live/checkpoints.ts
var SILENCE_CHECKPOINT_MS = 2500;
var SEND_TURN_WAIT_MS = 1500;
var CheckpointEmitter = class {
  constructor(options) {
    this.options = options;
    this.silenceTimer = null;
    this.speaking = false;
    this.pendingSend = null;
    this.disposed = false;
    this.silenceMs = _nullishCoalesce(options.silenceMs, () => ( SILENCE_CHECKPOINT_MS));
    this.sendWaitMs = _nullishCoalesce(options.sendWaitMs, () => ( SEND_TURN_WAIT_MS));
    this.schedule = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.cancel = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
  }
  get isSpeaking() {
    return this.speaking;
  }
  get silenceTimerArmed() {
    return this.silenceTimer !== null;
  }
  speechStarted() {
    if (this.disposed) return;
    this.speaking = true;
    this.clearSilenceTimer();
  }
  speechStopped() {
    if (this.disposed) return;
    this.speaking = false;
    this.clearSilenceTimer();
    this.silenceTimer = this.schedule(() => {
      this.silenceTimer = null;
      this.emitIfHeld("silence");
    }, this.silenceMs);
    this.settlePendingSend();
  }
  pageChanged() {
    if (this.disposed) return false;
    this.clearSilenceTimer();
    return this.emitIfHeld("page_change");
  }
  /** Resolves with whether a `send` checkpoint was emitted. */
  send() {
    if (this.disposed) return Promise.resolve(false);
    if (!this.speaking) {
      this.clearSilenceTimer();
      return Promise.resolve(this.emitIfHeld("send"));
    }
    if (this.pendingSend) {
      const existing = this.pendingSend;
      return new Promise((resolve) => {
        const previous = existing.resolve;
        existing.resolve = (emitted) => {
          previous(emitted);
          resolve(emitted);
        };
      });
    }
    return new Promise((resolve) => {
      const timer = this.schedule(() => {
        if (this.pendingSend) {
          this.pendingSend = null;
          this.clearSilenceTimer();
          resolve(this.emitIfHeld("send"));
        }
      }, this.sendWaitMs);
      this.pendingSend = { resolve, timer };
    });
  }
  /** Always emits; clears every timer. */
  final() {
    if (this.disposed) return;
    this.clearSilenceTimer();
    if (this.pendingSend) {
      this.cancel(this.pendingSend.timer);
      const pending = this.pendingSend;
      this.pendingSend = null;
      pending.resolve(false);
    }
    this.options.emit("final");
  }
  dispose() {
    this.disposed = true;
    this.clearSilenceTimer();
    if (this.pendingSend) {
      this.cancel(this.pendingSend.timer);
      const pending = this.pendingSend;
      this.pendingSend = null;
      pending.resolve(false);
    }
  }
  settlePendingSend() {
    if (!this.pendingSend) return;
    const pending = this.pendingSend;
    this.pendingSend = null;
    this.cancel(pending.timer);
    this.clearSilenceTimer();
    pending.resolve(this.emitIfHeld("send"));
  }
  emitIfHeld(trigger) {
    if (!this.options.hasHeldWork()) return false;
    this.options.emit(trigger);
    return true;
  }
  clearSilenceTimer() {
    if (this.silenceTimer !== null) {
      this.cancel(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
};

// src/live/streamClient.ts
var DEFAULT_FAILURE_THRESHOLD = 3;
var DEFAULT_BACKOFF_MS = [1e3, 2e3, 4e3, 8e3, 16e3, 3e4];
var DEFAULT_POST_TIMEOUT_MS = 2e4;
var SERVER_EVENT_NAMES = ["unit_status", "applied", "ask", "ack", "session_ended"];
function defaultSchedule(callback) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback());
  } else {
    setTimeout(callback, 0);
  }
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJson2(response) {
  try {
    const value = await response.json();
    return isRecord4(value) ? value : null;
  } catch (e10) {
    return null;
  }
}
function parseServerEventBlock(block) {
  let name = null;
  const dataLines = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!name || !SERVER_EVENT_NAMES.includes(name)) return null;
  let data;
  try {
    data = dataLines.length > 0 ? JSON.parse(dataLines.join("\n")) : {};
  } catch (e11) {
    return null;
  }
  if (!isRecord4(data)) return null;
  return { event: name, data };
}
var StreamClient = class {
  constructor(options) {
    this.options = options;
    this.state = "idle";
    this.ackedSeq = 0;
    this.consecutiveFailures = 0;
    /** Counts `POST /events` attempts, for tests and diagnostics. */
    this.postAttempts = 0;
    this.flushScheduled = false;
    this.inflight = false;
    /** Upper bound on envelopes per batch; halved after a 413 on a multi-envelope body, doubled after each success. */
    this.batchLimit = Number.POSITIVE_INFINITY;
    this.retryTimer = null;
    this.streamAbort = null;
    this.streamRetryTimer = null;
    this.streamFailures = 0;
    this.closed = false;
    this.fetchImpl = _nullishCoalesce(options.fetch, () => ( ((input, init) => fetch(input, init))));
    this.schedule = _nullishCoalesce(options.schedule, () => ( defaultSchedule));
    this.setTimer = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.clearTimer = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
    this.failureThreshold = _nullishCoalesce(options.failureThreshold, () => ( DEFAULT_FAILURE_THRESHOLD));
    this.backoffMs = _nullishCoalesce(options.backoffMs, () => ( DEFAULT_BACKOFF_MS));
    this.postTimeoutMs = _nullishCoalesce(options.postTimeoutMs, () => ( DEFAULT_POST_TIMEOUT_MS));
  }
  get queue() {
    return this.options.queue;
  }
  get isTerminal() {
    return this.state === "incompatible" || this.state === "conflict" || this.state === "unauthorized" || this.state === "ended" || this.state === "closed";
  }
  headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.options.token}`,
      [_chunk4XWUXLDEcjs.LIVE_SESSION_HEADER]: this.options.sessionId,
      ...extra
    };
  }
  /** Begins delivering: flushes anything already queued and opens the SSE stream. */
  start() {
    if (this.closed) return;
    if (this.state === "idle") this.setState("streaming");
    this.scheduleFlush();
    this.openStream();
  }
  enqueue(envelope) {
    if (this.closed) return;
    this.queue.enqueue(envelope);
    _optionalChain([this, 'access', _113 => _113.options, 'access', _114 => _114.onQueueChange, 'optionalCall', _115 => _115()]);
    this.scheduleFlush();
  }
  /** Forces a flush attempt now (used by tests and by `final`). */
  flushNow() {
    return this.flush();
  }
  /**
   * `pagehide`: posts the `unloading` envelope with `keepalive` so the endpoint
   * classifies a reload without waiting for its grace window (KTD8). The
   * envelope is also queued, so a failed beacon replays after rehydration.
   */
  sendUnloading(envelope) {
    if (this.closed) return;
    this.queue.enqueue(envelope);
    _optionalChain([this, 'access', _116 => _116.options, 'access', _117 => _117.onQueueChange, 'optionalCall', _118 => _118()]);
    try {
      const result = this.fetchImpl(`${this.options.endpoint}/events`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify([envelope]),
        keepalive: true
      });
      void result.then(async (response) => {
        if (!response.ok) return;
        const body = await readJson2(response);
        if (body && typeof body.acked_seq === "number") this.applyAck(body.acked_seq);
      }).catch(() => {
      });
    } catch (e12) {
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    if (this.streamRetryTimer !== null) this.clearTimer(this.streamRetryTimer);
    this.retryTimer = null;
    this.streamRetryTimer = null;
    _optionalChain([this, 'access', _119 => _119.streamAbort, 'optionalAccess', _120 => _120.abort, 'call', _121 => _121()]);
    this.streamAbort = null;
    if (!this.isTerminal) this.setState("closed");
  }
  // ---------------------------------------------------------------------
  // POST /events
  // ---------------------------------------------------------------------
  scheduleFlush() {
    if (this.flushScheduled || this.closed || this.isTerminal) return;
    if (this.retryTimer !== null) return;
    this.flushScheduled = true;
    this.schedule(() => {
      this.flushScheduled = false;
      void this.flush();
    });
  }
  async flush() {
    if (this.inflight || this.closed || this.isTerminal) return;
    this.inflight = true;
    try {
      for (; ; ) {
        if (this.closed || this.isTerminal) return;
        const batch = await this.queue.nextBatch(this.batchLimit);
        if (!batch) return;
        const outcome = await this.post(batch.envelopes, batch.frame);
        if (outcome === "stop") return;
      }
    } finally {
      this.inflight = false;
    }
  }
  async post(envelopes, frame) {
    this.postAttempts += 1;
    const abort = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = this.setTimer(() => {
      timedOut = true;
      _optionalChain([abort, 'optionalAccess', _122 => _122.abort, 'call', _123 => _123()]);
    }, this.postTimeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.options.endpoint}/events`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(envelopes),
        ...abort ? { signal: abort.signal } : {}
      });
    } catch (error) {
      this.recordFailure(timedOut ? new Error(`riffrec live: POST /events timed out after ${this.postTimeoutMs} ms`) : error);
      return "stop";
    } finally {
      this.clearTimer(timer);
    }
    if (response.ok) {
      const body2 = await readJson2(response);
      if (body2 && typeof body2.acked_seq === "number") this.applyAck(body2.acked_seq);
      this.consecutiveFailures = 0;
      if (this.batchLimit !== Number.POSITIVE_INFINITY) this.batchLimit *= 2;
      if (this.state !== "streaming") this.setState("streaming");
      return "continue";
    }
    const body = await readJson2(response);
    switch (response.status) {
      case 413: {
        if (frame) {
          const dropped = this.queue.dropFrame(envelopes[0].seq, "oversize");
          if (dropped) _optionalChain([this, 'access', _124 => _124.options, 'access', _125 => _125.onFrameDropped, 'optionalCall', _126 => _126(dropped)]);
          _optionalChain([this, 'access', _127 => _127.options, 'access', _128 => _128.onQueueChange, 'optionalCall', _129 => _129()]);
          return "continue";
        }
        if (envelopes.length > 1) {
          this.batchLimit = Math.max(1, Math.floor(envelopes.length / 2));
          return "continue";
        }
        const replaced = this.queue.shrinkOrFill(envelopes[0].seq, _nullishCoalesce(_optionalChain([this, 'access', _130 => _130.options, 'access', _131 => _131.elapsed, 'optionalCall', _132 => _132()]), () => ( 0)));
        _optionalChain([this, 'access', _133 => _133.options, 'access', _134 => _134.onError, 'optionalCall', _135 => _135(
          new Error(
            `riffrec live: ${envelopes[0].type} envelope seq ${envelopes[0].seq} exceeded ${String(_optionalChain([body, 'optionalAccess', _136 => _136.max_bytes]))} bytes; ` + (replaced && replaced.type === envelopes[0].type ? "retrying without its unbounded evidence" : "replaced by a filler")
          )
        )]);
        _optionalChain([this, 'access', _137 => _137.options, 'access', _138 => _138.onQueueChange, 'optionalCall', _139 => _139()]);
        return "continue";
      }
      case 409: {
        if (body && typeof body.expected_schema_version === "string") {
          this.setState("incompatible", { expectedSchemaVersion: body.expected_schema_version, status: 409 });
        } else {
          this.setState("conflict", {
            activeSessionId: body && typeof body.active_session_id === "string" ? body.active_session_id : void 0,
            status: 409
          });
        }
        return "stop";
      }
      case 401:
      case 403:
        this.setState("unauthorized", { status: response.status });
        return "stop";
      case 410:
        this.markEnded(body && typeof body.reason === "string" ? body.reason : "session_ended");
        return "stop";
      case 400: {
        const seq = body && typeof body.seq === "number" ? body.seq : null;
        const targets = seq !== null && envelopes.some((envelope) => envelope.seq === seq) ? [seq] : envelopes.map((envelope) => envelope.seq);
        const reason = body && typeof body.reason === "string" ? body.reason : "invalid_envelope";
        const t = _nullishCoalesce(_optionalChain([this, 'access', _140 => _140.options, 'access', _141 => _141.elapsed, 'optionalCall', _142 => _142()]), () => ( 0));
        const replaced = targets.filter((target) => this.queue.replaceRejected(target, t) !== null);
        const label = targets.length === 1 ? `seq ${targets[0]}` : `seq ${targets.join(", ")}`;
        if (replaced.length === 0) {
          this.recordFailure(new Error(`riffrec live: the endpoint keeps rejecting ${label} as ${reason}`));
          return "stop";
        }
        _optionalChain([this, 'access', _143 => _143.options, 'access', _144 => _144.onError, 'optionalCall', _145 => _145(new Error(`riffrec live: the endpoint rejected ${label} as ${reason}; replaced with a placeholder so the stream keeps moving`))]);
        _optionalChain([this, 'access', _146 => _146.options, 'access', _147 => _147.onQueueChange, 'optionalCall', _148 => _148()]);
        return "continue";
      }
      default:
        this.recordFailure(new Error(`riffrec live: POST /events returned ${response.status}`));
        return "stop";
    }
  }
  applyAck(ackedSeq) {
    if (ackedSeq <= this.ackedSeq) return;
    this.ackedSeq = ackedSeq;
    this.queue.ackThrough(ackedSeq);
    _optionalChain([this, 'access', _149 => _149.options, 'access', _150 => _150.onQueueChange, 'optionalCall', _151 => _151()]);
    _optionalChain([this, 'access', _152 => _152.options, 'access', _153 => _153.onAck, 'optionalCall', _154 => _154(ackedSeq)]);
  }
  recordFailure(error) {
    this.consecutiveFailures += 1;
    if (error) _optionalChain([this, 'access', _155 => _155.options, 'access', _156 => _156.onError, 'optionalCall', _157 => _157(error)]);
    if (this.consecutiveFailures >= this.failureThreshold && this.state === "streaming") {
      this.setState("buffering");
    }
    const delay = _nullishCoalesce(this.backoffMs[Math.min(this.consecutiveFailures - 1, this.backoffMs.length - 1)], () => ( 1e3));
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }
  // ---------------------------------------------------------------------
  // GET /stream (SSE over a fetch stream reader)
  // ---------------------------------------------------------------------
  openStream() {
    if (this.closed || this.isTerminal || this.streamAbort) return;
    const abort = new AbortController();
    this.streamAbort = abort;
    void this.readStream(abort).finally(() => {
      if (this.streamAbort === abort) this.streamAbort = null;
    });
  }
  async readStream(abort) {
    let response;
    try {
      response = await this.fetchImpl(`${this.options.endpoint}/stream`, {
        method: "GET",
        headers: this.headers({ Accept: "text/event-stream" }),
        signal: abort.signal
      });
    } catch (error) {
      if (!abort.signal.aborted) this.scheduleStreamRetry(error);
      return;
    }
    if (!response.ok) {
      const body = await readJson2(response);
      switch (response.status) {
        case 401:
        case 403:
          this.setState("unauthorized", { status: response.status });
          return;
        case 409:
          if (body && typeof body.expected_schema_version === "string") {
            this.setState("incompatible", { expectedSchemaVersion: body.expected_schema_version, status: 409 });
          } else {
            this.setState("conflict", {
              activeSessionId: body && typeof body.active_session_id === "string" ? body.active_session_id : void 0,
              status: 409
            });
          }
          return;
        case 410:
          this.markEnded(body && typeof body.reason === "string" ? body.reason : "session_ended");
          return;
        default:
          this.scheduleStreamRetry(new Error(`riffrec live: GET /stream returned ${response.status}`));
          return;
      }
    }
    if (!response.body) {
      this.scheduleStreamRetry(new Error("riffrec live: GET /stream returned no body"));
      return;
    }
    this.streamFailures = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = this.drainBlocks(buffer);
        if (this.closed || this.isTerminal) {
          await reader.cancel().catch(() => {
          });
          return;
        }
      }
      buffer += decoder.decode();
      this.drainBlocks(`${buffer}

`);
    } catch (error) {
      if (abort.signal.aborted) return;
      this.scheduleStreamRetry(error);
      return;
    }
    if (!this.closed && !this.isTerminal) this.scheduleStreamRetry(null);
  }
  drainBlocks(buffer) {
    let rest = buffer;
    for (; ; ) {
      const match = /\r?\n\r?\n/.exec(rest);
      if (!match) return rest;
      const block = rest.slice(0, match.index);
      rest = rest.slice(match.index + match[0].length);
      const event = parseServerEventBlock(block);
      if (event) this.dispatch(event);
    }
  }
  dispatch(event) {
    switch (event.event) {
      case "ack":
        this.applyAck(event.data.acked_seq);
        break;
      case "session_ended":
        _optionalChain([this, 'access', _158 => _158.options, 'access', _159 => _159.onServerEvent, 'optionalCall', _160 => _160(event)]);
        this.markEnded(event.data.reason);
        return;
      case "unit_status":
      case "applied":
      case "ask":
        break;
      default: {
        const exhaustive = event;
        return exhaustive;
      }
    }
    _optionalChain([this, 'access', _161 => _161.options, 'access', _162 => _162.onServerEvent, 'optionalCall', _163 => _163(event)]);
  }
  scheduleStreamRetry(error) {
    if (this.closed || this.isTerminal) return;
    if (error) _optionalChain([this, 'access', _164 => _164.options, 'access', _165 => _165.onError, 'optionalCall', _166 => _166(error)]);
    this.streamFailures += 1;
    const delay = _nullishCoalesce(this.backoffMs[Math.min(this.streamFailures - 1, this.backoffMs.length - 1)], () => ( 1e3));
    if (this.streamRetryTimer !== null) this.clearTimer(this.streamRetryTimer);
    this.streamRetryTimer = this.setTimer(() => {
      this.streamRetryTimer = null;
      this.openStream();
    }, delay);
  }
  markEnded(reason) {
    if (this.state === "ended") return;
    this.setState("ended");
    _optionalChain([this, 'access', _167 => _167.options, 'access', _168 => _168.onEnded, 'optionalCall', _169 => _169(reason)]);
    this.close();
  }
  setState(state, detail = {}) {
    if (this.state === state) return;
    this.state = state;
    _optionalChain([this, 'access', _170 => _170.options, 'access', _171 => _171.onStateChange, 'optionalCall', _172 => _172(state, detail)]);
    if (this.isTerminal && state !== "closed") {
      _optionalChain([this, 'access', _173 => _173.streamAbort, 'optionalAccess', _174 => _174.abort, 'call', _175 => _175()]);
      this.streamAbort = null;
    }
  }
};

// src/live/units.ts
var UnitStore = class _UnitStore {
  constructor() {
    this.units = /* @__PURE__ */ new Map();
    this.order = [];
    this.released = /* @__PURE__ */ new Set();
    /** Post-release withdrawals not yet forwarded by a checkpoint. */
    this.pendingWithdrawals = [];
    this.questions = /* @__PURE__ */ new Map();
    this.notes = /* @__PURE__ */ new Map();
    this.guesses = /* @__PURE__ */ new Map();
  }
  static fromSnapshot(snapshot) {
    const store = new _UnitStore();
    for (const unit of snapshot.units) {
      store.units.set(unit.id, unit);
      store.order.push(unit.id);
    }
    for (const id of snapshot.released) store.released.add(id);
    store.pendingWithdrawals = [...snapshot.pendingWithdrawals];
    for (const question of snapshot.questions) store.questions.set(question.unit_id, question);
    for (const [id, note] of Object.entries(snapshot.notes)) store.notes.set(id, note);
    for (const [id, guess] of Object.entries(snapshot.guesses)) store.guesses.set(id, guess);
    return store;
  }
  snapshot() {
    return {
      units: this.all(),
      released: [...this.released],
      pendingWithdrawals: [...this.pendingWithdrawals],
      questions: [...this.questions.values()],
      notes: Object.fromEntries(this.notes),
      guesses: Object.fromEntries(this.guesses)
    };
  }
  add(unit) {
    if (this.units.has(unit.id)) {
      throw new Error(`Unit ${unit.id} already exists`);
    }
    this.units.set(unit.id, unit);
    this.order.push(unit.id);
    return unit;
  }
  get(id) {
    return _nullishCoalesce(this.units.get(id), () => ( null));
  }
  all() {
    return this.order.map((id) => this.units.get(id)).filter(Boolean);
  }
  get size() {
    return this.units.size;
  }
  isReleased(id) {
    return this.released.has(id);
  }
  /** Units the endpoint has not released yet: `initial`, not withdrawn. */
  held() {
    return this.all().filter((unit) => unit.status === "initial" && !this.released.has(unit.id));
  }
  /**
   * Whether a page checkpoint has anything to release: a held unit or a
   * post-release withdrawal the endpoint still has to forward.
   */
  hasHeldWork() {
    return this.held().length > 0 || this.pendingWithdrawals.length > 0;
  }
  update(id, patch) {
    const unit = this.units.get(id);
    if (!unit) return { ok: false, reason: "unknown_unit", unit: null };
    if (unit.status === "withdrawn") return { ok: false, reason: "withdrawn", unit };
    const wantsContent = patch.statement !== void 0 || (_nullishCoalesce(_optionalChain([patch, 'access', _176 => _176.anchors_add, 'optionalAccess', _177 => _177.length]), () => ( 0))) > 0;
    if (wantsContent && (unit.status !== "initial" || this.released.has(id))) {
      return { ok: false, reason: "released", unit };
    }
    const next = {
      ...unit,
      statement: _nullishCoalesce(patch.statement, () => ( unit.statement)),
      anchors: patch.anchors_add ? [...unit.anchors, ...patch.anchors_add] : unit.anchors,
      ...patch.confirmed ? { confirmed: patch.confirmed } : {}
    };
    this.units.set(id, next);
    return { ok: true, unit: next };
  }
  /** Links an annotation to a unit's evidence; allowed at any status (local bookkeeping). */
  addAnnotationId(unitId, annotationId) {
    const unit = this.units.get(unitId);
    if (!unit) return null;
    if (unit.evidence.annotation_ids.includes(annotationId)) return unit;
    const next = {
      ...unit,
      evidence: { ...unit.evidence, annotation_ids: [...unit.evidence.annotation_ids, annotationId] }
    };
    this.units.set(unitId, next);
    return next;
  }
  withdraw(id) {
    const unit = this.units.get(id);
    if (!unit) return { ok: false, reason: "unknown_unit", unit: null };
    if (unit.status === "withdrawn") return { ok: false, reason: "already_withdrawn", unit };
    const afterRelease = this.released.has(id) || unit.status !== "initial";
    const withdrawn = { ...unit, status: "withdrawn" };
    this.units.set(id, withdrawn);
    if (afterRelease) this.pendingWithdrawals.push(id);
    return { ok: true, unit: withdrawn, afterRelease };
  }
  /**
   * Called when a page checkpoint leaves the page: the checkpoint forwards
   * every pending post-release withdrawal, so they are no longer held work.
   */
  markCheckpointEmitted() {
    this.pendingWithdrawals = [];
  }
  /**
   * Applies an endpoint status. `triaging` is the release marker (KTD9); a
   * unit the page withdrew stays withdrawn regardless of later endpoint news.
   */
  applyStatus(id, status, extra = {}) {
    const unit = this.units.get(id);
    if (!unit) return null;
    if (status === "triaging") this.released.add(id);
    if (extra.note) this.notes.set(id, extra.note);
    if (extra.guess) this.guesses.set(id, extra.guess);
    if (unit.status === "withdrawn") return unit;
    const next = { ...unit, status };
    this.units.set(id, next);
    if (status !== "needs_info") {
      const question = this.questions.get(id);
      if (question && !question.answered) this.questions.set(id, { ...question, answered: true });
    }
    return next;
  }
  ask(id, question, t) {
    const unit = this.units.get(id);
    if (!unit) return null;
    this.released.add(id);
    if (unit.status !== "withdrawn") this.units.set(id, { ...unit, status: "needs_info" });
    const entry = { unit_id: id, question, t, answered: false };
    this.questions.set(id, entry);
    return entry;
  }
  answer(id) {
    const question = this.questions.get(id);
    if (!question) return null;
    const answered = { ...question, answered: true };
    this.questions.set(id, answered);
    return answered;
  }
  question(id) {
    return _nullishCoalesce(this.questions.get(id), () => ( null));
  }
  openQuestions() {
    return [...this.questions.values()].filter((question) => !question.answered);
  }
  note(id) {
    return _nullishCoalesce(this.notes.get(id), () => ( null));
  }
  guess(id) {
    return _nullishCoalesce(this.guesses.get(id), () => ( null));
  }
};

// src/live/session.ts
var HELD_FRAME_CAP = 24;
var LIVE_CURRENT_SESSION_KEY = "riffrec:live:current";
var LIVE_SESSION_KEY_PREFIX = "riffrec:live:session:";
function liveSessionStorageKey(sessionId) {
  return `${LIVE_SESSION_KEY_PREFIX}${sessionId}`;
}
function defaultStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch (e13) {
    return null;
  }
}
function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
function mintSessionId() {
  return `sess_${randomId()}`;
}
function pad(value) {
  return String(value).padStart(4, "0");
}
function base64ToBlob(base64, type) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch (e14) {
    return null;
  }
}
function currentRoute2() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}
var LiveSession = class _LiveSession {
  constructor(options, persisted) {
    this.phase = "idle";
    this.voice = "none";
    this.pendingMode = null;
    this.pendingModeSeq = null;
    this.voiceRan = false;
    this.muted = false;
    this.mic = null;
    this.nextSeq = 1;
    this.ackedSeq = 0;
    this.nextUnit = 1;
    this.nextCheckpoint = 1;
    this.nextId = 1;
    this.finalSeq = null;
    this.expectedSchemaVersion = null;
    this.error = null;
    this.rehydrated = false;
    this.started = false;
    this.suspended = false;
    this.annotations = [];
    this.transcript = [];
    this.frames = [];
    this.frameBytes = /* @__PURE__ */ new Map();
    /** Frames the profile posts only once a unit references them (`frames: "one"`). */
    this.heldFrames = /* @__PURE__ */ new Map();
    this.clipBytes = /* @__PURE__ */ new Map();
    /** Set on a rehydrate: the reload of unacked frame bytes the archive needs. */
    this.framesRestored = null;
    this.answers = [];
    this.checkpoints = [];
    this.onPageHide = () => this.handlePageHide();
    this.pageHideAttached = false;
    this.changeListeners = /* @__PURE__ */ new Set();
    this.listeners = /* @__PURE__ */ new Map();
    this.ackWaiters = [];
    this.persistOutcome = "stored";
    this.now = _nullishCoalesce(options.now, () => ( (() => Date.now())));
    this.route = _nullishCoalesce(options.route, () => ( currentRoute2));
    this.storage = options.storage === void 0 ? defaultStorage() : options.storage;
    this.frameStore = _nullishCoalesce(options.frameStore, () => ( createDefaultFrameStore()));
    this.setTimer = _nullishCoalesce(options.setTimeout, () => ( ((callback, ms) => setTimeout(callback, ms))));
    this.clearTimer = _nullishCoalesce(options.clearTimeout, () => ( ((handle) => clearTimeout(handle))));
    this.finalAckTimeoutMs = _nullishCoalesce(options.finalAckTimeoutMs, () => ( 15e3));
    this.keepFrames = _nullishCoalesce(options.keepFramesForArchive, () => ( true));
    this.profile = options.evidenceProfile ? resolveEvidenceProfile(options.evidenceProfile) : FULL_EVIDENCE_PROFILE;
    this.fetchImpl = _nullishCoalesce(options.fetch, () => ( ((input, init) => fetch(input, init))));
    this.pageHideTarget = options.pageHideTarget === void 0 ? typeof window !== "undefined" ? window : null : options.pageHideTarget;
    if (persisted) {
      this.rehydrated = true;
      this.id = persisted.session_id;
      this.token = persisted.token;
      this.endpointOrigin = persisted.endpoint;
      this.startedAt = persisted.started_at;
      this.mode = persisted.mode;
      this.pendingMode = persisted.pending_mode;
      this.pendingModeSeq = persisted.pending_mode_seq;
      this.voiceRan = persisted.voice_ran;
      this.muted = persisted.muted;
      this.mic = persisted.mic;
      this.nextSeq = persisted.next_seq;
      this.ackedSeq = persisted.acked_seq;
      this.nextUnit = persisted.next_unit;
      this.nextCheckpoint = persisted.next_checkpoint;
      this.nextId = persisted.next_id;
      this.finalSeq = persisted.final_seq;
      this.units = UnitStore.fromSnapshot(persisted.units);
      this.annotations.push(...persisted.annotations);
      this.transcript.push(...persisted.transcript);
      this.frames.push(...persisted.frames);
      this.answers.push(...persisted.answers);
      this.checkpoints.push(...persisted.checkpoints);
      this.phase = "running";
      this.voice = this.voiceRan ? "reconnecting" : "novoice";
    } else {
      const bootstrap = options.bootstrap === void 0 ? _chunkDQNE5VTNcjs.readStoredBootstrap.call(void 0, this.storage) : options.bootstrap;
      this.id = _nullishCoalesce(options.sessionId, () => ( mintSessionId()));
      this.token = _nullishCoalesce(_optionalChain([bootstrap, 'optionalAccess', _178 => _178.token]), () => ( null));
      this.endpointOrigin = _nullishCoalesce(_nullishCoalesce(_optionalChain([bootstrap, 'optionalAccess', _179 => _179.endpoint]), () => ( options.endpoint)), () => ( null));
      this.startedAt = this.now();
      this.mode = _nullishCoalesce(options.mode, () => ( _chunk4XWUXLDEcjs.DEFAULT_EXECUTION_MODE));
      this.units = new UnitStore();
    }
    const canStream = this.endpointOrigin !== null && this.token !== null;
    this.streamStatus = canStream ? "idle" : "offline";
    if (canStream) {
      const queueOptions = {
        onStoreError: (error) => _optionalChain([options, 'access', _180 => _180.onError, 'optionalCall', _181 => _181(error)]),
        onStoreSettled: () => this.persist()
      };
      this.queue = persisted ? UnsentQueue.fromPersisted(
        this.id,
        persisted.queue,
        { ackedSeq: this.ackedSeq, nextSeq: this.nextSeq, t: this.elapsed() },
        this.frameStore,
        queueOptions
      ) : new UnsentQueue(this.id, this.frameStore, queueOptions);
      this.client = new StreamClient({
        endpoint: this.endpointOrigin,
        token: this.token,
        sessionId: this.id,
        queue: this.queue,
        fetch: options.fetch,
        schedule: options.schedule,
        setTimeout: options.setTimeout,
        clearTimeout: options.clearTimeout,
        backoffMs: options.backoffMs,
        elapsed: () => this.elapsed(),
        onAck: (seq) => this.handleAck(seq),
        onStateChange: (state, detail) => this.handleStreamState(state, detail),
        onServerEvent: (event) => this.handleServerEvent(event),
        onEnded: (reason) => this.handleEnded(reason),
        onFrameDropped: (envelope) => this.handleFrameDropped(envelope),
        onError: (error) => _optionalChain([options, 'access', _182 => _182.onError, 'optionalCall', _183 => _183(error)]),
        onQueueChange: () => this.persist()
      });
      this.client.ackedSeq = this.ackedSeq;
    } else {
      this.queue = null;
      this.client = null;
    }
    this.emitter = new CheckpointEmitter({
      emit: (trigger) => this.emitCheckpoint(trigger),
      hasHeldWork: () => this.units.hasHeldWork(),
      setTimeout: options.setTimeout,
      clearTimeout: options.clearTimeout
    });
    if (persisted && this.keepFrames) this.framesRestored = this.restoreFrameBytes(options.onError);
  }
  // ---------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------
  static create(options = {}) {
    return new _LiveSession(options, null);
  }
  /** Rebuilds the session a previous page load persisted; null when none exists. */
  static rehydrate(options = {}) {
    const storage = options.storage === void 0 ? defaultStorage() : options.storage;
    if (!storage) return null;
    let raw = null;
    let id = null;
    try {
      id = storage.getItem(LIVE_CURRENT_SESSION_KEY);
      if (!id) return null;
      raw = storage.getItem(liveSessionStorageKey(id));
    } catch (e15) {
      return null;
    }
    if (!raw) return null;
    let persisted;
    try {
      persisted = JSON.parse(raw);
    } catch (e16) {
      return null;
    }
    if (!persisted || persisted.version !== 1 || persisted.session_id !== id) return null;
    return new _LiveSession({ ...options, storage }, persisted);
  }
  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------
  get status() {
    switch (this.phase) {
      case "idle":
      case "consenting":
      case "ended":
      case "error":
        return this.phase;
      case "running":
        break;
      default: {
        const exhaustive = this.phase;
        return exhaustive;
      }
    }
    if (this.streamStatus === "incompatible") return "incompatible";
    if (this.streamStatus === "buffering") return "buffering";
    switch (this.voice) {
      case "connecting":
        return "connecting";
      case "reconnecting":
        return "reconnecting";
      case "live":
        return "live";
      case "none":
      case "novoice":
        return "live_novoice";
      default: {
        const exhaustive = this.voice;
        return exhaustive;
      }
    }
  }
  get isRehydrated() {
    return this.rehydrated;
  }
  get hasEndpoint() {
    return this.client !== null;
  }
  get endpoint() {
    return this.endpointOrigin;
  }
  /** The page token, for the voice interviewer's `/mint` (I2); never leaves the page. */
  get pageToken() {
    return this.token;
  }
  get currentMode() {
    return this.mode;
  }
  get isMuted() {
    return this.muted;
  }
  get isSpeaking() {
    return this.emitter.isSpeaking;
  }
  get voiceState() {
    return this.voice;
  }
  get streamState() {
    return this.streamStatus;
  }
  get sequence() {
    return { nextSeq: this.nextSeq, ackedSeq: this.ackedSeq, queueLength: _nullishCoalesce(_optionalChain([this, 'access', _184 => _184.queue, 'optionalAccess', _185 => _185.length]), () => ( 0)) };
  }
  get lastPersistOutcome() {
    return this.persistOutcome;
  }
  /** `sessionStorage` keys this session writes; `stop()` removes them all. */
  storageKeys() {
    return [LIVE_CURRENT_SESSION_KEY, liveSessionStorageKey(this.id)];
  }
  beginConsent() {
    if (this.phase !== "idle") return;
    this.phase = "consenting";
    this.notify();
  }
  declineConsent() {
    if (this.phase !== "consenting") return;
    this.phase = "idle";
    this.notify();
  }
  /**
   * Accept + microphone (or a rehydrate) -> `connecting` when an endpoint can
   * mint a voice secret, otherwise `live_novoice`. Starts delivery and
   * persistence; the voice hooks move the session on from here.
   */
  start() {
    if (this.started || this.phase === "ended" || this.phase === "error") return;
    this.started = true;
    this.phase = "running";
    if (!this.rehydrated) {
      this.voice = this.client && this.mic !== "denied" ? "connecting" : "novoice";
    }
    this.attachPageHide();
    if (this.client) {
      this.client.start();
      if (this.streamStatus === "idle") this.streamStatus = "streaming";
    }
    this.persist();
    this.notify();
  }
  /**
   * Detaches from the page without ending the session (KTD16): the provider
   * unmounting mid-session persists the state, closes delivery, and leaves
   * every `sessionStorage` key and stored frame in place for `rehydrate()`.
   * The instance is inert afterwards.
   */
  suspend() {
    if (this.phase === "ended" || this.suspended) return;
    this.suspended = true;
    this.persist();
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    _optionalChain([this, 'access', _186 => _186.client, 'optionalAccess', _187 => _187.close, 'call', _188 => _188()]);
    this.detachPageHide();
    this.notify();
  }
  get isSuspended() {
    return this.suspended;
  }
  /** Ends the session locally, clears every key and frame it wrote, and returns the archive inputs. */
  async stop() {
    if (this.framesRestored) await this.framesRestored;
    const inputs = this.archiveInputs();
    if (this.phase !== "ended") {
      this.phase = "ended";
      this.emitEvent("ended", { reason: "stopped" });
    }
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    _optionalChain([this, 'access', _189 => _189.client, 'optionalAccess', _190 => _190.close, 'call', _191 => _191()]);
    this.detachPageHide();
    this.clearStorage();
    if (this.queue) await this.queue.clearStore();
    else await this.frameStore.clear(this.id).catch(() => {
    });
    this.notify();
    return inputs;
  }
  // ---------------------------------------------------------------------
  // Voice hooks (U3)
  // ---------------------------------------------------------------------
  voiceConnecting() {
    if (this.phase !== "running") return;
    this.voice = this.voiceRan ? "reconnecting" : "connecting";
    this.notify();
  }
  voiceConnected() {
    if (this.phase !== "running") return;
    this.voice = "live";
    this.voiceRan = true;
    this.persist();
    this.notify();
  }
  voiceLost() {
    if (this.phase !== "running") return;
    this.voice = "reconnecting";
    this.notify();
  }
  /** Mint refused for good, mic denied, or no endpoint: a one-way move to `live_novoice`. */
  voiceUnavailable() {
    if (this.phase !== "running") return;
    this.voice = "novoice";
    this.notify();
  }
  speechStarted() {
    this.emitter.speechStarted();
  }
  speechStopped() {
    this.emitter.speechStopped();
  }
  micGranted() {
    this.mic = "granted";
    this.emit("mic", { state: "granted" });
  }
  micDenied() {
    this.mic = "denied";
    this.emit("mic", { state: "denied" });
    this.voiceUnavailable();
  }
  setMuted(muted) {
    if (this.muted === muted) return;
    this.muted = muted;
    this.mic = muted ? "muted" : "unmuted";
    this.emit("mic", { state: this.mic });
  }
  addTranscript(transcript) {
    const index = this.transcript.findIndex((entry) => entry.id === transcript.id);
    if (index === -1) this.transcript.push(transcript);
    else this.transcript[index] = transcript;
    this.voiceRan = true;
    this.emit("transcript", transcript);
  }
  // ---------------------------------------------------------------------
  // Units (tool intake and board actions)
  // ---------------------------------------------------------------------
  recordUnit(input) {
    const id = _nullishCoalesce(input.id, () => ( `unit_${pad(this.nextUnit++)}`));
    const firstAnchorT = _nullishCoalesce(_optionalChain([input, 'access', _192 => _192.anchors, 'access', _193 => _193[0], 'optionalAccess', _194 => _194.t]), () => ( this.elapsed()));
    const unit = {
      id,
      statement: input.statement,
      transcript_excerpt: input.transcript_excerpt,
      anchors: input.anchors,
      evidence: {
        frame_ids: _nullishCoalesce(_optionalChain([input, 'access', _195 => _195.evidence, 'optionalAccess', _196 => _196.frame_ids]), () => ( [])),
        annotation_ids: _nullishCoalesce(_optionalChain([input, 'access', _197 => _197.evidence, 'optionalAccess', _198 => _198.annotation_ids]), () => ( [])),
        transcript_span: _nullishCoalesce(_optionalChain([input, 'access', _199 => _199.evidence, 'optionalAccess', _200 => _200.transcript_span]), () => ( { t_start: firstAnchorT, t_end: this.elapsed() })),
        ..._optionalChain([input, 'access', _201 => _201.evidence, 'optionalAccess', _202 => _202.telemetry_window]) ? { telemetry_window: input.evidence.telemetry_window } : {},
        ..._optionalChain([input, 'access', _203 => _203.evidence, 'optionalAccess', _204 => _204.audio_clip_id]) ? { audio_clip_id: input.evidence.audio_clip_id } : {}
      },
      status: "initial"
    };
    this.units.add(unit);
    const wireUnit = applyEvidenceProfile(unit, this.profile, (frameId) => this.frameKind(frameId));
    for (const frameId of wireUnit.evidence.frame_ids) this.postHeldFrame(frameId);
    this.emit("unit", wireUnit);
    return unit;
  }
  get evidenceProfile() {
    return { ...this.profile };
  }
  updateUnit(id, patch) {
    const result = this.units.update(id, patch);
    if (result.ok) {
      this.emit("unit_update", {
        unit_id: id,
        ...patch.statement !== void 0 ? { statement: patch.statement } : {},
        ...patch.anchors_add ? { anchors_add: patch.anchors_add } : {},
        ...patch.confirmed ? { confirmed: patch.confirmed } : {}
      });
    }
    return result;
  }
  /** KTD22 confirmation pass: accepted at any status. */
  confirmUnit(id, confirmed) {
    return this.updateUnit(id, { confirmed });
  }
  withdrawUnit(id, reason) {
    const result = this.units.withdraw(id);
    if (result.ok) {
      this.emit("unit_withdraw", { unit_id: id, ...reason ? { reason } : {} });
    }
    return result;
  }
  /** The riffer's answer to an endpoint question, spoken (`relay_answer`) or typed. */
  answer(unitId, text) {
    const unit = this.units.get(unitId);
    if (!unit) return null;
    this.units.answer(unitId);
    const answer = { unit_id: unitId, text };
    this.answers.push(answer);
    this.emit("answer", answer);
    return answer;
  }
  relayAnswer(unitId, text) {
    return this.answer(unitId, text);
  }
  unit(id) {
    return this.units.get(id);
  }
  allUnits() {
    return this.units.all();
  }
  heldUnits() {
    return this.units.held();
  }
  isReleased(id) {
    return this.units.isReleased(id);
  }
  questionFor(id) {
    return this.units.question(id);
  }
  openQuestions() {
    return this.units.openQuestions();
  }
  noteFor(id) {
    return this.units.note(id);
  }
  guessFor(id) {
    return this.units.guess(id);
  }
  // ---------------------------------------------------------------------
  // Annotations, frames, events
  // ---------------------------------------------------------------------
  mintId(prefix) {
    return `${prefix}_${pad(this.nextId++)}`;
  }
  addAnnotation(annotation) {
    const index = this.annotations.findIndex((entry) => entry.id === annotation.id);
    if (index === -1) this.annotations.push(annotation);
    else this.annotations[index] = annotation;
    if (annotation.unit_id) this.linkAnnotation(annotation.id, annotation.unit_id);
    this.emit("annotation", annotation);
    return annotation;
  }
  /** Local bookkeeping when a unit claims an annotation after it was posted (KTD10). */
  attachAnnotation(annotationId, unitId) {
    const index = this.annotations.findIndex((entry) => entry.id === annotationId);
    if (index === -1 || !this.units.get(unitId)) return false;
    this.annotations[index] = { ...this.annotations[index], unit_id: unitId };
    this.linkAnnotation(annotationId, unitId);
    this.persist();
    this.notify();
    return true;
  }
  allAnnotations() {
    return [...this.annotations];
  }
  /**
   * Records a frame locally (metadata always, bytes for the archive) and posts
   * it per the evidence profile: every frame under `all`, composites at once
   * and gesture frames only when a unit references them under `one`, nothing
   * under `none`.
   */
  addFrame(frame) {
    const meta = { id: frame.id, t: frame.t, route: frame.route, kind: frame.kind };
    this.frames.push(meta);
    if (this.keepFrames && frame.jpeg_base64) this.frameBytes.set(frame.id, frame.jpeg_base64);
    const policy = frameWirePolicy(frame.kind, this.profile);
    switch (policy) {
      case "post":
        this.emit("frame", frame);
        return;
      case "hold":
        if (frame.jpeg_base64) this.holdFrame(frame.id, frame.jpeg_base64);
        break;
      case "never":
        break;
      default: {
        const exhaustive = policy;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }
  frameMetadata() {
    return [...this.frames];
  }
  /**
   * A frame the interviewer was shown is evidence the consumer should hold too:
   * under `frames: "one"` it leaves the page now instead of waiting for a unit
   * to reference it. No-op under `all` (already posted) and `none` (nothing
   * leaves the page).
   */
  releaseFrame(frameId) {
    this.postHeldFrame(frameId);
  }
  /** Whether frames may leave the page at all (R25/R19): false under `frames: "none"`. */
  get framesLeavePage() {
    return this.profile.frames !== "none";
  }
  /** An utterance audio clip's bytes for the archive's `clips/` (I6); never posted. */
  addClip(id, blob) {
    this.clipBytes.set(id, blob);
  }
  fullTranscript() {
    return [...this.transcript];
  }
  /** Feeds a classic riffrec event; a navigation also fires the `page_change` checkpoint. */
  recordEvent(event) {
    switch (event.type) {
      case "click":
        this.emit("click", event);
        return;
      case "network_request":
        this.emit("network_request", event);
        return;
      case "console_error":
        this.emit("console_error", event);
        return;
      case "navigation":
        this.emit("navigation", event);
        this.emitter.pageChanged();
        return;
      default: {
        const exhaustive = event;
        return exhaustive;
      }
    }
  }
  // ---------------------------------------------------------------------
  // Mode and checkpoints
  // ---------------------------------------------------------------------
  setMode(mode) {
    if (mode === this.mode) return;
    const wakesOnModeEvent = this.mode === "collect";
    this.mode = mode;
    this.pendingMode = mode;
    this.pendingModeSeq = wakesOnModeEvent ? this.nextSeq : null;
    this.emit("mode", { mode });
  }
  /** Send control: resolves with whether a `send` checkpoint left the page. */
  send() {
    return this.emitter.send();
  }
  /** Done control: emits the `final` checkpoint (always) and returns it. */
  final() {
    this.emitter.final();
    return this.checkpoints[this.checkpoints.length - 1];
  }
  /**
   * Done control, end to end: `final` checkpoint, wait for its ack (or a
   * terminal stream state / timeout), then `POST /session/end`. The session
   * ends when the endpoint confirms; `stop()` still assembles the archive, and
   * when the endpoint did not confirm the result says why, so the zip fallback
   * that follows is never silent.
   */
  async finish() {
    const checkpoint = this.final();
    let finalAcked = false;
    let failure;
    if (this.client && this.finalSeq !== null) {
      finalAcked = await this.waitForAck(this.finalSeq, this.finalAckTimeoutMs);
      if (!finalAcked) {
        failure = this.client.isTerminal ? `the stream is ${this.client.state}` : `the final checkpoint was not acknowledged within ${Math.round(this.finalAckTimeoutMs / 1e3)} s`;
      }
    }
    let ended = this.phase === "ended";
    if (!ended && this.client && this.token && this.endpointOrigin && !this.client.isTerminal) {
      const outcome = await this.postSessionEnd();
      ended = outcome.ok;
      if (!outcome.ok) failure = outcome.failure;
    }
    if (ended && this.phase !== "ended") this.handleEnded("riffer_done");
    if (!this.client || ended) return { checkpoint, finalAcked, ended };
    return { checkpoint, finalAcked, ended, failure: _nullishCoalesce(failure, () => ( "the endpoint did not confirm the session end")) };
  }
  allCheckpoints() {
    return [...this.checkpoints];
  }
  // ---------------------------------------------------------------------
  // Observation
  // ---------------------------------------------------------------------
  subscribe(listener) {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }
  on(name, listener) {
    const set = _nullishCoalesce(this.listeners.get(name), () => ( /* @__PURE__ */ new Set()));
    set.add(listener);
    this.listeners.set(name, set);
    return () => set.delete(listener);
  }
  snapshot() {
    return {
      id: this.id,
      status: this.status,
      phase: this.phase,
      voice: this.voice,
      stream: this.streamStatus,
      endpoint: this.endpointOrigin,
      mode: this.mode,
      pendingMode: this.pendingMode,
      muted: this.muted,
      mic: this.mic,
      units: this.units.all(),
      annotations: [...this.annotations],
      transcript: [...this.transcript],
      openQuestions: this.units.openQuestions(),
      checkpoints: [...this.checkpoints],
      nextSeq: this.nextSeq,
      ackedSeq: this.ackedSeq,
      queueLength: _nullishCoalesce(_optionalChain([this, 'access', _205 => _205.queue, 'optionalAccess', _206 => _206.length]), () => ( 0)),
      expectedSchemaVersion: this.expectedSchemaVersion,
      error: this.error,
      finalEmitted: this.finalSeq !== null
    };
  }
  // ---------------------------------------------------------------------
  // Archive (I6, R4)
  // ---------------------------------------------------------------------
  /**
   * The two R4 shapes: with no endpoint the interviewer never ran, so there is
   * no `transcript.json`; a session whose endpoint was lost adds transcript and
   * units. `annotations.json` is always present for a live session.
   */
  archiveInputs() {
    const frames = {};
    for (const [id, base64] of this.frameBytes) {
      const blob = base64ToBlob(base64, "image/jpeg");
      if (blob) frames[`${id}.jpg`] = blob;
    }
    const clips = {};
    for (const [id, blob] of this.clipBytes) {
      clips[clipFileName({ id, mimeType: blob.type })] = blob;
    }
    const units = this.units.all();
    return {
      transcript: this.voiceRan ? [...this.transcript] : null,
      units: this.client || units.length > 0 ? units : null,
      annotations: [...this.annotations],
      frames,
      ...Object.keys(clips).length > 0 ? { clips } : {}
    };
  }
  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------
  elapsed() {
    return Math.max(0, this.now() - this.startedAt);
  }
  /**
   * A reload keeps only frame metadata, so the JPEGs of every unacked frame are
   * read back for the archive's `frames/`: from the rehydrated queue for a frame
   * whose bytes stayed inline (its store write had not settled), otherwise from
   * the frame store.
   */
  async restoreFrameBytes(onError) {
    for (const entry of _nullishCoalesce(_optionalChain([this, 'access', _207 => _207.queue, 'optionalAccess', _208 => _208.all, 'call', _209 => _209()]), () => ( []))) {
      if (!_chunk4XWUXLDEcjs.isLiveEnvelopeOfType.call(void 0, entry, "frame") || entry.payload.dropped) continue;
      if (entry.payload.jpeg_base64 !== "") this.frameBytes.set(entry.payload.id, entry.payload.jpeg_base64);
    }
    await Promise.all(
      this.frames.filter((frame) => !frame.dropped && !this.frameBytes.has(frame.id)).map(async (frame) => {
        try {
          const bytes = await this.frameStore.get(this.id, frame.id);
          if (bytes) this.frameBytes.set(frame.id, bytes);
        } catch (error) {
          _optionalChain([onError, 'optionalCall', _210 => _210(error)]);
        }
      })
    );
  }
  emit(type, payload) {
    const envelope = {
      schema_version: _chunk4XWUXLDEcjs.LIVE_SCHEMA_VERSION,
      session_id: this.id,
      seq: this.nextSeq++,
      t: this.elapsed(),
      type,
      payload
    };
    if (this.client && this.phase === "running") {
      this.client.enqueue(envelope);
    } else if (this.client) {
      _optionalChain([this, 'access', _211 => _211.queue, 'optionalAccess', _212 => _212.enqueue, 'call', _213 => _213(envelope)]);
    }
    this.persist();
    this.notify();
    return envelope;
  }
  emitCheckpoint(trigger) {
    if (this.phase !== "running") return;
    const checkpoint = {
      id: `cp_${pad(this.nextCheckpoint++)}`,
      trigger,
      mode: this.mode
    };
    this.checkpoints.push(checkpoint);
    this.units.markCheckpointEmitted();
    const envelope = this.emit("checkpoint", checkpoint);
    const stampsPendingMode = this.pendingMode !== null && this.pendingModeSeq === null;
    if (stampsPendingMode) this.pendingModeSeq = envelope.seq;
    if (trigger === "final") this.finalSeq = envelope.seq;
    if (trigger === "final" || stampsPendingMode) this.persist();
    this.emitEvent("checkpoint", checkpoint);
    if (this.client) void this.client.flushNow();
  }
  linkAnnotation(annotationId, unitId) {
    this.units.addAnnotationId(unitId, annotationId);
  }
  frameKind(frameId) {
    return _nullishCoalesce(_optionalChain([this, 'access', _214 => _214.frames, 'access', _215 => _215.find, 'call', _216 => _216((frame) => frame.id === frameId), 'optionalAccess', _217 => _217.kind]), () => ( null));
  }
  /** Only the most recent held frames can still be picked by a unit (the U6 ring buffer keeps 12). */
  holdFrame(frameId, jpeg) {
    this.heldFrames.set(frameId, jpeg);
    while (this.heldFrames.size > HELD_FRAME_CAP) {
      const oldest = this.heldFrames.keys().next().value;
      if (oldest === void 0) break;
      this.heldFrames.delete(oldest);
    }
  }
  /** A gesture frame held under `frames: "one"` leaves the page the moment a unit references it. */
  postHeldFrame(frameId) {
    const jpeg = this.heldFrames.get(frameId);
    if (jpeg === void 0) return;
    this.heldFrames.delete(frameId);
    const meta = this.frames.find((frame) => frame.id === frameId);
    if (!meta) return;
    this.emit("frame", { id: meta.id, t: meta.t, route: meta.route, kind: meta.kind, jpeg_base64: jpeg });
  }
  handleAck(seq) {
    if (seq > this.ackedSeq) this.ackedSeq = seq;
    this.clearPendingModeIfActedOn();
    const waiters = this.ackWaiters.splice(0);
    for (const waiter of waiters) {
      if (waiter.seq <= seq) waiter.resolve(true);
      else this.ackWaiters.push(waiter);
    }
    this.persist();
    this.notify();
  }
  handleStreamState(state, detail) {
    switch (state) {
      case "idle":
        this.streamStatus = "idle";
        break;
      case "streaming":
        this.streamStatus = "streaming";
        break;
      case "buffering":
        this.streamStatus = "buffering";
        break;
      case "incompatible":
        this.streamStatus = "incompatible";
        this.expectedSchemaVersion = _nullishCoalesce(detail.expectedSchemaVersion, () => ( null));
        break;
      case "conflict":
        this.streamStatus = "conflict";
        this.fail({
          reason: "session_conflict",
          message: "The endpoint is bound to another session.",
          ...detail.activeSessionId ? { activeSessionId: detail.activeSessionId } : {}
        });
        break;
      case "unauthorized":
        this.streamStatus = "unauthorized";
        this.fail({ reason: "unauthorized", message: "The endpoint rejected the page token." });
        break;
      case "ended":
        this.streamStatus = "ended";
        break;
      case "closed":
        break;
      default: {
        const exhaustive = state;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }
  handleServerEvent(event) {
    switch (event.event) {
      case "unit_status": {
        const { unit_id, status, note, guess } = event.data;
        const unit = this.units.applyStatus(unit_id, status, { note, guess });
        if (unit) this.emitEvent("unit_status", { unit, status, ...note ? { note } : {}, ...guess ? { guess } : {} });
        break;
      }
      case "applied": {
        for (const id of event.data.unit_ids) this.units.applyStatus(id, "applied");
        this.emitEvent("applied", event.data);
        break;
      }
      case "ask": {
        const question = this.units.ask(event.data.unit_id, event.data.question, this.elapsed());
        const unit = this.units.get(event.data.unit_id);
        if (question && unit) this.emitEvent("ask", { unit, question });
        break;
      }
      case "ack":
        break;
      case "session_ended":
        break;
      default: {
        const exhaustive = event;
        return exhaustive;
      }
    }
    this.persist();
    this.notify();
  }
  /**
   * KTD12 hint: the mode stays "pending" until the endpoint acknowledges the
   * envelope it acts on — the `mode` envelope itself when the switch left
   * Collect, otherwise the first checkpoint stamped with the new mode.
   */
  clearPendingModeIfActedOn() {
    if (this.pendingMode === null || this.pendingModeSeq === null) return;
    if (this.ackedSeq < this.pendingModeSeq) return;
    this.pendingMode = null;
    this.pendingModeSeq = null;
  }
  handleEnded(reason) {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.streamStatus = "ended";
    this.emitter.dispose();
    _optionalChain([this, 'access', _218 => _218.client, 'optionalAccess', _219 => _219.close, 'call', _220 => _220()]);
    this.detachPageHide();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.clearStorage();
    if (this.queue) void this.queue.clearStore();
    this.emitEvent("ended", { reason });
    this.notify();
  }
  handleFrameDropped(envelope) {
    const meta = this.frames.find((frame) => frame.id === envelope.payload.id);
    if (meta) meta.dropped = envelope.payload.dropped;
    this.emitEvent("frame_dropped", {
      id: envelope.payload.id,
      t: envelope.payload.t,
      route: envelope.payload.route,
      kind: envelope.payload.kind,
      dropped: envelope.payload.dropped
    });
    this.notify();
  }
  fail(error) {
    this.error = error;
    if (this.phase === "running") this.phase = "error";
    this.emitter.dispose();
    for (const waiter of this.ackWaiters.splice(0)) waiter.resolve(false);
    this.emitEvent("error", error);
  }
  waitForAck(seq, timeoutMs) {
    if (this.ackedSeq >= seq) return Promise.resolve(true);
    if (!this.client || this.client.isTerminal) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const timer = this.setTimer(() => {
        if (settled) return;
        settled = true;
        const index = this.ackWaiters.findIndex((waiter) => waiter.resolve === wrapped);
        if (index !== -1) this.ackWaiters.splice(index, 1);
        resolve(false);
      }, timeoutMs);
      const wrapped = (acked) => {
        if (settled) return;
        settled = true;
        this.clearTimer(timer);
        resolve(acked);
      };
      this.ackWaiters.push({ seq, resolve: wrapped });
    });
  }
  async postSessionEnd() {
    if (!this.client) return { ok: false, failure: "no endpoint is configured" };
    const body = {
      schema_version: _chunk4XWUXLDEcjs.LIVE_SCHEMA_VERSION,
      session_id: this.id,
      mode: this.mode,
      transcript: this.transcript,
      units: this.units.all(),
      annotations: this.annotations,
      answers: this.answers,
      checkpoints: this.checkpoints,
      frames: this.frames
    };
    try {
      const response = await this.fetchImpl(`${this.endpointOrigin}/session/end`, {
        method: "POST",
        headers: this.client.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      if (response.ok) return { ok: true };
      return { ok: false, failure: `POST /session/end returned ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, failure: `POST /session/end failed: ${message}` };
    }
  }
  attachPageHide() {
    if (this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.addEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = true;
  }
  detachPageHide() {
    if (!this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.removeEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = false;
  }
  handlePageHide() {
    if (this.phase !== "running" || !this.client) {
      this.persist();
      return;
    }
    const envelope = {
      schema_version: _chunk4XWUXLDEcjs.LIVE_SCHEMA_VERSION,
      session_id: this.id,
      seq: this.nextSeq++,
      t: this.elapsed(),
      type: "stream_state",
      payload: { state: "unloading" }
    };
    this.client.sendUnloading(envelope);
    this.persist();
  }
  toPersisted(tier, queue) {
    const minimal = tier === "minimal";
    return {
      version: 1,
      session_id: this.id,
      token: this.token,
      endpoint: this.endpointOrigin,
      started_at: this.startedAt,
      mode: this.mode,
      pending_mode: this.pendingMode,
      voice_ran: this.voiceRan,
      muted: this.muted,
      mic: this.mic,
      next_seq: this.nextSeq,
      acked_seq: this.ackedSeq,
      next_unit: this.nextUnit,
      next_checkpoint: this.nextCheckpoint,
      next_id: this.nextId,
      queue,
      units: this.units.snapshot(),
      annotations: minimal ? [] : this.annotations,
      transcript: minimal ? [] : this.transcript,
      frames: minimal ? [] : this.frames,
      answers: this.answers,
      checkpoints: this.checkpoints,
      final_seq: this.finalSeq,
      pending_mode_seq: this.pendingModeSeq,
      ...tier === "full" ? {} : { degraded: tier }
    };
  }
  persist() {
    if (!this.storage || this.phase === "ended" || this.phase === "idle" || this.phase === "consenting") return;
    const key = liveSessionStorageKey(this.id);
    try {
      this.storage.setItem(LIVE_CURRENT_SESSION_KEY, this.id);
    } catch (e17) {
    }
    this.persistOutcome = persistWithQuotaGuard(
      this.storage,
      key,
      this.queue,
      (tier, entries) => JSON.stringify(this.toPersisted(tier, entries)),
      { t: this.elapsed() }
    );
    if (this.persistOutcome === "failed") {
      this.error = { reason: "persist_failed", message: "riffrec live: sessionStorage write failed" };
    }
  }
  clearStorage() {
    if (!this.storage) return;
    try {
      for (const key of this.storageKeys()) this.storage.removeItem(key);
    } catch (e18) {
    }
    _chunkDQNE5VTNcjs.clearStoredBootstrap.call(void 0, this.storage);
  }
  emitEvent(name, payload) {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of set) listener(payload);
  }
  notify() {
    if (this.changeListeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.changeListeners) listener(snapshot);
  }
};

// src/live/liveRuntime.ts
function toConsentProfile(profile) {
  return {
    transcript: profile.transcript_excerpt,
    strokes: profile.strokes,
    frames: profile.frames !== "none",
    audio_clip: profile.audio_clip,
    telemetry_window: profile.telemetry_window
  };
}
function liveExcludedUrls(endpoint) {
  const realtimeOrigin = new URL(REALTIME_CALLS_URL).origin;
  return endpoint ? [endpoint, realtimeOrigin] : [realtimeOrigin];
}
function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}
function describeAnchor(anchor) {
  return anchor.component ? `${anchor.component} (${anchor.selector})` : anchor.selector;
}
var CLICK_TEXT_MAX_CHARS = 80;
function truncate2(text, max) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}\u2026` : collapsed;
}
function describeClick(event, route) {
  const { element } = event;
  const label = _optionalChain([element, 'access', _221 => _221.ariaLabel, 'optionalAccess', _222 => _222.trim, 'call', _223 => _223()]) || _optionalChain([element, 'access', _224 => _224.name, 'optionalAccess', _225 => _225.trim, 'call', _226 => _226()]) || element.tag;
  const text = _optionalChain([element, 'access', _227 => _227.text, 'optionalAccess', _228 => _228.trim, 'call', _229 => _229()]) ? truncate2(element.text, CLICK_TEXT_MAX_CHARS) : "";
  const parts = [label];
  if (text && !label.includes(text)) parts.push(`with text "${text}"`);
  if (event.component) parts.push(`in component ${event.component}`);
  parts.push(`(selector ${element.selector}, route ${route})`);
  return parts.join(" ");
}
function clickAnchor(event, route) {
  const box = event.element.boundingBox;
  if (!box) return null;
  return {
    route,
    selector: event.element.selector,
    ...event.component ? { component: event.component } : {},
    rect: { x: box.x, y: box.y, width: box.width, height: box.height },
    t: event.t * 1e3
  };
}
function defaultGetUserMedia(constraints) {
  if (typeof navigator === "undefined" || !_optionalChain([navigator, 'access', _230 => _230.mediaDevices, 'optionalAccess', _231 => _231.getUserMedia])) {
    return Promise.reject(new Error("Microphone capture is not supported in this browser."));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}
var LiveRuntime = class {
  constructor(options) {
    this.active = null;
    this.options = {};
    this.sessionListeners = [];
    this.paused = false;
    this.stopping = null;
    this.suspended = false;
    this.fallbackReason = null;
    this.annotation = (annotation) => {
      const active = this.active;
      if (!active) {
        this.current.addAnnotation(annotation);
        return;
      }
      void active.evidence.annotationCompleted(annotation).catch((error) => this.callbacks.onError(toError(error)));
      _optionalChain([active, 'access', _232 => _232.interviewer, 'optionalAccess', _233 => _233.announceDrawing, 'call', _234 => _234({
        anchor: annotation.anchor,
        description: describeAnchor(annotation.anchor),
        kind: annotation.kind
      })]);
    };
    this.config = options.config;
    this.capture = options.capture;
    this.callbacks = options.callbacks;
    this.getUserMedia = _nullishCoalesce(options.getUserMedia, () => ( defaultGetUserMedia));
    this.fetchImpl = options.fetch;
    this.profile = resolveEvidenceProfile(_nullishCoalesce(options.config.profile, () => ( "default")));
    this.consentProfile = toConsentProfile(this.profile);
    _chunkDQNE5VTNcjs.bootstrapLiveToken.call(void 0, );
    const rehydrated = LiveSession.rehydrate(this.sessionOptions());
    this.current = _nullishCoalesce(rehydrated, () => ( LiveSession.create(this.sessionOptions())));
    this.attachSession(this.current);
    if (rehydrated) this.resume(rehydrated);
  }
  get session() {
    return this.current;
  }
  get isPaused() {
    return this.paused;
  }
  /** Riffer or host asked to go live: the overlay shows the consent step. */
  begin(options = {}) {
    if (this.suspended) return;
    if (this.current.status === "ended" || this.current.status === "error") {
      this.current = LiveSession.create(this.sessionOptions());
      this.attachSession(this.current);
    }
    if (this.current.status !== "idle") return;
    this.options = options;
    this.fallbackReason = null;
    this.current.beginConsent();
  }
  /** The overlay's `onConsent`: one microphone stream fanned to every consumer (KTD21). */
  consent(result) {
    if (this.suspended || this.active) return;
    this.startCaptures(result.mic === "granted" ? result.stream : null);
  }
  /**
   * The overlay's `onFinished`: a Done the endpoint did not confirm still needs
   * the archive (R4), and the reason travels with it so the fallback is visible
   * to the riffer and the host rather than a silent download.
   */
  finished(result) {
    if (result.ended || this.current.status === "ended") return;
    if (result.failure) {
      this.fallbackReason = result.failure;
      this.callbacks.onError(new Error(`riffrec live: ${result.failure}; the session archive is downloaded instead.`));
    }
    this.callbacks.onEnded();
  }
  setMode(mode) {
    this.current.setMode(mode);
  }
  setMuted(muted) {
    const active = this.active;
    if (_optionalChain([active, 'optionalAccess', _235 => _235.interviewer])) {
      active.interviewer.setMuted(muted);
      return;
    }
    _optionalChain([active, 'optionalAccess', _236 => _236.microphone, 'optionalAccess', _237 => _237.setMuted, 'call', _238 => _238(muted)]);
    this.current.setMuted(muted);
  }
  send() {
    return this.current.send();
  }
  /** R25: frames, composites, and the event stream pause; the screen recording never does. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) _optionalChain([this, 'access', _239 => _239.active, 'optionalAccess', _240 => _240.evidence, 'access', _241 => _241.pause, 'call', _242 => _242()]);
    else _optionalChain([this, 'access', _243 => _243.active, 'optionalAccess', _244 => _244.evidence, 'access', _245 => _245.resume, 'call', _246 => _246()]);
  }
  /** After a reload: the riffer agreed to share the screen again. */
  async reshare() {
    const active = this.active;
    if (!active) return;
    this.callbacks.onReshareNeeded(false);
    await this.shareScreen(active);
  }
  dismissReshare() {
    this.callbacks.onReshareNeeded(false);
  }
  /**
   * Ends the session and returns everything the archive needs; null when
   * there was nothing to archive (declined or never-started consent).
   */
  stop() {
    if (!this.stopping) this.stopping = this.doStop().finally(() => this.stopping = null);
    return this.stopping;
  }
  /** The provider is unmounting mid-session (KTD16): release the page, keep the session. */
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    const active = this.active;
    this.active = null;
    if (active) {
      this.releaseCaptures(active);
      void active.screen.stop().catch((error) => this.callbacks.onError(toError(error)));
      void active.voice.stop().catch((error) => this.callbacks.onError(toError(error)));
      _optionalChain([active, 'access', _247 => _247.microphone, 'optionalAccess', _248 => _248.stop, 'call', _249 => _249()]);
    }
    if (this.current.status === "consenting") this.current.declineConsent();
    this.current.suspend();
    for (const off of this.sessionListeners.splice(0)) off();
  }
  sessionOptions() {
    return {
      endpoint: _nullishCoalesce(this.config.endpoint, () => ( null)),
      evidenceProfile: this.profile,
      ...this.fetchImpl ? { fetch: this.fetchImpl } : {},
      onError: (error) => this.callbacks.onError(toError(error))
    };
  }
  attachSession(session) {
    for (const off of this.sessionListeners.splice(0)) off();
    this.sessionListeners.push(
      session.subscribe((snapshot) => this.callbacks.onSnapshot(snapshot)),
      session.on("ended", ({ reason }) => {
        if (reason !== "stopped" && !this.stopping) this.callbacks.onEnded();
      })
    );
    this.callbacks.onSnapshot(session.snapshot());
  }
  /** A rehydrated session: delivery resumes now, the microphone is re-acquired, the screen waits for a gesture. */
  resume(session) {
    session.start();
    const micDenied = session.snapshot().mic === "denied";
    if (micDenied) {
      this.startCaptures(null, { share: false });
      return;
    }
    this.getUserMedia({ audio: true }).then((stream) => this.startCaptures(stream, { share: false })).catch(() => {
      session.micDenied();
      this.startCaptures(null, { share: false });
    });
  }
  startCaptures(micStream, { share = true } = {}) {
    if (this.suspended || this.active) return;
    const session = this.current;
    const route = () => typeof window === "undefined" ? "/" : window.location.pathname;
    const now = () => Math.max(0, Date.now() - session.startedAt);
    const events = [];
    const unsubscribe = [];
    const evidence = new LiveEvidence({
      session,
      now,
      route,
      recentEvents: () => events,
      onError: (error) => this.callbacks.onError(toError(error))
    });
    const screen = new (0, _chunkDQNE5VTNcjs.ScreenCapture)(this.capture.displayMedia, this.capture.displayMediaVideo, {
      segmentStore: createDefaultSegmentStore(),
      sessionId: session.id,
      onStreamEnded: () => {
        evidence.setDisplayStream(null);
        if (_optionalChain([this, 'access', _250 => _250.active, 'optionalAccess', _251 => _251.screen]) === screen && session.status !== "ended") this.callbacks.onReshareNeeded(true);
      },
      onError: (error) => this.callbacks.onError(toError(error))
    });
    const voice = new (0, _chunkDQNE5VTNcjs.VoiceCapture)();
    const eventCapture = new (0, _chunkDQNE5VTNcjs.EventCapture)();
    const networkCapture = new (0, _chunkDQNE5VTNcjs.NetworkCapture)();
    const consoleCapture = new (0, _chunkDQNE5VTNcjs.ConsoleCapture)();
    const ownsGlobalPatchMarker = typeof window !== "undefined" && !window.__RIFFREC_PATCHED__;
    if (ownsGlobalPatchMarker) window.__RIFFREC_PATCHED__ = true;
    else if (typeof console !== "undefined") {
      console.warn("[riffrec] Another riffrec instance is already active -- skipping global patches.");
    }
    let microphone = null;
    let connector = null;
    let interviewer = null;
    if (micStream) {
      microphone = new SharedMicrophone(micStream);
      microphone.setMuted(session.isMuted);
      void voice.start(microphone.clone("voice_capture"));
      evidence.setMicStream(microphone.clone("clips"));
      if (session.hasEndpoint) {
        connector = createRealtimeConnector({ microphone, elapsed: now });
        interviewer = createInterviewer({
          session,
          connect: connector.connect,
          microphone,
          ...this.fetchImpl ? { fetch: this.fetchImpl } : {},
          screenFrames: session.framesLeavePage,
          evidence: {
            recordUnit: (input) => evidence.recordUnit(input),
            speechStarted: () => evidence.speechStarted(),
            speechStopped: () => evidence.speechStopped(),
            lookAtScreen: () => evidence.lookAtScreen(),
            frameShown: (frameId) => session.releaseFrame(frameId)
          },
          onError: (error) => this.callbacks.onError(toError(error))
        });
      }
    }
    const active = {
      events,
      screen,
      voice,
      eventCapture,
      networkCapture,
      consoleCapture,
      evidence,
      ownsGlobalPatchMarker,
      microphone,
      connector,
      interviewer,
      unsubscribe
    };
    this.active = active;
    const onEvent = (event) => {
      events.push(event);
      if (!this.paused) session.recordEvent(event);
      if (event.type === "click" && interviewer) {
        const currentRoute3 = route();
        const anchor = clickAnchor(event, currentRoute3);
        if (anchor) interviewer.announceClick(anchor, describeClick(event, currentRoute3));
      }
    };
    const sessionStart = session.startedAt;
    if (ownsGlobalPatchMarker) {
      eventCapture.start(sessionStart, onEvent, { ignore: isOverlayNode });
      networkCapture.start(sessionStart, onEvent, liveExcludedUrls(session.endpoint));
      consoleCapture.start(sessionStart, onEvent, this.capture.sanitizeError);
    }
    if (interviewer) {
      const voice2 = interviewer;
      let lastStream = session.streamState;
      unsubscribe.push(
        session.subscribe((snapshot) => {
          if (snapshot.stream === lastStream) return;
          if (snapshot.stream === "buffering") voice2.announceBuffering("buffering");
          else if (lastStream === "buffering" && snapshot.stream === "streaming") voice2.announceBuffering("streaming");
          lastStream = snapshot.stream;
        })
      );
      void voice2.start().catch((error) => this.callbacks.onError(toError(error)));
    }
    if (this.paused) evidence.pause();
    if (share) void this.shareScreen(active);
    else this.callbacks.onReshareNeeded(true);
  }
  async shareScreen(active) {
    const outcome = await active.screen.tryStart();
    if (this.active !== active) return;
    if (outcome === "recording") active.evidence.setDisplayStream(active.screen.displayStream);
  }
  /** Unpatches the page and stops the voice link; media is left to the caller (stop vs. suspend differ). */
  releaseCaptures(active) {
    for (const off of active.unsubscribe.splice(0)) off();
    active.eventCapture.stop();
    active.networkCapture.stop();
    active.consoleCapture.stop();
    if (active.ownsGlobalPatchMarker && typeof window !== "undefined") delete window.__RIFFREC_PATCHED__;
    _optionalChain([active, 'access', _252 => _252.interviewer, 'optionalAccess', _253 => _253.stop, 'call', _254 => _254()]);
    _optionalChain([active, 'access', _255 => _255.connector, 'optionalAccess', _256 => _256.dispose, 'call', _257 => _257()]);
    active.evidence.dispose();
  }
  async doStop() {
    const session = this.current;
    if (session.status === "consenting") {
      session.declineConsent();
      return null;
    }
    if (session.status === "idle") return null;
    const endedBy = session.status === "ended" ? "endpoint" : "stop";
    const active = this.active;
    this.active = null;
    this.callbacks.onReshareNeeded(false);
    let recordingSegments = [];
    let voiceBlob = null;
    const events = _nullishCoalesce(_optionalChain([active, 'optionalAccess', _258 => _258.events]), () => ( []));
    if (active) {
      this.releaseCaptures(active);
      const [, voice] = await Promise.all([
        active.screen.stop().catch(() => null),
        active.voice.stop().catch(() => null)
      ]);
      voiceBlob = voice;
      recordingSegments = await active.screen.collectSegments();
      _optionalChain([active, 'access', _259 => _259.microphone, 'optionalAccess', _260 => _260.stop, 'call', _261 => _261()]);
    }
    const live = await session.stop();
    if (active) await active.screen.clearSegments().catch(() => {
    });
    const outputs = {
      sessionId: session.id,
      startedAt: new Date(session.startedAt),
      durationSeconds: (Date.now() - session.startedAt) / 1e3,
      events,
      screenBlob: null,
      voiceBlob
    };
    const fallbackReason = endedBy === "stop" ? this.fallbackReason : null;
    this.fallbackReason = null;
    return { outputs, live, recordingSegments, options: this.options, endedBy, fallbackReason };
  }
};

// src/live/overlay/LiveOverlay.tsx


// src/live/overlay/Board.tsx


var STATUS_LABELS = {
  initial: "Heard",
  triaging: "Triaging",
  accepted: "Accepted",
  needs_info: "Needs info",
  applied: "Applied",
  blocked: "Blocked",
  withdrawn: "Withdrawn"
};
var STATUS_COLORS = {
  initial: "#667085",
  triaging: "#b54708",
  accepted: "#175cd3",
  needs_info: "#c11574",
  applied: "#027a48",
  blocked: "#b42318",
  withdrawn: "#98a2b3"
};
var FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
var listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: FONT,
  fontSize: 13,
  color: "#101828"
};
var itemStyle = {
  border: "1px solid #eaecf0",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#ffffff"
};
var badgeStyle = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: 4,
  color: "#ffffff",
  marginRight: 6,
  verticalAlign: "middle"
};
var smallButtonStyle = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "3px 8px",
  cursor: "pointer"
};
var primaryButtonStyle = {
  ...smallButtonStyle,
  background: "#101828",
  borderColor: "#344054",
  color: "#ffffff"
};
var inputStyle = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  padding: "4px 8px",
  font: "inherit",
  fontSize: 12
};
var noteStyle = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#475467"
};
var emptyStyle = {
  ...itemStyle,
  color: "#667085",
  fontStyle: "italic",
  textAlign: "center"
};
function describeAnchor2(unit) {
  const anchor = unit.anchors[0];
  if (!anchor) return null;
  const target = anchor.component ? `${anchor.component} (${anchor.selector})` : anchor.selector;
  return `${target} on ${anchor.route}`;
}
function ReplyField({ unitId, primary, onAnswer }) {
  const [text, setText] = _react.useState.call(void 0, "");
  const submit = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAnswer(unitId, trimmed);
    setText("");
  };
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "form", { "data-riffrec-unit-reply": "", onSubmit: submit, style: { display: "flex", gap: 6, marginTop: 6 }, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      "input",
      {
        type: "text",
        "aria-label": "Type your answer",
        placeholder: primary ? "Type your answer" : "Or type your answer",
        value: text,
        onChange: (event) => setText(event.currentTarget.value),
        style: inputStyle
      }
    ),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "submit", disabled: text.trim().length === 0, style: primary ? primaryButtonStyle : smallButtonStyle, children: "Reply" })
  ] });
}
function Board({
  units,
  questions = [],
  guesses = {},
  notes = {},
  isReleased = () => false,
  mode,
  voice = true,
  onWithdraw,
  onAnswer
}) {
  const openQuestion = (unitId) => _nullishCoalesce(questions.find((question) => question.unit_id === unitId && !question.answered), () => ( null));
  if (units.length === 0) {
    return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "ul", { "data-riffrec-board": "", "data-riffrec-board-mode": mode, style: listStyle, children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "li", { "data-riffrec-board-empty": "", style: emptyStyle, children: "Say what should change, or draw on the page." }) });
  }
  return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "ul", { "data-riffrec-board": "", "data-riffrec-board-mode": mode, style: listStyle, children: units.map((unit) => {
    const withdrawn = unit.status === "withdrawn";
    const question = openQuestion(unit.id);
    const guess = guesses[unit.id];
    const note = notes[unit.id];
    const canWithdraw = onWithdraw && unit.status === "initial" && !isReleased(unit.id);
    const anchor = describeAnchor2(unit);
    return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "li", { "data-riffrec-unit": unit.id, "data-riffrec-unit-status": unit.status, style: itemStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: { display: "flex", alignItems: "flex-start", gap: 6 }, children: [
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: { ...badgeStyle, background: STATUS_COLORS[unit.status] }, children: STATUS_LABELS[unit.status] }),
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
            "span",
            {
              "data-riffrec-unit-statement": "",
              style: withdrawn ? { textDecoration: "line-through", color: "#98a2b3" } : void 0,
              children: unit.statement
            }
          )
        ] }),
        canWithdraw ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          "button",
          {
            type: "button",
            "data-riffrec-unit-withdraw": "",
            "aria-label": `Withdraw: ${unit.statement}`,
            style: smallButtonStyle,
            onClick: () => onWithdraw(unit.id),
            children: "Withdraw"
          }
        ) : null
      ] }),
      anchor && !withdrawn ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { "data-riffrec-unit-anchor": "", style: { ...noteStyle, color: "#667085" }, children: anchor }) : null,
      guess ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "p", { "data-riffrec-unit-guess": "", style: noteStyle, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "strong", { children: "Guess:" }),
        " ",
        guess
      ] }) : null,
      note ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { "data-riffrec-unit-note": "", style: noteStyle, children: note }) : null,
      question ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-unit-question": "", style: { marginTop: 6 }, children: [
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "p", { style: { ...noteStyle, margin: 0, color: "#c11574" }, children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "strong", { children: "Agent asks:" }),
          " ",
          question.question
        ] }),
        onAnswer ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, ReplyField, { unitId: unit.id, primary: !voice, onAnswer }) : null
      ] }) : null
    ] }, unit.id);
  }) });
}
function defaultConfirmation(unit) {
  return _nullishCoalesce(unit.confirmed, () => ( { element: true, change: true }));
}
function ConfirmationPass({ units, onComplete, onCancel, busy = false }) {
  const [edits, setEdits] = _react.useState.call(void 0, {});
  const confirmationFor = (unit) => _nullishCoalesce(edits[unit.id], () => ( defaultConfirmation(unit)));
  const toggle = (unit, field, value) => {
    setEdits((current) => ({ ...current, [unit.id]: { ...confirmationFor(unit), [field]: value } }));
  };
  const complete = () => {
    const confirmations = {};
    for (const unit of units) confirmations[unit.id] = confirmationFor(unit);
    onComplete(confirmations);
  };
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-confirmation": "", style: { fontFamily: FONT, fontSize: 13, color: "#101828" }, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: "0 0 8px", fontWeight: 600 }, children: "Before you go: did we get each one right?" }),
    units.length === 0 ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { ...noteStyle, marginBottom: 8 }, children: "No units this session. Finishing releases anything the agent still holds." }) : /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "ul", { style: listStyle, children: units.map((unit) => {
      const confirmation = confirmationFor(unit);
      const anchor = describeAnchor2(unit);
      return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "li", { "data-riffrec-confirm-unit": unit.id, style: itemStyle, children: [
        /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { children: unit.statement }),
        anchor ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { ...noteStyle, marginTop: 2 }, children: anchor }) : null,
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: { display: "flex", gap: 14, marginTop: 6, fontSize: 12 }, children: [
          /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "label", { style: { display: "inline-flex", gap: 6, alignItems: "center" }, children: [
            /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
              "input",
              {
                type: "checkbox",
                "data-riffrec-confirm-element": "",
                checked: confirmation.element,
                onChange: (event) => toggle(unit, "element", event.currentTarget.checked)
              }
            ),
            "Right element"
          ] }),
          /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "label", { style: { display: "inline-flex", gap: 6, alignItems: "center" }, children: [
            /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
              "input",
              {
                type: "checkbox",
                "data-riffrec-confirm-change": "",
                checked: confirmation.change,
                onChange: (event) => toggle(unit, "change", event.currentTarget.checked)
              }
            ),
            "Right change"
          ] })
        ] })
      ] }, unit.id);
    }) }),
    /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", "data-riffrec-confirm-cancel": "", disabled: busy, style: smallButtonStyle, onClick: onCancel, children: "Keep riffing" }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-confirm-finish": "",
          disabled: busy,
          style: busy ? { ...primaryButtonStyle, opacity: 0.56, cursor: "not-allowed" } : primaryButtonStyle,
          onClick: complete,
          children: busy ? "Finishing\u2026" : "Finish session"
        }
      )
    ] })
  ] });
}

// src/live/overlay/ConsentDialog.tsx


// src/live/overlay/consentCopy.ts
var DEFAULT_CONSENT_PROFILE = {
  transcript: true,
  strokes: true,
  frames: true,
  audio_clip: false,
  telemetry_window: false
};
var OPENAI_DESTINATION = "OpenAI Realtime (the voice interviewer)";
function resolveConsentProfile(profile) {
  return { ...DEFAULT_CONSENT_PROFILE, ..._nullishCoalesce(profile, () => ( {})) };
}
function describeEndpoint(endpoint, owner) {
  if (owner && endpoint) return `${owner} (${endpoint})`;
  if (owner) return owner;
  return _nullishCoalesce(endpoint, () => ( "no endpoint"));
}
function endpointItems(profile) {
  const items = [];
  if (profile.transcript) items.push("the transcript of what you say");
  items.push("units: each change you ask for, with the element it points at");
  items.push("clicks, navigation, network URLs and statuses, console errors");
  if (profile.strokes) items.push("your drawings and pins, with the element under them");
  if (profile.frames) items.push("screenshots and annotated frames of the page");
  if (profile.audio_clip) items.push("short audio clips of each request");
  if (profile.telemetry_window) items.push("network and console telemetry around each request");
  return items;
}
function buildConsentCopy(input) {
  const profile = resolveConsentProfile(input.profile);
  const streams = input.endpoint !== null;
  const voice = _nullishCoalesce(input.voice, () => ( streams));
  const endpointName = describeEndpoint(input.endpoint, input.endpointOwner);
  const destinations = [];
  if (voice && streams) {
    const items = ["microphone audio while the session is live", "the session brief the endpoint wrote about this app"];
    if (profile.frames) items.push("what you click, draw on, and pin, and screenshots of the page when you point at something or ask the interviewer to look");
    else items.push("what you click, draw on, and pin");
    destinations.push({ id: "openai", to: OPENAI_DESTINATION, items });
  }
  if (streams) {
    destinations.push({ id: "endpoint", to: endpointName, items: endpointItems(profile) });
  } else {
    destinations.push({
      id: "local",
      to: "a local archive on this device",
      items: ["screen recording and microphone audio", "clicks, navigation, network URLs and statuses, console errors", "your drawings and pins"]
    });
  }
  return {
    title: "Start a live session?",
    intro: streams ? "While the session is live, riffrec streams what you say and do on this page as it happens." : "No endpoint is configured, so nothing streams: the session is saved as a local archive when you stop.",
    destinations,
    retention: streams ? `${endpointName} keeps a local session log with everything listed above until you delete it.` : null,
    noExclusions: "Screenshots and frames exclude nothing automatically: anything visible on the page can appear in them. You can pause frame and stream capture at any time from the live indicator.",
    microphone: voice ? "Accepting asks your browser for microphone access. If you decline the microphone, the session continues with drawing and the board only." : "Accepting asks your browser for microphone access for the local recording. If you decline the microphone, the session continues with drawing and the board only.",
    acceptLabel: "Accept and start",
    declineLabel: "Not now"
  };
}

// src/live/overlay/ConsentDialog.tsx

var FONT2 = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
var backdropStyle = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(12, 18, 28, 0.56)",
  padding: 16
};
var dialogStyle = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 24px 80px rgba(16, 24, 40, 0.28)",
  padding: 24,
  fontFamily: FONT2,
  fontSize: 14,
  lineHeight: 1.5
};
var buttonStyle2 = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "9px 14px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer"
};
var secondaryButtonStyle2 = {
  ...buttonStyle2,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};
var disabledButtonStyle = {
  ...buttonStyle2,
  cursor: "not-allowed",
  opacity: 0.56
};
var noticeStyle = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 6,
  background: "#fffaeb",
  border: "1px solid #fedf89",
  color: "#7a2e0e"
};
function defaultGetUserMedia2(constraints) {
  if (typeof navigator === "undefined" || !_optionalChain([navigator, 'access', _262 => _262.mediaDevices, 'optionalAccess', _263 => _263.getUserMedia])) {
    return Promise.reject(new Error("Microphone access is not available in this browser."));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}
function errorMessage(error) {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = error.message;
  return typeof message === "string" && message.length > 0 ? message : null;
}
function ConsentDialog({
  onAccept,
  onDecline,
  getUserMedia = defaultGetUserMedia2,
  zIndex = 2147483647,
  ...copyInput
}) {
  const copy = buildConsentCopy(copyInput);
  const [checked, setChecked] = _react.useState.call(void 0, false);
  const [stage, setStage] = _react.useState.call(void 0, "reading");
  const [denialReason, setDenialReason] = _react.useState.call(void 0, null);
  const requestInFlight = _react.useRef.call(void 0, false);
  const accept = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setStage("requesting");
    try {
      const stream = await getUserMedia({ audio: true });
      onAccept({ stream, mic: "granted" });
    } catch (error) {
      setDenialReason(_nullishCoalesce(errorMessage(error), () => ( "Microphone access was denied.")));
      setStage("denied");
    } finally {
      requestInFlight.current = false;
    }
  };
  const busy = stage === "requesting";
  return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { "data-riffrec-consent": "", style: { ...backdropStyle, zIndex }, children: /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { role: "dialog", "aria-modal": "true", "aria-label": copy.title, style: dialogStyle, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "h2", { style: { margin: "0 0 12px", fontSize: 20, lineHeight: 1.2 }, children: copy.title }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: "0 0 12px" }, children: copy.intro }),
    copy.destinations.map((destination) => /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-consent-destination": destination.id, style: { marginBottom: 12 }, children: [
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "p", { style: { margin: "0 0 4px", fontWeight: 600 }, children: [
        "To ",
        destination.to,
        ":"
      ] }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "ul", { style: { margin: 0, paddingLeft: 20 }, children: destination.items.map((item) => /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "li", { children: item }, item)) })
    ] }, destination.id)),
    copy.retention ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { "data-riffrec-consent-retention": "", style: { margin: "0 0 12px" }, children: copy.retention }) : null,
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: "0 0 12px" }, children: copy.noExclusions }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: 0 }, children: copy.microphone }),
    stage === "denied" ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { role: "status", "data-riffrec-consent-mic-denied": "", style: noticeStyle, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "strong", { children: "Microphone unavailable." }),
      " ",
      denialReason,
      " You can continue with drawing and the board; the interviewer will not run."
    ] }) : null,
    /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "label", { style: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18 }, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "input",
        {
          type: "checkbox",
          checked,
          disabled: busy,
          onChange: (event) => setChecked(event.currentTarget.checked)
        }
      ),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { children: "I understand what is streamed and to whom, and I consent to this live session." })
    ] }),
    /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", "data-riffrec-consent-decline": "", style: secondaryButtonStyle2, disabled: busy, onClick: onDecline, children: copy.declineLabel }),
      stage === "denied" ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-consent-continue-novoice": "",
          style: checked ? buttonStyle2 : disabledButtonStyle,
          disabled: !checked,
          onClick: () => onAccept({ stream: null, mic: "denied" }),
          children: "Continue without microphone"
        }
      ) : /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-consent-accept": "",
          style: !checked || busy ? disabledButtonStyle : buttonStyle2,
          disabled: !checked || busy,
          onClick: accept,
          children: busy ? "Requesting microphone\u2026" : copy.acceptLabel
        }
      )
    ] })
  ] }) });
}

// src/live/overlay/EndedCard.tsx

var RESIDUAL_STATUSES = ["needs_info", "blocked"];
function countByStatus(units) {
  const counts = Object.fromEntries(_chunk4XWUXLDEcjs.UNIT_STATUSES.map((status) => [status, 0]));
  for (const unit of units) counts[unit.status] += 1;
  return counts;
}
function residualCount(counts) {
  return RESIDUAL_STATUSES.reduce((total, status) => total + counts[status], 0);
}
var FONT3 = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
var cardStyle = {
  fontFamily: FONT3,
  fontSize: 13,
  color: "#101828",
  background: "#ffffff",
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  boxShadow: "0 12px 40px rgba(16, 24, 40, 0.18)",
  padding: 16,
  width: 300
};
var countsStyle = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  rowGap: 4,
  columnGap: 12
};
var buttonStyle3 = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "5px 10px",
  cursor: "pointer"
};
function EndedCard({ units, reason, residualHint, onDismiss }) {
  const counts = countByStatus(units);
  const residuals = residualCount(counts);
  const shown = _chunk4XWUXLDEcjs.UNIT_STATUSES.filter((status) => counts[status] > 0);
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { role: "status", "data-riffrec-ended-card": "", style: cardStyle, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: 0, fontWeight: 600, fontSize: 15 }, children: "Live session ended" }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { style: { margin: "4px 0 0", color: "#475467" }, children: units.length === 0 ? "No units were recorded. Everything you streamed is in the endpoint's session log." : `${units.length} ${units.length === 1 ? "unit" : "units"} streamed to the endpoint as they happened; the session log is there.` }),
    shown.length > 0 ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "ul", { "data-riffrec-ended-counts": "", style: countsStyle, children: shown.map((status) => /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "li", { "data-riffrec-ended-count": status, style: { display: "contents" }, children: [
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { children: STATUS_LABELS[status] }),
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: { fontWeight: 600, textAlign: "right" }, children: counts[status] })
    ] }, status)) }) : null,
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { "data-riffrec-ended-residual": "", style: { margin: "10px 0 0", color: "#475467" }, children: residuals > 0 ? `${residuals} ${residuals === 1 ? "unit needs" : "units need"} follow-up. ${_nullishCoalesce(residualHint, () => ( "Your agent's residual list has them, ready to hand to planning."))}` : _nullishCoalesce(residualHint, () => ( "Anything beyond this session is in your agent's residual list.")) }),
    reason && reason !== "riffer_done" ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "p", { "data-riffrec-ended-reason": "", style: { margin: "6px 0 0", fontSize: 12, color: "#667085" }, children: [
      "Ended by the endpoint: ",
      reason
    ] }) : null,
    onDismiss ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { style: { display: "flex", justifyContent: "flex-end", marginTop: 12 }, children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", "data-riffrec-ended-dismiss": "", style: buttonStyle3, onClick: onDismiss, children: "Close" }) }) : null
  ] });
}

// src/live/overlay/LiveIndicator.tsx

function hostOf(endpoint) {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch (e19) {
    return endpoint;
  }
}
function deriveIndicatorState(input) {
  const base = baseIndicatorState(input.status);
  const flowing = base === "connecting" || base === "reconnecting" || base === "streaming" || base === "novoice";
  if ((flowing || base === "buffering") && input.paused) return "paused";
  if (flowing && (input.muted || input.mic === "denied")) return "muted";
  return base;
}
function baseIndicatorState(status) {
  switch (status) {
    case "idle":
      return "idle";
    case "consenting":
      return "consenting";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "live":
      return "streaming";
    case "live_novoice":
      return "novoice";
    case "buffering":
      return "buffering";
    case "incompatible":
      return "incompatible";
    case "ended":
      return "ended";
    case "error":
      return "error";
    default: {
      const exhaustive = status;
      return exhaustive;
    }
  }
}
function isRunning(status) {
  switch (status) {
    case "connecting":
    case "live":
    case "live_novoice":
    case "buffering":
    case "reconnecting":
    case "incompatible":
      return true;
    case "idle":
    case "consenting":
    case "ended":
    case "error":
      return false;
    default: {
      const exhaustive = status;
      return exhaustive;
    }
  }
}
function describeIndicator(input) {
  const state = deriveIndicatorState(input);
  const host = hostOf(input.endpoint);
  switch (state) {
    case "idle":
      return { state, label: "Not live", short: "Off", color: "#98a2b3", pulse: false };
    case "consenting":
      return { state, label: "Waiting for consent", short: "Consent", color: "#98a2b3", pulse: false };
    case "connecting":
      return { state, label: "Connecting to the interviewer\u2026", short: "Connecting", color: "#f79009", pulse: true };
    case "reconnecting":
      return { state, label: "Reconnecting to the interviewer\u2026", short: "Reconnecting", color: "#f79009", pulse: true };
    case "streaming":
      return {
        state,
        label: host ? `Live \xB7 streaming to ${host}` : "Live \xB7 streaming",
        short: "Live",
        color: "#12b76a",
        pulse: true
      };
    case "novoice":
      return {
        state,
        label: host ? `Live \xB7 no voice \xB7 streaming to ${host}` : "Live \xB7 no voice \xB7 saving locally",
        short: "Live \xB7 no voice",
        color: "#12b76a",
        pulse: true
      };
    case "buffering":
      return {
        state,
        label: "Buffering locally \xB7 endpoint unreachable",
        short: "Buffering",
        color: "#f79009",
        pulse: true
      };
    case "muted":
      return { state, label: "Microphone muted \xB7 still streaming", short: "Muted", color: "#667085", pulse: false };
    case "paused":
      return { state, label: "Capture paused \xB7 frames and stream held", short: "Paused", color: "#667085", pulse: false };
    case "incompatible":
      return {
        state,
        label: input.expectedSchemaVersion ? `Incompatible endpoint \xB7 expects ${input.expectedSchemaVersion}` : "Incompatible endpoint",
        short: "Incompatible",
        color: "#d92d20",
        pulse: false
      };
    case "ended":
      return { state, label: "Session ended", short: "Ended", color: "#98a2b3", pulse: false };
    case "error":
      return {
        state,
        label: input.error ? `Error \xB7 ${input.error.message}` : "Error",
        short: "Error",
        color: "#d92d20",
        pulse: false
      };
    default: {
      const exhaustive = state;
      return exhaustive;
    }
  }
}
var rootStyle2 = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#101828",
  minWidth: 0
};
var dotStyle = {
  width: 9,
  height: 9,
  borderRadius: "50%",
  flex: "none"
};
var iconButtonStyle = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  padding: "3px 8px",
  cursor: "pointer"
};
var iconButtonPressedStyle = {
  ...iconButtonStyle,
  background: "#344054",
  borderColor: "#344054",
  color: "#ffffff"
};
function LiveIndicator({ onToggleMute, onTogglePause, compact = false, ...input }) {
  const view = describeIndicator(input);
  const running = isRunning(input.status);
  const micDenied = input.mic === "denied";
  const showControls = !compact && running && (onToggleMute || onTogglePause);
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { "data-riffrec-live-indicator": view.state, "aria-live": "polite", style: rootStyle2, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "aria-hidden": "true", style: { ...dotStyle, background: view.color, boxShadow: view.pulse ? `0 0 0 3px ${view.color}33` : void 0 } }),
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "data-riffrec-live-indicator-label": "", style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: compact ? view.short : view.label }),
    showControls ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { style: { display: "inline-flex", gap: 6, marginLeft: 4 }, children: [
      onToggleMute ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-live-mute": "",
          "aria-pressed": input.muted,
          "aria-label": input.muted ? "Unmute microphone" : "Mute microphone",
          disabled: micDenied,
          title: micDenied ? "Microphone was denied" : void 0,
          style: input.muted ? iconButtonPressedStyle : iconButtonStyle,
          onClick: onToggleMute,
          children: input.muted ? "Unmute" : "Mute"
        }
      ) : null,
      onTogglePause ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-live-pause": "",
          "aria-pressed": _nullishCoalesce(input.paused, () => ( false)),
          "aria-label": input.paused ? "Resume frame and stream capture" : "Pause frame and stream capture",
          style: input.paused ? iconButtonPressedStyle : iconButtonStyle,
          onClick: onTogglePause,
          children: input.paused ? "Resume" : "Pause"
        }
      ) : null
    ] }) : null
  ] });
}

// src/live/overlay/ModeSwitch.tsx

var MODE_LABELS = {
  instant: "Instant",
  smart: "Smart",
  collect: "Collect"
};
var MODE_DESCRIPTIONS = {
  instant: "Applies everything it can at each checkpoint, guessing on ambiguous units and noting the guess.",
  smart: "Applies clear bounded edits, asks about ambiguous ones, sends anything larger to the residual list.",
  collect: "Applies nothing during the riff; the accepted batch lands as one pass when you say done."
};
var PENDING_MODE_HINT = "Pending until next checkpoint";
var groupStyle = {
  display: "inline-flex",
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  overflow: "hidden",
  background: "#ffffff"
};
var optionStyle = {
  border: "none",
  borderRight: "1px solid #d0d5dd",
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 10px",
  cursor: "pointer"
};
var optionSelectedStyle = {
  ...optionStyle,
  background: "#101828",
  color: "#ffffff"
};
var hintStyle = {
  display: "block",
  marginTop: 4,
  fontSize: 11,
  color: "#b54708"
};
function ModeSwitch({ mode, pendingMode, onChange, disabled = false }) {
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-mode-switch": "", style: { display: "inline-block" }, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { role: "radiogroup", "aria-label": "Execution mode", style: { ...groupStyle, opacity: disabled ? 0.56 : 1 }, children: _chunk4XWUXLDEcjs.EXECUTION_MODES.map((option, index) => {
      const selected = option === mode;
      const last = index === _chunk4XWUXLDEcjs.EXECUTION_MODES.length - 1;
      return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": selected,
          "data-riffrec-mode-option": option,
          title: MODE_DESCRIPTIONS[option],
          disabled,
          style: { ...selected ? optionSelectedStyle : optionStyle, ...last ? { borderRight: "none" } : {} },
          onClick: () => {
            if (!selected) onChange(option);
          },
          children: MODE_LABELS[option]
        },
        option
      );
    }) }),
    pendingMode !== null ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { "data-riffrec-mode-pending": pendingMode, role: "status", style: hintStyle, children: [
      MODE_LABELS[pendingMode],
      ": ",
      PENDING_MODE_HINT.toLowerCase()
    ] }) : null
  ] });
}

// src/live/overlay/SendControl.tsx


var buttonStyle4 = {
  border: "1px solid #344054",
  borderRadius: 6,
  padding: "5px 12px",
  background: "#101828",
  color: "#ffffff",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap"
};
var secondaryButtonStyle3 = {
  ...buttonStyle4,
  background: "#ffffff",
  color: "#344054",
  borderColor: "#d0d5dd"
};
var disabledStyle = {
  cursor: "not-allowed",
  opacity: 0.56
};
var noteStyle2 = {
  fontSize: 11,
  color: "#667085",
  marginLeft: 6
};
function SendControl({ onSend, onDone, heldCount = 0, disabled = false, compact = false }) {
  const [sending, setSending] = _react.useState.call(void 0, false);
  const [lastSend, setLastSend] = _react.useState.call(void 0, null);
  const sendInFlight = _react.useRef.call(void 0, false);
  const send = async () => {
    if (sendInFlight.current) return;
    sendInFlight.current = true;
    setSending(true);
    setLastSend(null);
    try {
      const emitted = await onSend();
      setLastSend(emitted ? "sent" : "nothing");
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  };
  const busy = disabled || sending;
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "span", { "data-riffrec-send-control": "", style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      "button",
      {
        type: "button",
        "data-riffrec-send": "",
        "aria-label": heldCount > 0 ? `Send ${heldCount} held ${heldCount === 1 ? "unit" : "units"} now` : "Send now",
        title: "Release held units to the agent now",
        disabled: busy,
        style: busy ? { ...buttonStyle4, ...disabledStyle } : buttonStyle4,
        onClick: send,
        children: sending ? "Sending\u2026" : heldCount > 0 ? `Send (${heldCount})` : "Send"
      }
    ),
    !compact ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      "button",
      {
        type: "button",
        "data-riffrec-done": "",
        title: "Confirm each unit, then end the session",
        disabled,
        style: disabled ? { ...secondaryButtonStyle3, ...disabledStyle } : secondaryButtonStyle3,
        onClick: onDone,
        children: "Done"
      }
    ) : null,
    !compact && lastSend === "nothing" && heldCount === 0 ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { "data-riffrec-send-note": "nothing", role: "status", style: noteStyle2, children: "Nothing held" }) : null
  ] });
}

// src/live/overlay/LiveOverlay.tsx

function useLiveSnapshot(session) {
  const [snapshot, setSnapshot] = _react.useState.call(void 0, () => session.snapshot());
  _react.useEffect.call(void 0, () => {
    setSnapshot(session.snapshot());
    return session.subscribe(setSnapshot);
  }, [session]);
  return snapshot;
}
var PANEL_WIDTH = 320;
var FONT4 = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
var panelStyle = {
  position: "fixed",
  top: 16,
  right: 16,
  width: PANEL_WIDTH,
  maxHeight: "calc(100vh - 32px)",
  display: "flex",
  flexDirection: "column",
  background: "#f9fafb",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 10,
  boxShadow: "0 16px 48px rgba(16, 24, 40, 0.22)",
  fontFamily: FONT4,
  fontSize: 13,
  pointerEvents: "auto",
  overflow: "hidden"
};
var pillStyle = {
  position: "fixed",
  top: 16,
  right: 16,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px 6px 12px",
  background: "#ffffff",
  color: "#101828",
  border: "1px solid #d0d5dd",
  borderRadius: 999,
  boxShadow: "0 8px 24px rgba(16, 24, 40, 0.18)",
  fontFamily: FONT4,
  fontSize: 13,
  pointerEvents: "auto"
};
var headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid #eaecf0",
  background: "#ffffff"
};
var toolbarStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid #eaecf0",
  flexWrap: "wrap"
};
var bodyStyle = {
  padding: 12,
  overflowY: "auto",
  flex: 1,
  minHeight: 0
};
var footerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 12px",
  borderTop: "1px solid #eaecf0",
  background: "#ffffff"
};
var iconButtonStyle2 = {
  border: "1px solid #d0d5dd",
  borderRadius: 6,
  background: "#ffffff",
  color: "#344054",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 8px",
  cursor: "pointer",
  whiteSpace: "nowrap"
};
var iconButtonPressedStyle2 = {
  ...iconButtonStyle2,
  background: "#d92d20",
  borderColor: "#d92d20",
  color: "#ffffff"
};
var endedWrapStyle = {
  position: "fixed",
  top: 16,
  right: 16,
  pointerEvents: "auto"
};
function agentNotes(snapshot, session) {
  const guesses = {};
  const notes = {};
  for (const unit of snapshot.units) {
    const guess = session.guessFor(unit.id);
    if (guess) guesses[unit.id] = guess;
    const note = session.noteFor(unit.id);
    if (note) notes[unit.id] = note;
  }
  return { guesses, notes };
}
function LiveOverlay({
  session,
  profile,
  endpointOwner,
  drawShortcut = DEFAULT_DRAW_SHORTCUT,
  route,
  getUserMedia,
  onConsent,
  onDecline,
  onAnnotation,
  onFinished,
  paused: controlledPaused,
  onPauseChange,
  residualHint,
  zIndex = 2147483e3,
  defaultCollapsed = false,
  now
}) {
  const snapshot = useLiveSnapshot(session);
  const [collapsed, setCollapsed] = _react.useState.call(void 0, defaultCollapsed);
  const [drawing, setDrawing] = _react.useState.call(void 0, false);
  const [view, setView] = _react.useState.call(void 0, "board");
  const [finishing, setFinishing] = _react.useState.call(void 0, false);
  const [finished, setFinished] = _react.useState.call(void 0, false);
  const [uncontrolledPaused, setUncontrolledPaused] = _react.useState.call(void 0, false);
  const [endedReason, setEndedReason] = _react.useState.call(void 0, null);
  const [dismissed, setDismissed] = _react.useState.call(void 0, false);
  const paused = _nullishCoalesce(controlledPaused, () => ( uncontrolledPaused));
  const onPauseChangeRef = _react.useRef.call(void 0, onPauseChange);
  onPauseChangeRef.current = onPauseChange;
  const uncontrolledPausedRef = _react.useRef.call(void 0, uncontrolledPaused);
  uncontrolledPausedRef.current = uncontrolledPaused;
  _react.useEffect.call(void 0, () => {
    setView("board");
    setDrawing(false);
    setFinished(false);
    setEndedReason(null);
    setDismissed(false);
    if (uncontrolledPausedRef.current) _optionalChain([onPauseChangeRef, 'access', _264 => _264.current, 'optionalCall', _265 => _265(false)]);
    setUncontrolledPaused(false);
  }, [session]);
  _react.useEffect.call(void 0, () => {
    return session.on("ended", ({ reason }) => setEndedReason(_nullishCoalesce(reason, () => ( "ended"))));
  }, [session]);
  const sessionNow = _react.useMemo.call(void 0, () => _nullishCoalesce(now, () => ( (() => Math.max(0, Date.now() - session.startedAt)))), [now, session]);
  const handleConsent = _react.useCallback.call(void 0, 
    (result) => {
      if (result.mic === "granted") session.micGranted();
      else session.micDenied();
      session.start();
      _optionalChain([onConsent, 'optionalCall', _266 => _266(result)]);
    },
    [session, onConsent]
  );
  const handleDecline = _react.useCallback.call(void 0, () => {
    session.declineConsent();
    _optionalChain([onDecline, 'optionalCall', _267 => _267()]);
  }, [session, onDecline]);
  const handleAnnotation = _react.useCallback.call(void 0, 
    (annotation) => {
      if (onAnnotation) onAnnotation(annotation);
      else session.addAnnotation(annotation);
    },
    [session, onAnnotation]
  );
  const togglePause = _react.useCallback.call(void 0, () => {
    const next = !paused;
    if (controlledPaused === void 0) setUncontrolledPaused(next);
    _optionalChain([onPauseChangeRef, 'access', _268 => _268.current, 'optionalCall', _269 => _269(next)]);
  }, [paused, controlledPaused]);
  const handleMode = _react.useCallback.call(void 0, (mode) => session.setMode(mode), [session]);
  const handleSend = _react.useCallback.call(void 0, () => session.send(), [session]);
  const handleWithdraw = _react.useCallback.call(void 0, (unitId) => void session.withdrawUnit(unitId, "riffer"), [session]);
  const handleAnswer = _react.useCallback.call(void 0, (unitId, text) => void session.answer(unitId, text), [session]);
  const finishInFlight = _react.useRef.call(void 0, false);
  const handleConfirmations = _react.useCallback.call(void 0, 
    async (confirmations) => {
      if (finishInFlight.current || finished) return;
      finishInFlight.current = true;
      setFinishing(true);
      try {
        for (const [unitId, confirmation] of Object.entries(confirmations)) {
          session.confirmUnit(unitId, confirmation);
        }
        setFinished(true);
        const result = await session.finish();
        _optionalChain([onFinished, 'optionalCall', _270 => _270(result)]);
      } finally {
        finishInFlight.current = false;
        setFinishing(false);
        setView("board");
      }
    },
    [session, onFinished, finished]
  );
  const running = snapshot.phase === "running" && !finished;
  if (snapshot.phase === "consenting") {
    return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { ...{ [OVERLAY_ATTRIBUTE]: "" }, "data-riffrec-live-overlay": "consenting", children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      ConsentDialog,
      {
        profile,
        endpoint: snapshot.endpoint,
        endpointOwner,
        voice: session.hasEndpoint,
        getUserMedia,
        onAccept: handleConsent,
        onDecline: handleDecline,
        zIndex: zIndex + 2
      }
    ) });
  }
  if (snapshot.phase === "ended") {
    if (endedReason === "stopped" || dismissed) return null;
    return /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { ...{ [OVERLAY_ATTRIBUTE]: "" }, "data-riffrec-live-overlay": "ended", style: { ...endedWrapStyle, zIndex: zIndex + 1 }, children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, EndedCard, { units: snapshot.units, reason: endedReason, residualHint, onDismiss: () => setDismissed(true) }) });
  }
  if (snapshot.phase === "idle") return null;
  const { guesses, notes } = agentNotes(snapshot, session);
  const held = session.heldUnits().length;
  const confirmable = snapshot.units.filter((unit) => unit.status !== "withdrawn");
  const errored = snapshot.phase === "error";
  const indicator = (compact) => /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
    LiveIndicator,
    {
      status: snapshot.status,
      muted: snapshot.muted,
      mic: snapshot.mic,
      paused,
      expectedSchemaVersion: snapshot.expectedSchemaVersion,
      endpoint: snapshot.endpoint,
      error: snapshot.error,
      compact,
      onToggleMute: running ? () => session.setMuted(!snapshot.muted) : void 0,
      onTogglePause: running ? togglePause : void 0
    }
  );
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { ...{ [OVERLAY_ATTRIBUTE]: "" }, "data-riffrec-live-overlay": collapsed ? "collapsed" : "expanded", children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      DrawingLayer,
      {
        annotations: snapshot.annotations,
        onAnnotation: handleAnnotation,
        active: drawing && running,
        onActiveChange: setDrawing,
        shortcut: drawShortcut,
        route,
        now: sessionNow,
        showToggle: false,
        zIndex
      }
    ),
    collapsed && view === "board" ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-live-pill": "", style: { ...pillStyle, zIndex: zIndex + 1 }, children: [
      indicator(true),
      running ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, SendControl, { onSend: handleSend, heldCount: held, onDone: () => setView("confirming"), compact: true }) : null,
      /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        "button",
        {
          type: "button",
          "data-riffrec-live-expand": "",
          "aria-label": "Expand live panel",
          "aria-expanded": false,
          style: iconButtonStyle2,
          onClick: () => setCollapsed(false),
          children: "\u25B8"
        }
      )
    ] }) : /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { "data-riffrec-live-panel": "", role: "region", "aria-label": "Riffrec live", style: { ...panelStyle, zIndex: zIndex + 1 }, children: [
      /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: headerStyle, children: [
        indicator(false),
        view === "board" ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
          "button",
          {
            type: "button",
            "data-riffrec-live-collapse": "",
            "aria-label": "Collapse live panel",
            "aria-expanded": true,
            style: iconButtonStyle2,
            onClick: () => setCollapsed(true),
            children: "\u25BE"
          }
        ) : null
      ] }),
      view === "board" ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, _jsxruntime.Fragment, { children: [
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: toolbarStyle, children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, ModeSwitch, { mode: snapshot.mode, pendingMode: snapshot.pendingMode, onChange: handleMode, disabled: !running }),
          /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
            "button",
            {
              type: "button",
              "data-riffrec-draw-toggle": "",
              "aria-pressed": drawing && running,
              "aria-label": drawing ? "Stop drawing" : "Draw on the page",
              title: drawShortcut ? `Draw (${drawShortcut})` : "Draw",
              disabled: !running,
              style: drawing && running ? iconButtonPressedStyle2 : iconButtonStyle2,
              onClick: () => setDrawing((current) => !current),
              children: [
                "\u270E ",
                drawing && running ? "Drawing" : "Draw"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: bodyStyle, children: [
          errored && snapshot.error ? /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "p", { role: "alert", "data-riffrec-live-error": "", style: { margin: "0 0 10px", color: "#b42318" }, children: snapshot.error.message }) : null,
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
            Board,
            {
              units: snapshot.units,
              questions: snapshot.openQuestions,
              guesses,
              notes,
              isReleased: (id) => session.isReleased(id),
              mode: snapshot.mode,
              voice: snapshot.voice === "live" || snapshot.voice === "connecting" || snapshot.voice === "reconnecting",
              onWithdraw: running ? handleWithdraw : void 0,
              onAnswer: running ? handleAnswer : void 0
            }
          )
        ] }),
        /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, "div", { style: footerStyle, children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { style: { fontSize: 11, color: "#667085" }, children: held > 0 ? `${held} held for the next checkpoint` : "Nothing held" }),
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, SendControl, { onSend: handleSend, heldCount: held, onDone: () => setView("confirming"), disabled: !running })
        ] })
      ] }) : /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "div", { style: bodyStyle, children: /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
        ConfirmationPass,
        {
          units: confirmable,
          busy: finishing,
          onCancel: () => setView("board"),
          onComplete: handleConfirmations
        }
      ) })
    ] })
  ] });
}

// src/live/LiveOverlay.tsx

var resharePromptStyle = {
  position: "fixed",
  left: "50%",
  bottom: 24,
  transform: "translateX(-50%)",
  zIndex: 2147483001,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#101828",
  color: "#ffffff",
  boxShadow: "0 16px 48px rgba(16, 24, 40, 0.3)",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  pointerEvents: "auto"
};
var reshareButtonStyle = {
  border: "1px solid rgba(255, 255, 255, 0.3)",
  borderRadius: 6,
  background: "#ffffff",
  color: "#101828",
  font: "inherit",
  fontWeight: 600,
  padding: "5px 10px",
  cursor: "pointer"
};
var reshareDismissStyle = {
  ...reshareButtonStyle,
  background: "transparent",
  color: "#ffffff"
};
function LiveMount({
  config,
  capture,
  onHandle,
  onSnapshot,
  onEnded,
  onError,
  getUserMedia,
  fetch: fetchImpl
}) {
  const runtimeRef = _react.useRef.call(void 0, null);
  const [session, setSession] = _react.useState.call(void 0, null);
  const [reshareNeeded, setReshareNeeded] = _react.useState.call(void 0, false);
  const callbacks = _react.useRef.call(void 0, { onHandle, onSnapshot, onEnded, onError });
  callbacks.current = { onHandle, onSnapshot, onEnded, onError };
  const captureRef = _react.useRef.call(void 0, capture);
  captureRef.current = capture;
  _react.useEffect.call(void 0, () => {
    let runtime2 = null;
    runtime2 = new LiveRuntime({
      config,
      capture: captureRef.current,
      getUserMedia,
      fetch: fetchImpl,
      callbacks: {
        onSnapshot: (snapshot) => {
          if (runtime2) setSession(runtime2.session);
          callbacks.current.onSnapshot(snapshot);
        },
        onEnded: () => callbacks.current.onEnded(),
        onReshareNeeded: setReshareNeeded,
        onError: (error) => callbacks.current.onError(error)
      }
    });
    const created = runtime2;
    runtimeRef.current = created;
    setSession(created.session);
    callbacks.current.onHandle({
      begin: (options) => created.begin(options),
      stop: () => created.stop(),
      setMode: (mode) => created.setMode(mode),
      setMuted: (muted) => created.setMuted(muted),
      send: () => created.send()
    });
    return () => {
      callbacks.current.onHandle(null);
      created.suspend();
      runtimeRef.current = null;
    };
  }, []);
  const handlePause = _react.useCallback.call(void 0, (paused) => _optionalChain([runtimeRef, 'access', _271 => _271.current, 'optionalAccess', _272 => _272.setPaused, 'call', _273 => _273(paused)]), []);
  if (!session) return null;
  const runtime = runtimeRef.current;
  return /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, _jsxruntime.Fragment, { children: [
    /* @__PURE__ */ _jsxruntime.jsx.call(void 0, 
      LiveOverlay,
      {
        session,
        profile: _optionalChain([runtime, 'optionalAccess', _274 => _274.consentProfile]),
        endpointOwner: config.endpointOwner,
        drawShortcut: config.drawShortcut,
        getUserMedia,
        onConsent: (result) => _optionalChain([runtime, 'optionalAccess', _275 => _275.consent, 'call', _276 => _276(result)]),
        onAnnotation: _optionalChain([runtime, 'optionalAccess', _277 => _277.annotation]),
        onFinished: (result) => _optionalChain([runtime, 'optionalAccess', _278 => _278.finished, 'call', _279 => _279(result)]),
        onPauseChange: handlePause
      }
    ),
    reshareNeeded && runtime ? /* @__PURE__ */ _jsxruntime.jsxs.call(void 0, 
      "div",
      {
        ...{ [OVERLAY_ATTRIBUTE]: "" },
        role: "status",
        "aria-live": "polite",
        "data-riffrec-live-reshare": "",
        style: resharePromptStyle,
        children: [
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "span", { children: "The page reloaded. Share your screen again to keep recording." }),
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", style: reshareButtonStyle, onClick: () => void runtime.reshare(), children: "Share screen" }),
          /* @__PURE__ */ _jsxruntime.jsx.call(void 0, "button", { type: "button", style: reshareDismissStyle, onClick: () => runtime.dismissReshare(), children: "Not now" })
        ]
      }
    ) : null
  ] });
}


exports.default = LiveMount;
//# sourceMappingURL=LiveOverlay-OURCDSW5.cjs.map