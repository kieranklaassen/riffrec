import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointEmitter, SEND_TURN_WAIT_MS, SILENCE_CHECKPOINT_MS, type PageCheckpointTrigger } from "./checkpoints";

function setup(held = true) {
  const emitted: PageCheckpointTrigger[] = [];
  let hasHeld = held;
  const emitter = new CheckpointEmitter({
    emit: (trigger) => emitted.push(trigger),
    hasHeldWork: () => hasHeld
  });
  return { emitter, emitted, setHeld: (value: boolean) => (hasHeld = value) };
}

describe("CheckpointEmitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits one silence checkpoint 2.5 s after speech stops when work is held", () => {
    const { emitter, emitted } = setup();

    emitter.speechStopped();
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS - 1);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(emitted).toEqual(["silence"]);
    vi.advanceTimersByTime(10000);
    expect(emitted).toEqual(["silence"]);
  });

  it("resets the silence timer on speech_started", () => {
    const { emitter, emitted } = setup();

    emitter.speechStopped();
    vi.advanceTimersByTime(2000);
    emitter.speechStarted();
    vi.advanceTimersByTime(2000);
    expect(emitted).toEqual([]);
    emitter.speechStopped();
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);

    expect(emitted).toEqual(["silence"]);
  });

  it("emits nothing for silence, page change, or send when nothing is held", () => {
    const { emitter, emitted } = setup(false);

    emitter.speechStopped();
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);
    expect(emitter.pageChanged()).toBe(false);
    void emitter.send();

    expect(emitted).toEqual([]);
  });

  it("emits page_change immediately and cancels a pending silence timer", () => {
    const { emitter, emitted } = setup();

    emitter.speechStopped();
    vi.advanceTimersByTime(1000);
    expect(emitter.pageChanged()).toBe(true);
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);

    expect(emitted).toEqual(["page_change"]);
  });

  it("send emits at once when the riffer is not speaking", async () => {
    const { emitter, emitted } = setup();

    await expect(emitter.send()).resolves.toBe(true);
    expect(emitted).toEqual(["send"]);
  });

  it("send waits for the turn to end and emits when speech stops", async () => {
    const { emitter, emitted } = setup();
    emitter.speechStarted();

    const pending = emitter.send();
    vi.advanceTimersByTime(500);
    expect(emitted).toEqual([]);
    emitter.speechStopped();

    await expect(pending).resolves.toBe(true);
    expect(emitted).toEqual(["send"]);
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);
    expect(emitted).toEqual(["send"]);
  });

  it("send gives up waiting after 1.5 s and emits anyway", async () => {
    const { emitter, emitted } = setup();
    emitter.speechStarted();

    const pending = emitter.send();
    vi.advanceTimersByTime(SEND_TURN_WAIT_MS);

    await expect(pending).resolves.toBe(true);
    expect(emitted).toEqual(["send"]);
  });

  it("final always emits, even with nothing held, and clears timers", () => {
    const { emitter, emitted } = setup(false);
    emitter.speechStopped();

    emitter.final();
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);

    expect(emitted).toEqual(["final"]);
  });

  it("does nothing after dispose", () => {
    const { emitter, emitted } = setup();
    emitter.speechStopped();
    emitter.dispose();
    vi.advanceTimersByTime(SILENCE_CHECKPOINT_MS);
    emitter.final();

    expect(emitted).toEqual([]);
  });
});
