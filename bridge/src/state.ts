import type { MeshEvent, Snapshot, NodeInfo, Position, Message, Telemetry, Edge } from "@meshscope/shared";

export class MeshState {
  private nodes = new Map<string, NodeInfo>();
  private positions = new Map<string, Position>();
  private messages: Message[] = [];
  private telemetry: Telemetry[] = [];
  private edges = new Map<string, Edge>();

  constructor(
    private readonly maxMessages = 200,
    private readonly maxTelemetry = 2000,
  ) {}

  apply(ev: MeshEvent): void {
    switch (ev.type) {
      case "node": {
        const prev = this.nodes.get(ev.data.id);
        // merge so a later bare lastHeard event keeps the known name/hw
        this.nodes.set(ev.data.id, { ...prev, ...ev.data });
        break;
      }
      case "position":
        this.positions.set(ev.data.nodeId, ev.data);
        break;
      case "message":
        this.messages.push(ev.data);
        if (this.messages.length > this.maxMessages) this.messages.shift();
        break;
      case "telemetry":
        this.telemetry.push(ev.data);
        if (this.telemetry.length > this.maxTelemetry) this.telemetry.shift();
        break;
      case "edge":
        this.edges.set(`${ev.data.from}->${ev.data.to}`, ev.data);
        break;
    }
  }

  snapshot(): Snapshot {
    return {
      nodes: [...this.nodes.values()],
      positions: [...this.positions.values()],
      messages: [...this.messages],
      telemetry: [...this.telemetry],
      edges: [...this.edges.values()],
    };
  }
}
