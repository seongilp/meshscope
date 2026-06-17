import mqtt from "mqtt";

const URL = process.env.MQTT_URL ?? "mqtt://mqtt.meshtastic.org:1883";
const USER = process.env.MQTT_USER ?? "meshdev";
const PASS = process.env.MQTT_PASS ?? "large4cats";
// NOTE: the public broker rejects broad wildcards (msh/# -> ECONNRESET).
// The narrowest filter that gets a SUBACK is msh/2/e/<Channel>/#.
const TOPIC = process.env.MQTT_TOPIC ?? "msh/2/e/LongFast/#";

/** Connect and invoke `onPacket` for every protobuf (`/e/`) message. */
export function startMqtt(onPacket: (payload: Buffer) => void): void {
  const client = mqtt.connect(URL, {
    username: USER,
    password: PASS,
    reconnectPeriod: 5000,
    protocolVersion: 4,
    clientId: "meshscope_" + Math.random().toString(16).slice(2, 10),
  });
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
