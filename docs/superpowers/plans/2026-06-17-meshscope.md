# MeshScope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only web dashboard that subscribes to the public Meshtastic MQTT broker, decodes + decrypts mesh packets in a Node bridge, and renders live map / message-feed / network-graph / telemetry views in the browser.

**Architecture:** A Node **bridge** holds the persistent MQTT connection, decodes protobuf `ServiceEnvelope`s, decrypts default-channel packets (AES-CTR), keeps in-memory live state, and streams normalized JSON to browsers over WebSocket. A Vite/React **web** app connects to that WebSocket, applies a snapshot + live events into a store, and renders four views. Types are shared in a `@meshscope/shared` package.

**Tech Stack:** pnpm workspace monorepo · TypeScript · `mqtt`, `ws`, `@meshtastic/protobufs` + `@bufbuild/protobuf` (bridge) · Vite + React + Tailwind, MapLibre GL, `react-force-graph-2d`, `uplot` (web) · `vitest` + `tsx` for test/dev.

---

## File Structure

```
mesh/
  package.json                 # workspace root: dev/test/build scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  shared/
    package.json               # @meshscope/shared
    src/types.ts               # event + protocol types
    src/ids.ts                 # nodeIdToHex helper
    src/index.ts               # re-exports
  bridge/
    package.json               # @meshscope/bridge
    src/crypto.ts              # key expand + AES-CTR encrypt/decrypt
    src/decode.ts              # ServiceEnvelope -> MeshEvent[]
    src/state.ts               # in-memory MeshState
    src/mqttClient.ts          # MQTT connect/subscribe
    src/server.ts              # WebSocket server (snapshot + broadcast)
    src/index.ts               # wiring / entrypoint
    src/spike.ts               # throwaway connectivity spike
    test/crypto.test.ts
    test/decode.test.ts
    test/state.test.ts
  web/
    package.json               # @meshscope/web
    index.html
    vite.config.ts
    tailwind.config.js
    postcss.config.js
    src/main.tsx
    src/index.css
    src/store.ts               # event reducer + selectors
    src/transport.ts           # WS client w/ reconnect
    src/App.tsx                # shell + tabs + header
    src/views/FeedView.tsx
    src/views/MapView.tsx
    src/views/GraphView.tsx
    src/views/TelemetryView.tsx
    test/store.test.ts
```

Each file has one responsibility. Bridge decode/crypto/state are independently testable pure-ish modules; the server and mqttClient are thin I/O wrappers wired in `index.ts`.

---

## Task 1: Monorepo scaffold + shared types

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `shared/package.json`, `shared/src/types.ts`, `shared/src/ids.ts`, `shared/src/index.ts`

- [ ] **Step 1: Create workspace config**

`pnpm-workspace.yaml`:
```yaml
packages:
  - shared
  - bridge
  - web
```

Root `package.json`:
```json
{
  "name": "meshscope",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -n bridge,web -c blue,green \"pnpm --filter @meshscope/bridge dev\" \"pnpm --filter @meshscope/web dev\"",
    "test": "vitest run",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 2: Create shared package**

`shared/package.json`:
```json
{
  "name": "@meshscope/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`shared/src/ids.ts`:
```ts
/** Format a Meshtastic node number as the canonical "!hhhhhhhh" hex id. */
export function nodeIdToHex(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}
```

`shared/src/types.ts`:
```ts
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
```

`shared/src/index.ts`:
```ts
export * from "./types.js";
export * from "./ids.js";
```

- [ ] **Step 3: Install and commit**

Run: `pnpm install`
Expected: workspace resolves, no errors.

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace + shared types"
```

---

## Task 2: Bridge connectivity spike (validate the early risk)

**Purpose:** Confirm we actually receive data from the public broker AND lock the exact `@meshtastic/protobufs` export/API names before building decode. This is throwaway code.

**Files:**
- Create: `bridge/package.json`, `bridge/src/spike.ts`

- [ ] **Step 1: Create bridge package**

`bridge/package.json`:
```json
{
  "name": "@meshscope/bridge",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "spike": "tsx src/spike.ts",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@meshscope/shared": "workspace:*",
    "@meshtastic/protobufs": "^2.5.0",
    "@bufbuild/protobuf": "^2.2.0",
    "mqtt": "^5.10.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

Run: `pnpm install`

- [ ] **Step 2: Write the spike**

`bridge/src/spike.ts`:
```ts
import mqtt from "mqtt";
import * as pb from "@meshtastic/protobufs";

// Confirm the exact exported schema/symbol names for this installed version.
console.log("protobufs exports:", Object.keys(pb).slice(0, 40));

const client = mqtt.connect("mqtt://mqtt.meshtastic.org:1883", {
  username: "meshdev",
  password: "large4cats",
});

let count = 0;
client.on("connect", () => {
  console.log("connected");
  client.subscribe("msh/#", (err) => console.log("subscribe err:", err));
});
client.on("message", (topic, payload) => {
  if (++count <= 10) console.log(topic, payload.length, "bytes");
  if (count === 10) {
    console.log("got 10 packets — broker works");
    client.end();
  }
});
client.on("error", (e) => console.error("mqtt error:", e));
```

- [ ] **Step 3: Run the spike**

Run: `pnpm --filter @meshscope/bridge spike`
Expected: `connected`, then ~10 `msh/...` topic lines, then `got 10 packets`.

**If no packets arrive in ~30s:** the public broker may be blocking anonymous subscribe or the creds changed. STOP and report — do not proceed; the project's data source is the blocker.

**SPIKE FINDINGS (recorded — these override the plan defaults below):**
- **Broker rejects broad wildcards.** `msh/#` and `msh/2/e/#` get an immediate ECONNRESET (no SUBACK). The minimum working filter is `msh/2/e/<Channel>/#`, e.g. `msh/2/e/LongFast/#`. Task 6's default topic uses this. Packet rate on LongFast is ~5–7/min.
- **Protobuf API = protobuf-es v2** (`@meshtastic/protobufs` 2.7.18 + `@bufbuild/protobuf` 2.12.0). Schemas are nested in namespaces, decode via `fromBinary(Schema, bytes)`:
  - `pb.Mqtt.ServiceEnvelopeSchema`, `pb.Mesh.MeshPacketSchema`, `pb.Mesh.DataSchema`, `pb.Mesh.PositionSchema`, `pb.Mesh.UserSchema`, `pb.Mesh.NeighborInfoSchema`, `pb.Telemetry.TelemetrySchema`, `pb.Portnums.PortNum`
  - oneof: `packet.payloadVariant.case === "decoded" | "encrypted"`, value at `.value`
  - fields are camelCase: `latitudeI`, `longitudeI`, `rxSnr`, `rxRssi`, `channelId`, `airUtilTx`, `relativeHumidity`, `barometricPressure`
  - Task 4 below has been updated to these exact names.

- [ ] **Step 4: Commit the spike**

```bash
git add -A
git commit -m "chore(bridge): MQTT connectivity spike against public broker"
```

---

## Task 3: Crypto module (key expansion + AES-CTR)

**Files:**
- Create: `bridge/src/crypto.ts`, `bridge/test/crypto.test.ts`

- [ ] **Step 1: Write the failing tests**

`bridge/test/crypto.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { expandKey, encrypt, decrypt, DEFAULT_KEY } from "../src/crypto.js";

describe("expandKey", () => {
  it("expands single-byte default psk (0x01) to the default key", () => {
    expect(expandKey(Buffer.from([0x01]))).toEqual(DEFAULT_KEY);
  });
  it("passes a 16-byte key through unchanged", () => {
    const k = Buffer.alloc(16, 7);
    expect(expandKey(k)).toEqual(k);
  });
});

describe("AES-CTR round trip", () => {
  it("decrypt reverses encrypt with same key/nonce", () => {
    const key = expandKey(Buffer.from([0x01]));
    const from = 0x12345678;
    const id = 0x00abcdef;
    const plain = Buffer.from("hello mesh", "utf8");
    const ct = encrypt(key, from, id, plain);
    expect(ct.equals(plain)).toBe(false);
    expect(decrypt(key, from, id, ct).toString("utf8")).toBe("hello mesh");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run bridge/test/crypto.test.ts`
Expected: FAIL — cannot find module `../src/crypto.js`.

- [ ] **Step 3: Implement crypto**

`bridge/src/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv } from "node:crypto";

/** Meshtastic well-known default channel key (AES-128). */
export const DEFAULT_KEY = Buffer.from([
  0xd4, 0xf1, 0xbb, 0x3a, 0x20, 0x29, 0x07, 0x59,
  0xf0, 0xbc, 0xff, 0xab, 0xcf, 0x4e, 0x69, 0x01,
]);

/** Expand a Meshtastic PSK into a usable AES key. */
export function expandKey(psk: Buffer): Buffer {
  if (psk.length === 0) return Buffer.alloc(0);
  if (psk.length === 1) {
    // single-byte PSK indexes the default key; 0x01 == default channel
    const key = Buffer.from(DEFAULT_KEY);
    key[key.length - 1] = (DEFAULT_KEY[DEFAULT_KEY.length - 1] + psk[0] - 1) & 0xff;
    return key;
  }
  return Buffer.from(psk); // 16- or 32-byte keys used directly
}

/** CTR nonce = packetId (uint64 LE) ++ fromNode (uint32 LE) ++ 0x00000000. */
export function buildNonce(fromNode: number, packetId: number): Buffer {
  const nonce = Buffer.alloc(16);
  nonce.writeUInt32LE(packetId >>> 0, 0); // low 32 bits of id; bytes 4-7 stay 0
  nonce.writeUInt32LE(fromNode >>> 0, 8);
  return nonce;
}

function algoFor(key: Buffer): "aes-256-ctr" | "aes-128-ctr" {
  return key.length === 32 ? "aes-256-ctr" : "aes-128-ctr";
}

export function decrypt(key: Buffer, fromNode: number, packetId: number, ct: Buffer): Buffer {
  const d = createDecipheriv(algoFor(key), key, buildNonce(fromNode, packetId));
  return Buffer.concat([d.update(ct), d.final()]);
}

export function encrypt(key: Buffer, fromNode: number, packetId: number, pt: Buffer): Buffer {
  const c = createCipheriv(algoFor(key), key, buildNonce(fromNode, packetId));
  return Buffer.concat([c.update(pt), c.final()]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run bridge/test/crypto.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add bridge/src/crypto.ts bridge/test/crypto.test.ts
git commit -m "feat(bridge): AES-CTR crypto with default-key expansion"
```

---

## Task 4: Decode module (ServiceEnvelope → MeshEvent[])

**Files:**
- Create: `bridge/src/decode.ts`, `bridge/test/decode.test.ts`

> Test fixtures are built by encoding messages with the SAME protobuf lib, then decoding — a round-trip that validates branching without needing real captures. If the spike (Task 2) reported different export names, update the imports here to match.

- [ ] **Step 1: Write the failing test**

`bridge/test/decode.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";
import { Mqtt, Mesh, Portnums } from "@meshtastic/protobufs";
import { decodeEnvelope } from "../src/decode.js";

function textEnvelope(text: string, from: number) {
  const data = create(Mesh.DataSchema, {
    portnum: Portnums.PortNum.TEXT_MESSAGE_APP,
    payload: new TextEncoder().encode(text),
  });
  const packet = create(Mesh.MeshPacketSchema, {
    from,
    to: 0xffffffff,
    id: 1234,
    rxSnr: 5.5,
    payloadVariant: { case: "decoded", value: data },
  });
  const env = create(Mqtt.ServiceEnvelopeSchema, { packet, channelId: "LongFast" });
  return toBinary(Mqtt.ServiceEnvelopeSchema, env);
}

describe("decodeEnvelope", () => {
  it("decodes a plaintext TEXT_MESSAGE_APP packet into a message event", () => {
    const events = decodeEnvelope(textEnvelope("hi mesh", 0x11223344));
    const msg = events.find((e) => e.type === "message");
    expect(msg).toBeTruthy();
    if (msg?.type === "message") {
      expect(msg.data.text).toBe("hi mesh");
      expect(msg.data.from).toBe("!11223344");
      expect(msg.data.channel).toBe("LongFast");
    }
  });

  it("always emits a node event carrying lastHeard for the sender", () => {
    const events = decodeEnvelope(textEnvelope("x", 0x0000beef));
    const node = events.find((e) => e.type === "node");
    expect(node?.type === "node" && node.data.id).toBe("!0000beef");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run bridge/test/decode.test.ts`
Expected: FAIL — cannot find `../src/decode.js`.

- [ ] **Step 3: Implement decode**

`bridge/src/decode.ts`:
```ts
import { fromBinary, type MessageShape } from "@bufbuild/protobuf";
import { Mqtt, Mesh, Telemetry, Portnums } from "@meshtastic/protobufs";
import { nodeIdToHex, type MeshEvent } from "@meshscope/shared";
import { expandKey, decrypt } from "./crypto.js";

const DEFAULT_KEY = expandKey(Buffer.from([0x01]));

export function decodeEnvelope(payload: Uint8Array): MeshEvent[] {
  let env;
  try {
    env = fromBinary(Mqtt.ServiceEnvelopeSchema, payload);
  } catch {
    return [];
  }
  const packet = env.packet;
  if (!packet) return [];

  const from = nodeIdToHex(packet.from);
  const to = nodeIdToHex(packet.to);
  const channel = env.channelId ?? "";
  const now = Date.now();

  // Resolve the inner Data: either decoded inline, or decrypt the bytes.
  let data: MessageShape<typeof Mesh.DataSchema> | undefined;
  const variant = packet.payloadVariant;
  if (variant?.case === "decoded") {
    data = variant.value;
  } else if (variant?.case === "encrypted") {
    try {
      const plain = decrypt(DEFAULT_KEY, packet.from, Number(packet.id), Buffer.from(variant.value));
      data = fromBinary(Mesh.DataSchema, plain);
    } catch {
      data = undefined; // custom-key packet we can't read
    }
  }

  // Every packet refreshes the sender's lastHeard.
  const events: MeshEvent[] = [{ type: "node", data: { id: from, num: packet.from, lastHeard: now } }];
  if (!data) return events;

  switch (data.portnum) {
    case Portnums.PortNum.TEXT_MESSAGE_APP: {
      events.push({
        type: "message",
        data: {
          id: Number(packet.id),
          from,
          to,
          channel,
          text: new TextDecoder().decode(data.payload),
          time: now,
          rxSnr: packet.rxSnr,
          rxRssi: packet.rxRssi,
          hopLimit: packet.hopLimit,
        },
      });
      break;
    }
    case Portnums.PortNum.POSITION_APP: {
      const p = fromBinary(Mesh.PositionSchema, data.payload);
      if (p.latitudeI !== 0 || p.longitudeI !== 0) {
        events.push({
          type: "position",
          data: {
            nodeId: from,
            lat: p.latitudeI / 1e7,
            lon: p.longitudeI / 1e7,
            alt: p.altitude,
            time: p.time ? p.time * 1000 : now,
          },
        });
      }
      break;
    }
    case Portnums.PortNum.NODEINFO_APP: {
      const u = fromBinary(Mesh.UserSchema, data.payload);
      events.push({
        type: "node",
        data: {
          id: from,
          num: packet.from,
          shortName: u.shortName,
          longName: u.longName,
          hwModel: String(u.hwModel),
          role: String(u.role),
          lastHeard: now,
        },
      });
      break;
    }
    case Portnums.PortNum.TELEMETRY_APP: {
      const t = fromBinary(Telemetry.TelemetrySchema, data.payload);
      const v = t.variant;
      if (v?.case === "deviceMetrics") {
        events.push({
          type: "telemetry",
          data: {
            nodeId: from,
            time: now,
            batteryLevel: v.value.batteryLevel,
            voltage: v.value.voltage,
            channelUtil: v.value.channelUtilization,
            airUtilTx: v.value.airUtilTx,
          },
        });
      } else if (v?.case === "environmentMetrics") {
        events.push({
          type: "telemetry",
          data: {
            nodeId: from,
            time: now,
            temperature: v.value.temperature,
            humidity: v.value.relativeHumidity,
            pressure: v.value.barometricPressure,
          },
        });
      }
      break;
    }
    case Portnums.PortNum.NEIGHBORINFO_APP: {
      const n = fromBinary(Mesh.NeighborInfoSchema, data.payload);
      for (const nb of n.neighbors) {
        events.push({ type: "edge", data: { from, to: nodeIdToHex(nb.nodeId), snr: nb.snr } });
      }
      break;
    }
  }
  return events;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run bridge/test/decode.test.ts`
Expected: PASS. If a field name mismatches the installed protobuf version (e.g. `latitudeI` vs `latitude_i`), fix per the Task 2 spike output and re-run.

- [ ] **Step 5: Commit**

```bash
git add bridge/src/decode.ts bridge/test/decode.test.ts
git commit -m "feat(bridge): decode ServiceEnvelope into normalized mesh events"
```

---

## Task 5: In-memory mesh state

**Files:**
- Create: `bridge/src/state.ts`, `bridge/test/state.test.ts`

- [ ] **Step 1: Write the failing tests**

`bridge/test/state.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run bridge/test/state.test.ts`
Expected: FAIL — cannot find `../src/state.js`.

- [ ] **Step 3: Implement state**

`bridge/src/state.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run bridge/test/state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add bridge/src/state.ts bridge/test/state.test.ts
git commit -m "feat(bridge): in-memory mesh state with ring buffers"
```

---

## Task 6: MQTT client + WebSocket server + wiring

**Files:**
- Create: `bridge/src/mqttClient.ts`, `bridge/src/server.ts`, `bridge/src/index.ts`, `bridge/tsconfig.json`

> These are thin I/O wrappers verified by running, not unit tests.

- [ ] **Step 1: MQTT client**

`bridge/src/mqttClient.ts`:
```ts
import mqtt from "mqtt";

const URL = process.env.MQTT_URL ?? "mqtt://mqtt.meshtastic.org:1883";
const USER = process.env.MQTT_USER ?? "meshdev";
const PASS = process.env.MQTT_PASS ?? "large4cats";
// NOTE: the public broker rejects broad wildcards (msh/# -> ECONNRESET).
// The narrowest filter that gets a SUBACK is msh/2/e/<Channel>/#.
const TOPIC = process.env.MQTT_TOPIC ?? "msh/2/e/LongFast/#";

/** Connect and invoke `onPacket` for every protobuf (`/e/`) message. */
export function startMqtt(onPacket: (payload: Buffer) => void): void {
  const client = mqtt.connect(URL, { username: USER, password: PASS, reconnectPeriod: 5000 });
  client.on("connect", () => {
    console.log("[mqtt] connected", URL);
    client.subscribe(TOPIC, (err) => err && console.error("[mqtt] subscribe", err));
  });
  client.on("reconnect", () => console.log("[mqtt] reconnecting"));
  client.on("error", (e) => console.error("[mqtt]", e.message));
  client.on("message", (topic, payload) => {
    if (topic.includes("/e/")) onPacket(payload); // protobuf ServiceEnvelope only
  });
}
```

- [ ] **Step 2: WebSocket server**

`bridge/src/server.ts`:
```ts
import { WebSocketServer, WebSocket } from "ws";
import type { MeshState } from "./state.js";
import type { MeshEvent, ServerMessage } from "@meshscope/shared";

export function startServer(port: number, state: MeshState) {
  const wss = new WebSocketServer({ port });
  console.log(`[ws] listening on :${port}`);

  wss.on("connection", (ws) => {
    const hello: ServerMessage = { kind: "snapshot", snapshot: state.snapshot() };
    ws.send(JSON.stringify(hello));
  });

  function broadcast(event: MeshEvent) {
    const msg: ServerMessage = { kind: "event", event };
    const json = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(json);
    }
  }
  return { broadcast };
}
```

- [ ] **Step 3: Entrypoint wiring**

`bridge/src/index.ts`:
```ts
import { startMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";
import { decodeEnvelope } from "./decode.js";
import { MeshState } from "./state.js";

const PORT = Number(process.env.WS_PORT ?? 8787);
const state = new MeshState();
const { broadcast } = startServer(PORT, state);

let total = 0;
startMqtt((payload) => {
  for (const event of decodeEnvelope(payload)) {
    state.apply(event);
    broadcast(event);
  }
  if (++total % 100 === 0) console.log(`[bridge] ${total} packets processed`);
});
```

`bridge/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 4: Run the bridge end-to-end**

Run: `pnpm --filter @meshscope/bridge dev`
Expected: `[ws] listening on :8787`, `[mqtt] connected`, then periodic `[bridge] N packets processed`. Leave it running for the web tasks. Stop with Ctrl-C when done verifying.

- [ ] **Step 5: Commit**

```bash
git add bridge/src/mqttClient.ts bridge/src/server.ts bridge/src/index.ts bridge/tsconfig.json
git commit -m "feat(bridge): MQTT->decode->state->WebSocket pipeline"
```

---

## Task 7: Web scaffold (Vite + React + Tailwind)

**Files:**
- Create: `web/package.json`, `web/index.html`, `web/vite.config.ts`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/src/main.tsx`, `web/src/index.css`

- [ ] **Step 1: Create web package**

`web/package.json`:
```json
{
  "name": "@meshscope/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@meshscope/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "maplibre-gl": "^4.7.0",
    "react-force-graph-2d": "^1.27.0",
    "uplot": "^1.6.31"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0"
  }
}
```

Run: `pnpm install`

- [ ] **Step 2: Vite + Tailwind config**

`web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
```

`web/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

`web/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3: Entry files**

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MeshScope</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body, #root { height: 100%; margin: 0; }
```

`web/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "uplot/dist/uPlot.min.css";
import "./index.css";
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Commit** (App.tsx comes in Task 9; this won't run yet)

```bash
git add web/
git commit -m "chore(web): Vite + React + Tailwind scaffold"
```

---

## Task 8: Web store + transport (TDD)

**Files:**
- Create: `web/src/store.ts`, `web/src/transport.ts`, `web/test/store.test.ts`

- [ ] **Step 1: Write the failing tests**

`web/test/store.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run web/test/store.test.ts`
Expected: FAIL — cannot find `../src/store.js`.

- [ ] **Step 3: Implement store**

`web/src/store.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run web/test/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement transport (verified later via the running app)**

`web/src/transport.ts`:
```ts
import type { ServerMessage } from "@meshscope/shared";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8787";

/** Connect to the bridge with auto-reconnect. Returns a cleanup function. */
export function connect(
  onMessage: (msg: ServerMessage) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const open = () => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => onStatus(true);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMessage);
    ws.onclose = () => {
      onStatus(false);
      if (!closed) timer = setTimeout(open, 3000);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/store.ts web/src/transport.ts web/test/store.test.ts
git commit -m "feat(web): store reducer + reconnecting WS transport"
```

---

## Task 9: App shell — header, tabs, live wiring

**Files:**
- Create: `web/src/App.tsx`

- [ ] **Step 1: Implement App shell**

`web/src/App.tsx`:
```tsx
import { useEffect, useReducer, useState } from "react";
import type { ServerMessage } from "@meshscope/shared";
import { AppState, emptyState, reduce } from "./store.js";
import { connect } from "./transport.js";
import { FeedView } from "./views/FeedView.js";
import { MapView } from "./views/MapView.js";
import { GraphView } from "./views/GraphView.js";
import { TelemetryView } from "./views/TelemetryView.js";

type Tab = "map" | "feed" | "graph" | "telemetry";
const TABS: Tab[] = ["map", "feed", "graph", "telemetry"];

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, emptyState);
  const [tab, setTab] = useState<Tab>("map");
  const [connected, setConnected] = useState(false);

  useEffect(() => connect((m: ServerMessage) => dispatch(m), setConnected), []);

  const nodeCount = Object.keys(state.nodes).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800">
        <h1 className="font-bold tracking-tight">MeshScope</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-sm capitalize ${tab === t ? "bg-zinc-700" : "hover:bg-zinc-800"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-400">
          <span>{nodeCount} nodes</span>
          <span>{state.messages.length} msgs</span>
          <span className={`flex items-center gap-1 ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "live" : "offline"}
          </span>
        </div>
      </header>
      <main className="flex-1 min-h-0">
        {tab === "map" && <MapView state={state} />}
        {tab === "feed" && <FeedView state={state} />}
        {tab === "graph" && <GraphView state={state} />}
        {tab === "telemetry" && <TelemetryView state={state} />}
      </main>
    </div>
  );
}

export type { AppState };
```

- [ ] **Step 2: Commit** (views are stubbed next; build runs after Task 10–13)

```bash
git add web/src/App.tsx
git commit -m "feat(web): app shell with tabs, header, live status"
```

---

## Task 10: Feed view

**Files:**
- Create: `web/src/views/FeedView.tsx`

- [ ] **Step 1: Implement FeedView**

`web/src/views/FeedView.tsx`:
```tsx
import type { AppState } from "../store.js";

export function FeedView({ state }: { state: AppState }) {
  const msgs = [...state.messages].reverse(); // newest first
  return (
    <div className="h-full overflow-y-auto p-3 space-y-1 font-mono text-sm">
      {msgs.length === 0 && <p className="text-zinc-500">Waiting for messages…</p>}
      {msgs.map((m, i) => {
        const name = state.nodes[m.from]?.longName ?? state.nodes[m.from]?.shortName ?? m.from;
        return (
          <div key={`${m.id}-${i}`} className="flex gap-2">
            <span className="text-zinc-500">{new Date(m.time).toLocaleTimeString()}</span>
            <span className="text-cyan-400 shrink-0">{name}</span>
            <span className="text-zinc-500">[{m.channel}]</span>
            <span className="flex-1">{m.text}</span>
            {m.rxSnr != null && <span className="text-zinc-600">{m.rxSnr.toFixed(1)}dB</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/FeedView.tsx
git commit -m "feat(web): live message feed view"
```

---

## Task 11: Map view

**Files:**
- Create: `web/src/views/MapView.tsx`

- [ ] **Step 1: Implement MapView**

`web/src/views/MapView.tsx`:
```tsx
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { AppState } from "../store.js";

// Free demo raster style (no API key).
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function MapView({ state }: { state: AppState }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!container.current) return;
    map.current = new maplibregl.Map({ container: container.current, style: STYLE, center: [0, 20], zoom: 1.5 });
    return () => map.current?.remove();
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const now = Date.now();
    for (const pos of Object.values(state.positions)) {
      const fresh = now - (state.nodes[pos.nodeId]?.lastHeard ?? pos.time) < 15 * 60 * 1000;
      const name = state.nodes[pos.nodeId]?.longName ?? pos.nodeId;
      let marker = markers.current.get(pos.nodeId);
      if (!marker) {
        marker = new maplibregl.Marker({ color: fresh ? "#22c55e" : "#71717a" })
          .setLngLat([pos.lon, pos.lat])
          .setPopup(new maplibregl.Popup().setText(name))
          .addTo(map.current);
        markers.current.set(pos.nodeId, marker);
      } else {
        marker.setLngLat([pos.lon, pos.lat]);
      }
    }
  }, [state.positions, state.nodes]);

  return <div ref={container} className="w-full h-full" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/MapView.tsx
git commit -m "feat(web): live node map view (MapLibre)"
```

---

## Task 12: Graph view

**Files:**
- Create: `web/src/views/GraphView.tsx`

- [ ] **Step 1: Implement GraphView**

`web/src/views/GraphView.tsx`:
```tsx
import { useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { AppState } from "../store.js";

export function GraphView({ state }: { state: AppState }) {
  const data = useMemo(() => {
    const ids = new Set<string>();
    const links = Object.values(state.edges).map((e) => {
      ids.add(e.from);
      ids.add(e.to);
      return { source: e.from, target: e.to, snr: e.snr };
    });
    const nodes = [...ids].map((id) => ({
      id,
      name: state.nodes[id]?.longName ?? state.nodes[id]?.shortName ?? id,
    }));
    return { nodes, links };
  }, [state.edges, state.nodes]);

  if (data.nodes.length === 0) {
    return <p className="p-4 text-zinc-500">No neighbor links heard yet…</p>;
  }
  return (
    <ForceGraph2D
      graphData={data}
      nodeLabel="name"
      linkLabel={(l: any) => (l.snr != null ? `${l.snr} dB` : "")}
      backgroundColor="#09090b"
      nodeColor={() => "#22d3ee"}
      linkColor={() => "#3f3f46"}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/GraphView.tsx
git commit -m "feat(web): mesh network graph view"
```

---

## Task 13: Telemetry view

**Files:**
- Create: `web/src/views/TelemetryView.tsx`

- [ ] **Step 1: Implement TelemetryView**

`web/src/views/TelemetryView.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import type { AppState } from "../store.js";

export function TelemetryView({ state }: { state: AppState }) {
  const [nodeId, setNodeId] = useState<string>("");
  const chartEl = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  const nodesWithTelemetry = useMemo(
    () => [...new Set(state.telemetry.map((t) => t.nodeId))],
    [state.telemetry],
  );

  const series = useMemo(() => {
    const rows = state.telemetry
      .filter((t) => t.nodeId === nodeId && t.batteryLevel != null)
      .sort((a, b) => a.time - b.time);
    const xs = rows.map((r) => r.time / 1000);
    const ys = rows.map((r) => r.batteryLevel ?? null);
    return [xs, ys] as uPlot.AlignedData;
  }, [state.telemetry, nodeId]);

  useEffect(() => {
    if (!chartEl.current) return;
    plot.current?.destroy();
    plot.current = new uPlot(
      {
        width: chartEl.current.clientWidth || 600,
        height: 320,
        title: "Battery %",
        series: [{}, { label: "battery", stroke: "#22c55e" }],
        scales: { x: { time: true } },
      },
      series,
      chartEl.current,
    );
    return () => plot.current?.destroy();
  }, [series]);

  return (
    <div className="p-4 space-y-3">
      <select
        className="bg-zinc-800 rounded px-2 py-1 text-sm"
        value={nodeId}
        onChange={(e) => setNodeId(e.target.value)}
      >
        <option value="">Select a node…</option>
        {nodesWithTelemetry.map((id) => (
          <option key={id} value={id}>
            {state.nodes[id]?.longName ?? id}
          </option>
        ))}
      </select>
      {nodeId ? <div ref={chartEl} /> : <p className="text-zinc-500">Pick a node to see its battery history.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Run the full app and verify all four views**

Ensure the bridge from Task 6 is running, then: `pnpm --filter @meshscope/web dev`
Open the printed URL. Verify:
- Header shows **live** (green) and a rising node/msg count.
- **Map**: green/grey markers appear as positions arrive.
- **Feed**: text messages scroll in.
- **Graph**: appears once NeighborInfo links are heard (may take minutes).
- **Telemetry**: node dropdown populates; selecting one draws a battery chart.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/TelemetryView.tsx
git commit -m "feat(web): per-node telemetry chart view"
```

---

## Task 14: Root README + one-command dev

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:
```markdown
# MeshScope

Read-only web dashboard for the public Meshtastic mesh. A Node bridge subscribes
to `mqtt.meshtastic.org`, decodes + decrypts default-channel packets, and streams
JSON to a React app rendering live map / feed / graph / telemetry views.

## Run

```bash
pnpm install
pnpm dev   # starts the bridge (:8787) and the web app together
```

Open the URL Vite prints. The bridge needs outbound MQTT (port 1883).

## Config (env vars)

- Bridge: `MQTT_URL`, `MQTT_USER`, `MQTT_PASS`, `MQTT_TOPIC`, `WS_PORT`
- Web: `VITE_WS_URL` (defaults to `ws://localhost:8787`)

## Test

```bash
pnpm test
```
```

- [ ] **Step 2: Verify the combined dev command**

Run: `pnpm dev`
Expected: both bridge logs and Vite URL appear; the app works as in Task 13.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: crypto, decode, state, and store suites all PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with one-command dev"
```

---

## Self-Review Notes

- **Spec coverage:** bridge (mqttClient/crypto/decode/state/server) → Tasks 2–6; shared event model → Task 1; four views → Tasks 10–13; error handling (reconnect, tagged-not-dropped, no-GPS-still-listed) → Tasks 4/6/8 + MapView filter; testing (crypto/decode/state/store) → Tasks 3/4/5/8; early-risk spike → Task 2. All covered.
- **Type consistency:** `MeshEvent`, `Snapshot`, `ServerMessage`, `NodeInfo`, etc. defined once in Task 1 and imported everywhere; `nodeIdToHex` shared; store keys edges as `from->to` matching the bridge.
- **Known external risk:** exact `@meshtastic/protobufs` symbol/field names are version-dependent; Task 2's spike locks them before Task 4 relies on them. If they differ, adjust Task 4 imports/field accessors accordingly — this is the one place the plan defers to a runtime check by design.
```
