/**
 * Audio plumbing for the voice interviewer.
 *
 * - `routeRemoteAudio` (KTD6): the interviewer's remote track sits on a muted
 *   `<audio>` element (Chrome keeps an unattached remote track silent), so the
 *   audible path is an explicit Web Audio chain — source → gain → destination.
 *   `breathwork-live` shipped silent twice because nothing asserted that chain;
 *   the route records its own edges and exposes `isReachable()` so a test can.
 * - `SharedMicrophone` (KTD21): one consented microphone stream, cloned per
 *   consumer (Realtime client, `VoiceCapture`, audio clips). Mute flips every
 *   clone together so the indicator, the interviewer, and the recording agree.
 */

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: { value: number };
}

export interface AudioContextLike {
  readonly destination: AudioNodeLike;
  readonly state?: string;
  createMediaStreamSource(stream: MediaStream): AudioNodeLike;
  createGain(): GainNodeLike;
  resume?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RemoteAudioRoute {
  readonly source: AudioNodeLike;
  readonly gain: GainNodeLike;
  /** Walks the edges this route created; true while source reaches destination. */
  isReachable(): boolean;
  setVolume(volume: number): void;
  dispose(): void;
}

export function routeRemoteAudio(context: AudioContextLike, stream: MediaStream): RemoteAudioRoute {
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();
  const edges = new Map<AudioNodeLike, Set<AudioNodeLike>>();
  const link = (from: AudioNodeLike, to: AudioNodeLike): void => {
    from.connect(to);
    const set = edges.get(from) ?? new Set<AudioNodeLike>();
    set.add(to);
    edges.set(from, set);
  };
  link(source, gain);
  link(gain, context.destination);
  if (context.state === "suspended" && typeof context.resume === "function") {
    void context.resume().catch(() => {});
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
      } catch {
        // Already disconnected.
      }
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  };
}

function reaches(edges: Map<AudioNodeLike, Set<AudioNodeLike>>, from: AudioNodeLike, to: AudioNodeLike): boolean {
  const seen = new Set<AudioNodeLike>();
  const stack: AudioNodeLike[] = [from];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of edges.get(node) ?? []) stack.push(next);
  }
  return false;
}

export function createDefaultAudioContext(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared microphone (KTD21)
// ---------------------------------------------------------------------------

export interface AudioTrackLike {
  enabled: boolean;
  readonly readyState?: MediaStreamTrackState;
  clone(): AudioTrackLike;
  stop(): void;
}

export interface MicStreamLike {
  getAudioTracks(): AudioTrackLike[];
}

export type MicConsumer = "realtime" | "voice_capture" | "clips" | (string & {});

export interface SharedMicrophoneOptions {
  /** Builds a `MediaStream` from cloned tracks; defaults to the DOM constructor. */
  createStream?: (tracks: AudioTrackLike[]) => MediaStream;
}

function defaultCreateStream(tracks: AudioTrackLike[]): MediaStream {
  return new MediaStream(tracks as unknown as MediaStreamTrack[]);
}

export class SharedMicrophone {
  private readonly clones = new Map<MicConsumer, AudioTrackLike[]>();
  private readonly createStream: (tracks: AudioTrackLike[]) => MediaStream;
  private mutedState = false;
  private stopped = false;

  constructor(
    private readonly source: MicStreamLike,
    options: SharedMicrophoneOptions = {}
  ) {
    this.createStream = options.createStream ?? defaultCreateStream;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** A fresh clone for one consumer; a second call for the same consumer stops the previous clone. */
  clone(consumer: MicConsumer): MediaStream {
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

  tracksFor(consumer: MicConsumer): AudioTrackLike[] {
    return [...(this.clones.get(consumer) ?? [])];
  }

  release(consumer: MicConsumer): void {
    const tracks = this.clones.get(consumer);
    if (!tracks) return;
    for (const track of tracks) track.stop();
    this.clones.delete(consumer);
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    for (const track of this.source.getAudioTracks()) track.enabled = !muted;
    for (const tracks of this.clones.values()) {
      for (const track of tracks) track.enabled = !muted;
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const consumer of [...this.clones.keys()]) this.release(consumer);
    for (const track of this.source.getAudioTracks()) track.stop();
  }
}
