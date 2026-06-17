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
