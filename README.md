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
