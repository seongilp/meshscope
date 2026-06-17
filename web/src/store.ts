import type { ServerMessage, NodeInfo, Position, Message, Telemetry, Edge } from "@meshscope/shared";

export interface AppState {
  nodes: Record<string, NodeInfo>;
  positions: Record<string, Position>;
  messages: Message[];
  telemetry: Telemetry[];
  edges: Record<string, Edge>;
}

const MAX_MESSAGES = 300;
const MAX_TELEMETRY = 5000;

export function emptyState(): AppState {
  return { nodes: {}, positions: {}, messages: [], telemetry: [], edges: {} };
}

export function reduce(state: AppState, msg: ServerMessage): AppState {
  if (msg.kind === "snapshot") {
    const s = msg.snapshot;
    return {
      nodes: Object.fromEntries(s.nodes.map((n) => [n.id, n])),
      positions: Object.fromEntries(s.positions.map((p) => [p.nodeId, p])),
      messages: s.messages,
      telemetry: s.telemetry,
      edges: Object.fromEntries(s.edges.map((e) => [`${e.from}->${e.to}`, e])),
    };
  }
  const ev = msg.event;
  switch (ev.type) {
    case "node":
      return { ...state, nodes: { ...state.nodes, [ev.data.id]: { ...state.nodes[ev.data.id], ...ev.data } } };
    case "position":
      return { ...state, positions: { ...state.positions, [ev.data.nodeId]: ev.data } };
    case "message":
      return { ...state, messages: [...state.messages, ev.data].slice(-MAX_MESSAGES) };
    case "telemetry":
      return { ...state, telemetry: [...state.telemetry, ev.data].slice(-MAX_TELEMETRY) };
    case "edge":
      return { ...state, edges: { ...state.edges, [`${ev.data.from}->${ev.data.to}`]: ev.data } };
  }
}
