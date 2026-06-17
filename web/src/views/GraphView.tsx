import { useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { AppState } from "../store.js";

export function GraphView({ state }: { state: AppState }) {
  const data = useMemo(() => {
    const ids = new Set<string>();
    const links = Object.values(state.edges).map((e) => {
      ids.add(e.from);
      ids.add(e.to);
      return { source: e.from, target: e.to, snr: e.snr };
    });
    const nodes = [...ids].map((id) => ({
      id,
      name: state.nodes[id]?.longName ?? state.nodes[id]?.shortName ?? id,
    }));
    return { nodes, links };
  }, [state.edges, state.nodes]);

  if (data.nodes.length === 0) {
    return <p className="p-4 text-zinc-500">No neighbor links heard yet…</p>;
  }
  return (
    <ForceGraph2D
      graphData={data}
      nodeLabel="name"
      linkLabel={(l: any) => (l.snr != null ? `${l.snr} dB` : "")}
      backgroundColor="#09090b"
      nodeColor={() => "#22d3ee"}
      linkColor={() => "#3f3f46"}
    />
  );
}
