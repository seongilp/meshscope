export interface NodeInfo {
  id: string;        // "!hex"
  num: number;       // node number
  shortName?: string;
  longName?: string;
  hwModel?: string;
  role?: string;
  lastHeard: number; // epoch ms
}

export interface Position {
  nodeId: string;
  lat: number;
  lon: number;
  alt?: number;
  time: number;
}

export interface Message {
  id: number;
  from: string;
  to: string;
  channel: string;
  text: string;
  time: number;
  rxSnr?: number;
  rxRssi?: number;
  hopLimit?: number;
}

export interface Telemetry {
  nodeId: string;
  time: number;
  batteryLevel?: number;
  voltage?: number;
  channelUtil?: number;
  airUtilTx?: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
}

export interface Edge {
  from: string;
  to: string;
  snr?: number;
}

export type MeshEvent =
  | { type: "node"; data: NodeInfo }
  | { type: "position"; data: Position }
  | { type: "message"; data: Message }
  | { type: "telemetry"; data: Telemetry }
  | { type: "edge"; data: Edge };

export interface Snapshot {
  nodes: NodeInfo[];
  positions: Position[];
  messages: Message[];
  telemetry: Telemetry[];
  edges: Edge[];
}

export type ServerMessage =
  | { kind: "snapshot"; snapshot: Snapshot }
  | { kind: "event"; event: MeshEvent };
