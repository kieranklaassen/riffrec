import type { LiveAnchor, LiveUnit, LiveUnitConfirmation, UnitStatus } from "./contract";

/**
 * Page-side unit store (R11, KTD9 page half).
 *
 * The store enforces the transitions the page owns:
 * - `initial -> withdrawn` before release removes the unit from the held set,
 *   so a checkpoint emitted in the same tick never carries it.
 * - a withdrawal after release keeps the unit out of the held set but records
 *   it as a post-release withdrawal, which the next checkpoint forwards as
 *   `status: "withdrawn"`.
 * - `update` (statement, anchors) is rejected once the unit has left `initial`;
 *   confirmations (KTD22) are accepted at any status because the confirmation
 *   pass runs on released units at the `final` checkpoint.
 *
 * The endpoint's `unit_status: "triaging"` broadcast is the release marker.
 */

export interface UnitUpdatePatch {
  statement?: string;
  anchors_add?: LiveAnchor[];
  confirmed?: LiveUnitConfirmation;
}

export type UnitUpdateRejection = "unknown_unit" | "released" | "withdrawn";

export type UnitUpdateResult =
  | { ok: true; unit: LiveUnit }
  | { ok: false; reason: UnitUpdateRejection; unit: LiveUnit | null };

export type UnitWithdrawResult =
  | { ok: true; unit: LiveUnit; afterRelease: boolean }
  | { ok: false; reason: "unknown_unit" | "already_withdrawn"; unit: LiveUnit | null };

export interface UnitQuestion {
  unit_id: string;
  question: string;
  /** Milliseconds since session start when the question arrived. */
  t: number;
  answered: boolean;
}

export interface UnitStoreSnapshot {
  units: LiveUnit[];
  released: string[];
  pendingWithdrawals: string[];
  questions: UnitQuestion[];
  notes: Record<string, string>;
  guesses: Record<string, string>;
}

export class UnitStore {
  private readonly units = new Map<string, LiveUnit>();
  private readonly order: string[] = [];
  private readonly released = new Set<string>();
  /** Post-release withdrawals not yet forwarded by a checkpoint. */
  private pendingWithdrawals: string[] = [];
  private readonly questions = new Map<string, UnitQuestion>();
  private readonly notes = new Map<string, string>();
  private readonly guesses = new Map<string, string>();

  static fromSnapshot(snapshot: UnitStoreSnapshot): UnitStore {
    const store = new UnitStore();
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

  snapshot(): UnitStoreSnapshot {
    return {
      units: this.all(),
      released: [...this.released],
      pendingWithdrawals: [...this.pendingWithdrawals],
      questions: [...this.questions.values()],
      notes: Object.fromEntries(this.notes),
      guesses: Object.fromEntries(this.guesses)
    };
  }

  add(unit: LiveUnit): LiveUnit {
    if (this.units.has(unit.id)) {
      throw new Error(`Unit ${unit.id} already exists`);
    }
    this.units.set(unit.id, unit);
    this.order.push(unit.id);
    return unit;
  }

  get(id: string): LiveUnit | null {
    return this.units.get(id) ?? null;
  }

  all(): LiveUnit[] {
    return this.order.map((id) => this.units.get(id)!).filter(Boolean);
  }

  get size(): number {
    return this.units.size;
  }

  isReleased(id: string): boolean {
    return this.released.has(id);
  }

  /** Units the endpoint has not released yet: `initial`, not withdrawn. */
  held(): LiveUnit[] {
    return this.all().filter((unit) => unit.status === "initial" && !this.released.has(unit.id));
  }

  /**
   * Whether a page checkpoint has anything to release: a held unit or a
   * post-release withdrawal the endpoint still has to forward.
   */
  hasHeldWork(): boolean {
    return this.held().length > 0 || this.pendingWithdrawals.length > 0;
  }

  update(id: string, patch: UnitUpdatePatch): UnitUpdateResult {
    const unit = this.units.get(id);
    if (!unit) return { ok: false, reason: "unknown_unit", unit: null };
    if (unit.status === "withdrawn") return { ok: false, reason: "withdrawn", unit };

    const wantsContent = patch.statement !== undefined || (patch.anchors_add?.length ?? 0) > 0;
    if (wantsContent && (unit.status !== "initial" || this.released.has(id))) {
      return { ok: false, reason: "released", unit };
    }

    const next: LiveUnit = {
      ...unit,
      statement: patch.statement ?? unit.statement,
      anchors: patch.anchors_add ? [...unit.anchors, ...patch.anchors_add] : unit.anchors,
      ...(patch.confirmed ? { confirmed: patch.confirmed } : {})
    };
    this.units.set(id, next);
    return { ok: true, unit: next };
  }

  /** Links an annotation to a unit's evidence; allowed at any status (local bookkeeping). */
  addAnnotationId(unitId: string, annotationId: string): LiveUnit | null {
    const unit = this.units.get(unitId);
    if (!unit) return null;
    if (unit.evidence.annotation_ids.includes(annotationId)) return unit;
    const next: LiveUnit = {
      ...unit,
      evidence: { ...unit.evidence, annotation_ids: [...unit.evidence.annotation_ids, annotationId] }
    };
    this.units.set(unitId, next);
    return next;
  }

  withdraw(id: string): UnitWithdrawResult {
    const unit = this.units.get(id);
    if (!unit) return { ok: false, reason: "unknown_unit", unit: null };
    if (unit.status === "withdrawn") return { ok: false, reason: "already_withdrawn", unit };

    const afterRelease = this.released.has(id) || unit.status !== "initial";
    const withdrawn: LiveUnit = { ...unit, status: "withdrawn" };
    this.units.set(id, withdrawn);
    if (afterRelease) this.pendingWithdrawals.push(id);
    return { ok: true, unit: withdrawn, afterRelease };
  }

  /**
   * Called when a page checkpoint leaves the page: the checkpoint forwards
   * every pending post-release withdrawal, so they are no longer held work.
   */
  markCheckpointEmitted(): void {
    this.pendingWithdrawals = [];
  }

  /**
   * Applies an endpoint status. `triaging` is the release marker (KTD9); a
   * unit the page withdrew stays withdrawn regardless of later endpoint news.
   */
  applyStatus(id: string, status: UnitStatus, extra: { note?: string; guess?: string } = {}): LiveUnit | null {
    const unit = this.units.get(id);
    if (!unit) return null;
    if (status === "triaging") this.released.add(id);
    if (extra.note) this.notes.set(id, extra.note);
    if (extra.guess) this.guesses.set(id, extra.guess);
    if (unit.status === "withdrawn") return unit;

    const next: LiveUnit = { ...unit, status };
    this.units.set(id, next);
    if (status !== "needs_info") {
      const question = this.questions.get(id);
      if (question && !question.answered) this.questions.set(id, { ...question, answered: true });
    }
    return next;
  }

  ask(id: string, question: string, t: number): UnitQuestion | null {
    const unit = this.units.get(id);
    if (!unit) return null;
    this.released.add(id);
    if (unit.status !== "withdrawn") this.units.set(id, { ...unit, status: "needs_info" });
    const entry: UnitQuestion = { unit_id: id, question, t, answered: false };
    this.questions.set(id, entry);
    return entry;
  }

  answer(id: string): UnitQuestion | null {
    const question = this.questions.get(id);
    if (!question) return null;
    const answered = { ...question, answered: true };
    this.questions.set(id, answered);
    return answered;
  }

  question(id: string): UnitQuestion | null {
    return this.questions.get(id) ?? null;
  }

  openQuestions(): UnitQuestion[] {
    return [...this.questions.values()].filter((question) => !question.answered);
  }

  note(id: string): string | null {
    return this.notes.get(id) ?? null;
  }

  guess(id: string): string | null {
    return this.guesses.get(id) ?? null;
  }
}
