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

  try {
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
  } catch {
    // corrupt inner payload — keep the node event we already have, drop the rest
  }
  return events;
}
