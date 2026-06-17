import mqtt from "mqtt";
import * as pb from "@meshtastic/protobufs";

// Confirm the exact exported schema/symbol names for this installed version.
console.log("protobufs exports:", Object.keys(pb).slice(0, 40));

// NOTE: The public broker (mqtt.meshtastic.org:1883) rejects overly-broad wildcards such as
// "msh/#" and "msh/2/e/#" with an immediate ECONNRESET post-SUBSCRIBE.
// Minimum working topic filter is at channel level: "msh/2/e/<ChannelName>/#".
const TOPIC = "msh/2/e/LongFast/#";

const client = mqtt.connect("mqtt://mqtt.meshtastic.org:1883", {
  username: "meshdev",
  password: "large4cats",
  protocolVersion: 4,
  reconnectPeriod: 0, // disable auto-reconnect so errors are obvious
  clean: true,
  clientId: "meshscope_spike_" + Math.random().toString(16).slice(2, 8),
});

let count = 0;
client.on("connect", () => {
  console.log("connected");
  client.subscribe(TOPIC, (err) => console.log("subscribe err:", err));
});
client.on("message", (topic, payload) => {
  if (++count <= 10) console.log(topic, payload.length, "bytes");
  if (count === 10) {
    console.log("got 10 packets — broker works");
    client.end();
  }
});
client.on("error", (e) => console.error("mqtt error:", e));
