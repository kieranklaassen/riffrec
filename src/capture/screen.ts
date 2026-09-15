import type { RiffrecDisplayMediaOptions, RiffrecDisplayMediaVideo } from "../types";
import { assembleRecordingSegments, type SegmentStore } from "../output/segmentStore";

const VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

export const DEFAULT_DISPLAY_MEDIA_VIDEO: RiffrecDisplayMediaVideo = {
  frameRate: 5,
  displaySurface: "browser"
};

export const DEFAULT_DISPLAY_MEDIA_OPTIONS: RiffrecDisplayMediaOptions = {
  audio: false,
  video: DEFAULT_DISPLAY_MEDIA_VIDEO,
  preferCurrentTab: true,
  selfBrowserSurface: "include",
  monitorTypeSurfaces: "exclude",
  surfaceSwitching: "exclude",
  systemAudio: "exclude"
};

export const RECORDING_TIMESLICE_MS = 1000;

/** Why the current segment closed; a re-share is needed after `pagehide` and `track_ended`. */
export type SegmentCloseReason = "pagehide" | "track_ended" | "stopped";

export type ScreenShareOutcome = "recording" | "declined" | "unavailable";

export interface ScreenCaptureOptions {
  /** KTD15: persist each timeslice chunk as it is produced. Requires `sessionId`. */
  segmentStore?: SegmentStore | null;
  sessionId?: string;
  timesliceMs?: number;
  /** Where `pagehide` closes the current segment; null disables. Defaults to `window`. */
  pageHideTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  /** The display track ended (the riffer stopped sharing, or the page is reloading). */
  onStreamEnded?: () => void;
  onSegmentClosed?: (segment: number | null, reason: SegmentCloseReason) => void;
  onChunk?: (chunk: Blob, segment: number | null, index: number) => void;
  onError?: (error: unknown) => void;
}

function browserSupportsScreenCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function chooseVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "video/webm";
  }

  return VIDEO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "video/webm";
}

/** `getDisplayMedia` rejections that mean the riffer declined or dismissed the picker. */
export function isShareDeclined(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "AbortError" || name === "SecurityError";
}

export class ScreenCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private mimeType = "video/webm";
  private segment: number | null = null;
  private chunkIndex = 0;
  private pendingWrites: Promise<void>[] = [];
  /** Segments this instance finished, for hosts without a segment store. */
  private readonly completedSegments: Blob[] = [];
  private readonly segmentStore: SegmentStore | null;
  private readonly sessionId: string | null;
  private readonly timesliceMs: number;
  private readonly pageHideTarget: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  private readonly onPageHide = (): void => this.handlePageHide();
  private pageHideAttached = false;
  private readonly options: ScreenCaptureOptions;

  constructor(
    private readonly displayMediaOverrides: Partial<RiffrecDisplayMediaOptions> = {},
    private readonly displayMediaVideoOverrides: Partial<RiffrecDisplayMediaVideo> = {},
    options: ScreenCaptureOptions = {}
  ) {
    this.options = options;
    this.sessionId = options.sessionId ?? null;
    this.segmentStore = options.segmentStore && this.sessionId ? options.segmentStore : null;
    this.timesliceMs = options.timesliceMs ?? RECORDING_TIMESLICE_MS;
    this.pageHideTarget =
      options.pageHideTarget === undefined
        ? typeof window !== "undefined"
          ? window
          : null
        : options.pageHideTarget;
  }

  /** The live display stream, for frame grabbing; null until shared and after it ends. */
  get displayStream(): MediaStream | null {
    return this.stream;
  }

  /** The 1-based number of the segment being recorded; null while not recording or without a store. */
  get currentSegment(): number | null {
    return this.segment;
  }

  get isSegmented(): boolean {
    return this.segmentStore !== null;
  }

  async start(): Promise<void> {
    if (!browserSupportsScreenCapture()) {
      throw new Error("Screen capture is not supported in this browser.");
    }

    try {
      this.mimeType = chooseVideoMimeType();
      this.chunks = [];
      this.chunkIndex = 0;
      this.segment = null;
      const displayMediaVideoOverrides =
        typeof this.displayMediaOverrides.video === "object" && this.displayMediaOverrides.video !== null
          ? this.displayMediaOverrides.video
          : {};
      const video: RiffrecDisplayMediaVideo = {
        ...DEFAULT_DISPLAY_MEDIA_VIDEO,
        ...this.displayMediaVideoOverrides,
        ...displayMediaVideoOverrides
      };
      const options: RiffrecDisplayMediaOptions = {
        ...DEFAULT_DISPLAY_MEDIA_OPTIONS,
        ...this.displayMediaOverrides,
        video
      };
      this.stream = await navigator.mediaDevices.getDisplayMedia(options);
      if (this.segmentStore && this.sessionId) {
        this.segment = await this.segmentStore.openSegment(this.sessionId, this.mimeType);
      }
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.handleChunk(event.data);
        }
      };
      this.watchTracks(this.stream);
      this.attachPageHide();
      this.recorder.start(this.timesliceMs);
    } catch (error) {
      this.cleanupStream();
      const wrapped: Error & { cause?: unknown } = new Error(
        `Screen capture failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      wrapped.cause = error;
      throw wrapped;
    }
  }

  /**
   * Live-mode start: a declined or dismissed picker is an outcome, not an
   * error (KTD10 treats it like a denied microphone), and so is a browser
   * without display capture. Call again after a reload to open the next
   * segment once the riffer re-shares.
   */
  async tryStart(): Promise<ScreenShareOutcome> {
    if (!browserSupportsScreenCapture()) return "unavailable";
    try {
      await this.start();
      return "recording";
    } catch (error) {
      if (isShareDeclined((error as { cause?: unknown }).cause)) return "declined";
      this.options.onError?.(error);
      return "unavailable";
    }
  }

  async stop(): Promise<Blob | null> {
    if (!this.recorder) {
      this.cleanupStream();
      this.detachPageHide();
      return null;
    }
    return this.finishRecording("stopped");
  }

  /**
   * Every segment of this session in order (KTD15): persisted segments from
   * before a reload, then the ones this instance recorded. Without a segment
   * store, the segments this instance finished.
   */
  async collectSegments(): Promise<Blob[]> {
    await Promise.allSettled(this.pendingWrites);
    if (this.segmentStore && this.sessionId) {
      try {
        const segments = await assembleRecordingSegments(this.segmentStore, this.sessionId);
        if (segments.length > 0 || this.completedSegments.length === 0) return segments;
      } catch (error) {
        this.options.onError?.(error);
      }
    }
    return [...this.completedSegments];
  }

  /** Whether a previous page load left segments behind (drives the re-share prompt after rehydration). */
  async hasPersistedSegments(): Promise<boolean> {
    if (!this.segmentStore || !this.sessionId) return false;
    try {
      return (await this.segmentStore.listSegments(this.sessionId)).length > 0;
    } catch (error) {
      this.options.onError?.(error);
      return false;
    }
  }

  async clearSegments(): Promise<void> {
    if (!this.segmentStore || !this.sessionId) return;
    await Promise.allSettled(this.pendingWrites);
    await this.segmentStore.clear(this.sessionId);
  }

  isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  private handleChunk(chunk: Blob): void {
    const index = this.chunkIndex++;
    this.chunks.push(chunk);
    if (this.segmentStore && this.sessionId && this.segment !== null) {
      const write = this.segmentStore
        .appendChunk(this.sessionId, this.segment, index, chunk)
        .catch((error) => this.options.onError?.(error));
      this.pendingWrites.push(write);
      void write.finally(() => {
        this.pendingWrites = this.pendingWrites.filter((pending) => pending !== write);
      });
    }
    this.options.onChunk?.(chunk, this.segment, index);
  }

  private finishRecording(reason: SegmentCloseReason): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(null);
    const segment = this.segment;

    return new Promise<Blob | null>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
        if (blob) this.completedSegments.push(blob);
        this.closeSegment(segment, reason);
        this.reset();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.closeSegment(segment, reason);
        this.reset();
        if (reason === "stopped") reject(new Error("Screen recorder failed while stopping."));
        else resolve(null);
      };

      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
        recorder.stop();
      }
    });
  }

  private closeSegment(segment: number | null, reason: SegmentCloseReason): void {
    if (this.segmentStore && this.sessionId && segment !== null) {
      const close = this.segmentStore
        .closeSegment(this.sessionId, segment)
        .catch((error) => this.options.onError?.(error));
      this.pendingWrites.push(close);
    }
    this.options.onSegmentClosed?.(segment, reason);
  }

  private watchTracks(stream: MediaStream): void {
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.handleTrackEnded(track));
    }
  }

  private handleTrackEnded(track: MediaStreamTrack): void {
    if (!this.stream || !this.stream.getVideoTracks().includes(track)) return;
    const wasRecording = this.recorder !== null;
    if (wasRecording) {
      void this.finishRecording("track_ended").catch((error) => this.options.onError?.(error));
    } else {
      this.cleanupStream();
    }
    this.options.onStreamEnded?.();
  }

  /** KTD15: flush the in-flight timeslice and mark the segment closed before the page goes away. */
  private handlePageHide(): void {
    const recorder = this.recorder;
    if (!recorder) return;
    try {
      if (recorder.state === "recording") recorder.requestData();
    } catch (error) {
      this.options.onError?.(error);
    }
    this.closeSegment(this.segment, "pagehide");
  }

  private attachPageHide(): void {
    if (this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.addEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = true;
  }

  private detachPageHide(): void {
    if (!this.pageHideAttached || !this.pageHideTarget) return;
    this.pageHideTarget.removeEventListener("pagehide", this.onPageHide);
    this.pageHideAttached = false;
  }

  private reset(): void {
    this.recorder = null;
    this.segment = null;
    this.chunks = [];
    this.cleanupStream();
    this.detachPageHide();
  }

  private cleanupStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

export function isSupported(): boolean {
  return browserSupportsScreenCapture();
}
