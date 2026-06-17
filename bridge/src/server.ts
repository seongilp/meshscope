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
