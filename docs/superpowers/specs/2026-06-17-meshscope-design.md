# MeshScope — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design phase)

## Overview

MeshScope is a read-only web dashboard that subscribes to the public Meshtastic
MQTT broker, decodes and decrypts mesh packets, and renders four live views:
**map, message feed, network graph, and telemetry**.

It observes the mesh; it does not transmit. There is no login and no database in
the initial version — live state is held in memory in the bridge process.

### Goals
- Visualize the public Meshtastic mesh in a browser, live.
- Four coordinated views over a single MQTT data stream.
- Work immediately with zero Meshtastic hardware (public global mesh).

### Non-goals (YAGNI — explicitly deferred)
- Sending messages to the mesh (read-only only).
- Authentication / multi-user accounts.
- Persistent database / long-term history.
- Switching brokers from the UI (single fixed public broker to start).

## Architecture

Chosen approach: **static frontend + tiny bridge backend.**

```
mqtt.meshtastic.org ──TCP/MQTT──▶  Bridge (Node)  ──WebSocket(JSON)──▶  Browser (React)
                                   decode + decrypt                     4 views
```

- The **bridge** owns the single persistent MQTT connection, performs all
  protobuf decoding and AES decryption once, maintains live state, and streams
  clean normalized JSON to connected browsers.
- The **browser** is a renderer only: it connects to the bridge WebSocket,
  receives a state snapshot on connect, then applies live events.

Rationale: protobuf decode + AES decryption is the hard part. Doing it once,
server-side, keeps the four browser views simple and reliable, and avoids
betting on the public broker exposing WebSocket/CORS for direct browser access.
The cost is one small always-on Node process (MQTT needs a persistent
connection, so this is not pure serverless).

## Bridge components

Each component is small and single-purpose.

- **`mqttClient`** — connects to `mqtt.meshtastic.org` (username `meshdev`,
  password `large4cats`), subscribes to `msh/#`, and auto-reconnects on drop.
- **`crypto`** — derives the AES key from the well-known Meshtastic **default
  channel key** and decrypts packets (AES-CTR, nonce from packet id + sender).
  Packets encrypted with custom (non-default) keys cannot be decrypted; their
  metadata (gateway, SNR/RSSI, gateway position) is kept and the packet is
  tagged `encrypted: "unknown"` rather than dropped.
- **`decode`** — `ServiceEnvelope → MeshPacket → Data`, branching on `portnum`
  (`TEXT_MESSAGE_APP`, `POSITION_APP`, `NODEINFO_APP`, `TELEMETRY_APP`,
  `NEIGHBORINFO_APP`) into typed events. Uses the official
  `@meshtastic/protobufs` definitions.
- **`state`** — in-memory live state: node registry, message ring-buffer (last
  N messages), edge list (derived from NeighborInfo and heard-by relationships),
  and per-node telemetry history.
- **`server`** — WebSocket server. On client connect, sends a full snapshot,
  then broadcasts live events to all clients.

## Normalized event model (shared TypeScript)

These plain-JSON types are the contract between bridge and frontend, defined
once in a shared package.

- **`node`** — `{ id, shortName, longName, hwModel, role, lastHeard }`
- **`position`** — `{ nodeId, lat, lon, alt, time }`
- **`message`** — `{ id, from, to, channel, text, time, rxSnr, rxRssi, hopLimit }`
- **`telemetry`** — `{ nodeId, time, batteryLevel, voltage, channelUtil, airUtilTx, temperature?, humidity?, pressure? }`
- **`edge`** — `{ from, to, snr }`

## Frontend views

- **Map** — MapLibre GL. Node markers placed by GPS position, colored by
  last-heard freshness; popup shows name / hardware / SNR.
- **Feed** — live scrolling list of text messages (from, channel, time, signal).
- **Graph** — force-directed node/link graph (`react-force-graph`); edges
  labeled by SNR.
- **Telemetry** — select a node and view battery / voltage / channel-util /
  temperature over time (`uPlot`).
- **Header** — connection status indicator and a live packet counter.

## Tech stack

TypeScript throughout, in a pnpm workspace monorepo.

- **`bridge/`** — Node + `mqtt` + `@meshtastic/protobufs` + Node `crypto`.
- **`web/`** — Vite + React + Tailwind; MapLibre GL; `react-force-graph`; `uPlot`.
- **`shared/`** — shared event/type definitions.
- A single `dev` command runs both the bridge and the web dev server.

## Error handling

- Auto-reconnect on both MQTT and WebSocket disconnects.
- Undecryptable or malformed packets are caught and tagged, never crashing the
  stream.
- Nodes with no GPS still appear in the node list and graph; they are simply
  omitted from the map.

## Testing

- Unit tests for `crypto` (decrypt a captured default-key packet to known
  plaintext) and `decode` (sample payloads → expected typed events).
- `state` reducer unit tests.
- Frontend store reducer tested.
- End-to-end tests deferred.

## Early risk to validate first

The public broker's exact subscribe permissions and the topic firehose volume
are unverified. The **first build step is a ~20-line spike**: connect to the
broker and log raw packets, confirming we actually receive data before building
anything on top of it.
