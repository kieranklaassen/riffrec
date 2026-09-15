export {
  ATTACH_LOOKBACK_MS,
  AnnotationAttacher,
  DRAWING_ONLY_AFTER_SPEECH_MS,
  type AnnotationAttacherOptions,
  type AnnotationResolution
} from "./attach";
export {
  AudioClipRecorder,
  chooseClipMimeType,
  clipFileName,
  type AudioClip,
  type AudioClipRecorderOptions,
  type ClipRecorderFactory,
  type ClipRecorderLike
} from "./audioClip";
export {
  COMPOSITE_PIN_COLOR,
  COMPOSITE_STROKE_COLOR,
  CompositeRenderer,
  createCanvasCompositeDrawer,
  type CanvasCompositeOptions,
  type CompositeDrawer,
  type CompositeInput,
  type CompositeRendererOptions,
  type CompositeResult
} from "./composite";
export {
  DEFAULT_FRAME_JPEG_QUALITY,
  FRAME_BUFFER_CAPACITY,
  FrameBuffer,
  PERIODIC_FRAME_MS,
  createDisplayFrameGrabber,
  dataUrlToBase64,
  type BufferedFrameKind,
  type DisplayGrabberOptions,
  type FrameBufferOptions,
  type FrameGrabber
} from "./frames";
export {
  LiveEvidence,
  TELEMETRY_WINDOW_MS,
  describeAnnotation,
  type EvidenceSession,
  type LiveEvidenceOptions
} from "./liveEvidence";
export {
  ANCHORS_TRANSCRIPT_ONLY_PROFILE,
  DEFAULT_EVIDENCE_PROFILE,
  EVIDENCE_PROFILES,
  EVIDENCE_PROFILE_NAMES,
  FULL_EVIDENCE_PROFILE,
  applyEvidenceProfile,
  frameWirePolicy,
  isEvidenceProfileName,
  resolveEvidenceProfile,
  selectUnitFrames,
  type EvidenceFrames,
  type EvidenceProfile,
  type EvidenceProfileInput,
  type EvidenceProfileName,
  type FrameWirePolicy
} from "./profile";
