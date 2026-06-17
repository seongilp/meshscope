import { describe, it, expect } from "vitest";
import { MeshState } from "../src/state.js";

describe("MeshState", () => {
  it("merges node fields across events (keeps known name when later event omits it)", () => {
    const s = new MeshState();
    s.apply({ type: "node", data: { id: "!a", num: 1, longName: "Alpha", lastHeard: 1 } });
    s.apply({ type: "node", data: { id: "!a", num: 1, lastHeard: 2 } });
    const node = s.snapshot().nodes.find((n) => n.id === "!a");
    expect(node?.longName).toBe("Alpha");
    expect(node?.lastHeard).toBe(2);
  });

  it("caps the message ring buffer at maxMessages", () => {
    const s = new MeshState(2);
    for (let i = 0; i < 5; i++) {
      s.apply({ type: "message", data: { id: i, from: "!a", to: "!b", channel: "c", text: `m${i}`, time: i } });
    }
    const msgs = s.snapshot().messages;
    expect(msgs.length).toBe(2);
    expect(msgs.map((m) => m.text)).toEqual(["m3", "m4"]);
  });

  it("dedupes edges by from->to", () => {
    const s = new MeshState();
    s.apply({ type: "edge", data: { from: "!a", to: "!b", snr: 1 } });
    s.apply({ type: "edge", data: { from: "!a", to: "!b", snr: 9 } });
    expect(s.snapshot().edges).toEqual([{ from: "!a", to: "!b", snr: 9 }]);
  });
});
