/**
 * Utterance audio clips (R21, KTD21). The recorder consumes the shared
 * microphone clone the consent step acquired, records between the Realtime
 * `speech_started` and `speech_stopped` events, and hands the clip id to the
 * unit `record_unit` extracts from that utterance. The clip id is minted at
 * `speech_started` so it is known before the encoder has flushed; the bytes
 * arrive on the recorder's `stop`. Whether the id reaches the wire is the
 * evidence profile's call (`audio_clip`); the archive keeps every clip.
 */

const CLIP_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** The `MediaRecorder` surface the recorder needs, so tests can stand one in. */
export interface ClipRecorderLike {
  state: "inactive" | "recording" | "paused";
  mimeType?: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export type ClipRecorderFactory = (stream: MediaStream, mimeType: string) => ClipRecorderLike;

export interface AudioClip {
  id: string;
  /** Milliseconds since session start. */
  t_start: number;
  t_end: number | null;
  /** Null until the recorder has flushed. */
  blob: Blob | null;
  mimeType: string;
  /** Set once a unit took the clip. */
  unit_id?: string;
}

export interface AudioClipRecorderOptions {
  now: () => number;
  createId: () => string;
  stream?: MediaStream | null;
  createRecorder?: ClipRecorderFactory;
  mimeType?: string;
  /** Called when a clip's bytes are available. */
  onClip?: (clip: AudioClip) => void;
  onError?: (error: unknown) => void;
}

export function chooseClipMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  return CLIP_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "audio/webm";
}

function defaultRecorderFactory(stream: MediaStream, mimeType: string): ClipRecorderLike {
  return new MediaRecorder(stream, { mimeType }) as unknown as ClipRecorderLike;
}

export function clipFileName(clip: Pick<AudioClip, "id" | "mimeType">): string {
  const extension = clip.mimeType.startsWith("audio/ogg") ? "ogg" : "webm";
  return `${clip.id}.${extension}`;
}

export class AudioClipRecorder {
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly createRecorder: ClipRecorderFactory;
  private readonly mimeType: string;
  private readonly onClip: (clip: AudioClip) => void;
  private readonly onError: (error: unknown) => void;
  private readonly clips: AudioClip[] = [];
  private stream: MediaStream | null;
  private active: { clip: AudioClip; recorder: ClipRecorderLike; chunks: Blob[] } | null = null;
  /** The last finished utterance's clip that no unit has taken yet. */
  private unclaimed: AudioClip | null = null;

  constructor(options: AudioClipRecorderOptions) {
    this.now = options.now;
    this.createId = options.createId;
    this.createRecorder = options.createRecorder ?? defaultRecorderFactory;
    this.mimeType = options.mimeType ?? chooseClipMimeType();
    this.onClip = options.onClip ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.stream = options.stream ?? null;
  }

  get hasSource(): boolean {
    return this.stream !== null;
  }

  get isRecording(): boolean {
    return this.active !== null;
  }

  /** KTD21: the microphone clone; null when the mic was denied or the clone was stopped. */
  setStream(stream: MediaStream | null): void {
    if (this.active) this.finishActive();
    this.stream = stream;
  }

  speechStarted(): AudioClip | null {
    if (!this.stream) return null;
    if (this.active) this.finishActive();
    const clip: AudioClip = { id: this.createId(), t_start: this.now(), t_end: null, blob: null, mimeType: this.mimeType };
    let recorder: ClipRecorderLike;
    try {
      recorder = this.createRecorder(this.stream, this.mimeType);
    } catch (error) {
      this.onError(error);
      return null;
    }
    const chunks: Blob[] = [];
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
  speechStopped(): AudioClip | null {
    if (!this.active) return null;
    const { clip } = this.active;
    this.finishActive();
    this.unclaimed = clip.unit_id ? null : clip;
    return clip;
  }

  /** The id of the clip a `record_unit` arriving now would take; null when none is pending. */
  pendingClipId(): string | null {
    return (this.unclaimed ?? this.active?.clip ?? null)?.id ?? null;
  }

  /** The clip for the utterance `record_unit` came from; null when none is pending. */
  claim(unitId: string): string | null {
    const clip = this.unclaimed ?? (this.active ? this.active.clip : null);
    if (!clip) return null;
    clip.unit_id = unitId;
    if (this.unclaimed === clip) this.unclaimed = null;
    return clip.id;
  }

  all(): AudioClip[] {
    return [...this.clips];
  }

  /** `clips/<id>.<ext>` for the archive (I6); clips without bytes yet are skipped. */
  archiveFiles(): Record<string, Blob> {
    const files: Record<string, Blob> = {};
    for (const clip of this.clips) {
      if (clip.blob) files[clipFileName(clip)] = clip.blob;
    }
    return files;
  }

  dispose(): void {
    if (this.active) this.finishActive();
    this.stream = null;
  }

  private finishActive(): void {
    if (!this.active) return;
    const { clip, recorder } = this.active;
    this.active = null;
    clip.t_end = this.now();
    try {
      if (recorder.state === "inactive") recorder.onstop?.(undefined);
      else recorder.stop();
    } catch (error) {
      this.onError(error);
    }
  }

  private settle(clip: AudioClip, chunks: Blob[], recorder: ClipRecorderLike): void {
    if (clip.blob) return;
    if (clip.t_end === null) clip.t_end = this.now();
    if (chunks.length === 0) return;
    clip.blob = new Blob(chunks, { type: recorder.mimeType || this.mimeType });
    this.onClip(clip);
  }
}
