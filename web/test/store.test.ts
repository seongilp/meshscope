import { describe, it, expect } from "vitest";
import { emptyState, reduce } from "../src/store.js";

describe("store reduce", () => {
  it("loads a snapshot", () => {
    const s = reduce(emptyState(), {
      kind: "snapshot",
      snapshot: { nodes: [{ id: "!a", num: 1, lastHeard: 1 }], positions: [], messages: [], telemetry: [], edges: [] },
    });
    expect(s.nodes["!a"].num).toBe(1);
  });

  it("applies a message event and keeps newest-last", () => {
    let s = emptyState();
    s = reduce(s, { kind: "event", event: { type: "message", data: { id: 1, from: "!a", to: "!b", channel: "c", text: "yo", time: 5 } } });
    expect(s.messages.at(-1)?.text).toBe("yo");
  });

  it("merges node fields from events", () => {
    let s = emptyState();
    s = reduce(s, { kind: "event", event: { type: "node", data: { id: "!a", num: 1, longName: "Alpha", lastHeard: 1 } } });
    s = reduce(s, { kind: "event", event: { type: "node", data: { id: "!a", num: 1, lastHeard: 2 } } });
    expect(s.nodes["!a"].longName).toBe("Alpha");
    expect(s.nodes["!a"].lastHeard).toBe(2);
  });
});
