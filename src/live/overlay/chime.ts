/**
 * A soft two-note bell for "applied": sine partials with a quick strike and a
 * long exponential ring, so it reads as a small glass "cling" rather than a beep.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One bell strike: a fundamental plus two quieter inharmonic partials, like a small handbell. */
function strike(ctx: AudioContext, output: AudioNode, at: number, frequency: number, level: number): void {
  const partials: [ratio: number, gain: number, decay: number][] = [
    [1, 1, 1.4],
    [2.76, 0.32, 0.7],
    [5.4, 0.12, 0.35]
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level * gain, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env).connect(output);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

export function playAppliedChime(): void {
  const ctx = audioContext();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.16;
  master.connect(ctx.destination);
  const now = ctx.currentTime + 0.01;
  strike(ctx, master, now, 1318.5, 0.9); // E6
  strike(ctx, master, now + 0.11, 1975.5, 0.6); // B6
}
