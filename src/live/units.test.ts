import { describe, expect, it } from "vitest";
import type { LiveAnchor, LiveUnit } from "./contract";
import { UnitStore } from "./units";

function anchor(t = 100): LiveAnchor {
  return { route: "/settings", selector: "button.save", component: "SaveButton", rect: { x: 0, y: 0, width: 10, height: 10 }, t };
}

function unit(id: string): LiveUnit {
  return {
    id,
    statement: `Change ${id}`,
    transcript_excerpt: `change ${id}`,
    anchors: [anchor()],
    evidence: { frame_ids: [], annotation_ids: [], transcript_span: { t_start: 0, t_end: 100 } },
    status: "initial"
  };
}

describe("UnitStore", () => {
  it("holds initial units and counts them as held work", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.add(unit("u2"));

    expect(store.held().map((entry) => entry.id)).toEqual(["u1", "u2"]);
    expect(store.hasHeldWork()).toBe(true);
  });

  it("removes a unit withdrawn before release from the held set", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.add(unit("u2"));

    const result = store.withdraw("u1");

    expect(result).toMatchObject({ ok: true, afterRelease: false });
    expect(store.get("u1")?.status).toBe("withdrawn");
    expect(store.held().map((entry) => entry.id)).toEqual(["u2"]);
    expect(store.snapshot().pendingWithdrawals).toEqual([]);
  });

  it("treats triaging as the release marker and records a later withdrawal for forwarding", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.applyStatus("u1", "triaging");

    expect(store.isReleased("u1")).toBe(true);
    expect(store.held()).toEqual([]);
    expect(store.hasHeldWork()).toBe(false);

    const result = store.withdraw("u1");

    expect(result).toMatchObject({ ok: true, afterRelease: true });
    expect(store.hasHeldWork()).toBe(true);
    expect(store.snapshot().pendingWithdrawals).toEqual(["u1"]);

    store.markCheckpointEmitted();
    expect(store.hasHeldWork()).toBe(false);
  });

  it("rejects update_unit on a released unit and leaves it unchanged", () => {
    const store = new UnitStore();
    const original = store.add(unit("u1"));
    store.applyStatus("u1", "triaging");

    const result = store.update("u1", { statement: "Something else", anchors_add: [anchor(200)] });

    expect(result).toMatchObject({ ok: false, reason: "released" });
    expect(store.get("u1")).toEqual({ ...original, status: "triaging" });
  });

  it("applies updates while initial and confirmations at any status", () => {
    const store = new UnitStore();
    store.add(unit("u1"));

    const updated = store.update("u1", { statement: "Move it left", anchors_add: [anchor(200)] });
    expect(updated.ok).toBe(true);
    expect(store.get("u1")?.statement).toBe("Move it left");
    expect(store.get("u1")?.anchors).toHaveLength(2);

    store.applyStatus("u1", "triaging");
    store.applyStatus("u1", "accepted");
    const confirmed = store.update("u1", { confirmed: { element: true, change: false } });
    expect(confirmed.ok).toBe(true);
    expect(store.get("u1")?.confirmed).toEqual({ element: true, change: false });
  });

  it("rejects unknown and already-withdrawn units", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.withdraw("u1");

    expect(store.update("missing", { statement: "x" })).toMatchObject({ ok: false, reason: "unknown_unit" });
    expect(store.update("u1", { statement: "x" })).toMatchObject({ ok: false, reason: "withdrawn" });
    expect(store.withdraw("u1")).toMatchObject({ ok: false, reason: "already_withdrawn" });
  });

  it("keeps a withdrawn unit withdrawn when endpoint status arrives later", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.withdraw("u1");

    store.applyStatus("u1", "triaging");
    store.applyStatus("u1", "accepted");

    expect(store.get("u1")?.status).toBe("withdrawn");
  });

  it("tracks questions, answers, notes, and guesses", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.applyStatus("u1", "triaging");

    store.ask("u1", "Which header variant?", 5000);
    expect(store.get("u1")?.status).toBe("needs_info");
    expect(store.openQuestions()).toHaveLength(1);

    store.answer("u1");
    expect(store.openQuestions()).toHaveLength(0);

    store.applyStatus("u1", "applied", { note: "moved", guess: "the compact header" });
    expect(store.note("u1")).toBe("moved");
    expect(store.guess("u1")).toBe("the compact header");
  });

  it("round-trips through a snapshot", () => {
    const store = new UnitStore();
    store.add(unit("u1"));
    store.add(unit("u2"));
    store.applyStatus("u1", "triaging");
    store.withdraw("u1");
    store.ask("u2", "Which one?", 10);

    const restored = UnitStore.fromSnapshot(JSON.parse(JSON.stringify(store.snapshot())));

    expect(restored.snapshot()).toEqual(store.snapshot());
    expect(restored.isReleased("u1")).toBe(true);
    expect(restored.hasHeldWork()).toBe(true);
  });
});
