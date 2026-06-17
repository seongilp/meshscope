import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import type { AppState } from "../store.js";

export function TelemetryView({ state }: { state: AppState }) {
  const [nodeId, setNodeId] = useState<string>("");
  const chartEl = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  const nodesWithTelemetry = useMemo(
    () => [...new Set(state.telemetry.map((t) => t.nodeId))],
    [state.telemetry],
  );

  const series = useMemo(() => {
    const rows = state.telemetry
      .filter((t) => t.nodeId === nodeId && t.batteryLevel != null)
      .sort((a, b) => a.time - b.time);
    const xs = rows.map((r) => r.time / 1000);
    const ys = rows.map((r) => r.batteryLevel ?? null);
    return [xs, ys] as uPlot.AlignedData;
  }, [state.telemetry, nodeId]);

  useEffect(() => {
    if (!chartEl.current) return;
    plot.current?.destroy();
    plot.current = new uPlot(
      {
        width: chartEl.current.clientWidth || 600,
        height: 320,
        title: "Battery %",
        series: [{}, { label: "battery", stroke: "#22c55e" }],
        scales: { x: { time: true } },
      },
      series,
      chartEl.current,
    );
    return () => plot.current?.destroy();
  }, [series]);

  return (
    <div className="p-4 space-y-3">
      <select
        className="bg-zinc-800 rounded px-2 py-1 text-sm"
        value={nodeId}
        onChange={(e) => setNodeId(e.target.value)}
      >
        <option value="">Select a node…</option>
        {nodesWithTelemetry.map((id) => (
          <option key={id} value={id}>
            {state.nodes[id]?.longName ?? id}
          </option>
        ))}
      </select>
      {nodeId ? <div ref={chartEl} /> : <p className="text-zinc-500">Pick a node to see its battery history.</p>}
    </div>
  );
}
