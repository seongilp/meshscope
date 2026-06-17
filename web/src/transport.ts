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
