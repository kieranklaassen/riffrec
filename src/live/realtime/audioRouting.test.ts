import { describe, expect, it } from "vitest";
import {
  SharedMicrophone,
  routeRemoteAudio,
  type AudioContextLike,
  type AudioNodeLike,
  type AudioTrackLike,
  type GainNodeLike
} from "./audioRouting";

/**
 * A recording audio graph: every `connect` call lands in an edge list the
 * test walks itself, so reachability is proven against what the code actually
 * connected, not against the route's own bookkeeping.
 */
class FakeGraph {
  readonly edges = new Map<AudioNodeLike, Set<AudioNodeLike>>();
  readonly destination: AudioNodeLike;
  state = "suspended";
  resumed = 0;

  constructor() {
    this.destination = this.node("destination");
  }

  node(label: string): AudioNodeLike {
    const graph = this;
    const node: AudioNodeLike & { label: string } = {
      label,
      connect(target) {
        const set = graph.edges.get(node) ?? new Set<AudioNodeLike>();
        set.add(target);
        graph.edges.set(node, set);
        return target;
      },
      disconnect() {
        graph.edges.delete(node);
      }
    };
    return node;
  }

  context(): AudioContextLike & { sources: AudioNodeLike[] } {
    const graph = this;
    const sources: AudioNodeLike[] = [];
    return {
      sources,
      destination: graph.destination,
      get state() {
        return graph.state;
      },
      createMediaStreamSource(stream: MediaStream) {
        const source = graph.node(`source:${(stream as unknown as { id: string }).id}`);
        sources.push(source);
        return source;
      },
      createGain(): GainNodeLike {
        return Object.assign(graph.node("gain"), { gain: { value: 1 } });
      },
      resume: async () => {
        graph.resumed += 1;
        graph.state = "running";
      }
    };
  }

  reaches(from: AudioNodeLike, to: AudioNodeLike): boolean {
    const seen = new Set<AudioNodeLike>();
    const stack = [from];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === to) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of this.edges.get(node) ?? []) stack.push(next);
    }
    return false;
  }
}

function fakeStream(id: string): MediaStream {
  return { id } as unknown as MediaStream;
}

describe("routeRemoteAudio", () => {
  it("connects the remote track through gain to the destination in a fresh client", () => {
    const graph = new FakeGraph();
    const context = graph.context();
    const route = routeRemoteAudio(context, fakeStream("remote-1"));

    expect(route.isReachable()).toBe(true);
    expect(graph.reaches(context.sources[0], graph.destination)).toBe(true);
    expect(graph.resumed).toBe(1);
  });

  it("stays reachable in a reconnected client and leaves the old route disconnected", () => {
    const graph = new FakeGraph();
    const context = graph.context();
    const first = routeRemoteAudio(context, fakeStream("remote-1"));
    first.dispose();
    const second = routeRemoteAudio(context, fakeStream("remote-2"));

    expect(first.isReachable()).toBe(false);
    expect(graph.reaches(context.sources[0], graph.destination)).toBe(false);
    expect(second.isReachable()).toBe(true);
    expect(graph.reaches(context.sources[1], graph.destination)).toBe(true);
  });

  it("clamps volume on the gain node", () => {
    const graph = new FakeGraph();
    const route = routeRemoteAudio(graph.context(), fakeStream("remote-1"));
    route.setVolume(2);
    expect(route.gain.gain.value).toBe(1);
    route.setVolume(-1);
    expect(route.gain.gain.value).toBe(0);
  });
});

class FakeTrack implements AudioTrackLike {
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  readonly clones: FakeTrack[] = [];

  constructor(readonly label: string) {}

  clone(): FakeTrack {
    const clone = new FakeTrack(`${this.label}#${this.clones.length + 1}`);
    this.clones.push(clone);
    return clone;
  }

  stop(): void {
    this.readyState = "ended";
  }
}

function microphone(): { mic: SharedMicrophone; track: FakeTrack; streams: AudioTrackLike[][] } {
  const track = new FakeTrack("mic");
  const streams: AudioTrackLike[][] = [];
  const mic = new SharedMicrophone(
    { getAudioTracks: () => [track] },
    {
      createStream: (tracks) => {
        streams.push(tracks);
        return { getAudioTracks: () => tracks } as unknown as MediaStream;
      }
    }
  );
  return { mic, track, streams };
}

describe("SharedMicrophone", () => {
  it("hands each consumer its own clone and mutes every clone together", () => {
    const { mic, track } = microphone();
    mic.clone("realtime");
    mic.clone("voice_capture");
    expect(track.clones).toHaveLength(2);

    mic.setMuted(true);
    expect(track.enabled).toBe(false);
    expect(track.clones.every((clone) => !clone.enabled)).toBe(true);

    mic.setMuted(false);
    expect(track.clones.every((clone) => clone.enabled)).toBe(true);
  });

  it("gives a reconnecting consumer a clone that already honors the mute state and stops the previous one", () => {
    const { mic, track } = microphone();
    mic.clone("realtime");
    mic.setMuted(true);
    mic.clone("realtime");
    expect(track.clones[0].readyState).toBe("ended");
    expect(track.clones[1].enabled).toBe(false);
    expect(mic.tracksFor("realtime")).toEqual([track.clones[1]]);
  });

  it("stop ends every clone and the source and refuses further clones", () => {
    const { mic, track } = microphone();
    mic.clone("realtime");
    mic.clone("clips");
    mic.stop();
    expect(track.readyState).toBe("ended");
    expect(track.clones.every((clone) => clone.readyState === "ended")).toBe(true);
    expect(() => mic.clone("realtime")).toThrow(/stopped/);
  });
});
