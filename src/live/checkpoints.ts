import type { CheckpointTrigger } from "./contract";

/**
 * The sole page-side checkpoint emitter (KTD9).
 *
 * - `silence`: armed on the Realtime `speech_stopped` event, reset on
 *   `speech_started`, fires after `silenceMs` (2.5 s) when work is held.
 * - `page_change`: on navigation, when work is held.
 * - `send`: from the Send control; waits up to `sendWaitMs` (1.5 s) for an
 *   in-progress turn to end, then emits when work is held.
 * - `final`: from the Done control; always emitted, even with nothing held,
 *   because the endpoint applies the Collect backlog on it (KTD12).
 *
 * "Work is held" is decided by the caller (`UnitStore.hasHeldWork`), so a
 * post-release withdrawal waiting to be forwarded also counts.
 */

export type PageCheckpointTrigger = Extract<CheckpointTrigger, "silence" | "page_change" | "send" | "final">;

export const SILENCE_CHECKPOINT_MS = 2500;
export const SEND_TURN_WAIT_MS = 1500;

export interface CheckpointEmitterOptions {
  emit: (trigger: PageCheckpointTrigger) => void;
  hasHeldWork: () => boolean;
  silenceMs?: number;
  sendWaitMs?: number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export class CheckpointEmitter {
  private readonly silenceMs: number;
  private readonly sendWaitMs: number;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  private silenceTimer: unknown = null;
  private speaking = false;
  private pendingSend: { resolve: (emitted: boolean) => void; timer: unknown } | null = null;
  private disposed = false;

  constructor(private readonly options: CheckpointEmitterOptions) {
    this.silenceMs = options.silenceMs ?? SILENCE_CHECKPOINT_MS;
    this.sendWaitMs = options.sendWaitMs ?? SEND_TURN_WAIT_MS;
    this.schedule = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
    this.cancel = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get silenceTimerArmed(): boolean {
    return this.silenceTimer !== null;
  }

  speechStarted(): void {
    if (this.disposed) return;
    this.speaking = true;
    this.clearSilenceTimer();
  }

  speechStopped(): void {
    if (this.disposed) return;
    this.speaking = false;
    this.clearSilenceTimer();
    this.silenceTimer = this.schedule(() => {
      this.silenceTimer = null;
      this.emitIfHeld("silence");
    }, this.silenceMs);
    this.settlePendingSend();
  }

  pageChanged(): boolean {
    if (this.disposed) return false;
    this.clearSilenceTimer();
    return this.emitIfHeld("page_change");
  }

  /** Resolves with whether a `send` checkpoint was emitted. */
  send(): Promise<boolean> {
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
  final(): void {
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

  dispose(): void {
    this.disposed = true;
    this.clearSilenceTimer();
    if (this.pendingSend) {
      this.cancel(this.pendingSend.timer);
      const pending = this.pendingSend;
      this.pendingSend = null;
      pending.resolve(false);
    }
  }

  private settlePendingSend(): void {
    if (!this.pendingSend) return;
    const pending = this.pendingSend;
    this.pendingSend = null;
    this.cancel(pending.timer);
    this.clearSilenceTimer();
    pending.resolve(this.emitIfHeld("send"));
  }

  private emitIfHeld(trigger: Exclude<PageCheckpointTrigger, "final">): boolean {
    if (!this.options.hasHeldWork()) return false;
    this.options.emit(trigger);
    return true;
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      this.cancel(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
