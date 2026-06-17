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
