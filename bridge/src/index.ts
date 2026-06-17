import { startMqtt } from "./mqttClient.js";
import { startServer } from "./server.js";
import { decodeEnvelope } from "./decode.js";
import { MeshState } from "./state.js";

const PORT = Number(process.env.WS_PORT ?? 8787);
const state = new MeshState();
const { broadcast } = startServer(PORT, state);

let total = 0;
startMqtt((payload) => {
  for (const event of decodeEnvelope(payload as unknown as Uint8Array)) {
    state.apply(event);
    broadcast(event);
  }
  if (++total % 100 === 0) console.log(`[bridge] ${total} packets processed`);
});
