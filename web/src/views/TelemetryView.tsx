import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import type { AppState } from "../store.js";

type MetricKey = "batteryLevel" | "voltage" | "channelUtil" | "temperature";
const METRICS: { key: MetricKey; label: string; stroke: string }[] = [
  { key: "batteryLevel", label: "Battery %", stroke: "#22c55e" },
  { key: "voltage", label: "Voltage (V)", stroke: "#eab308" },
  { key: "channelUtil", label: "Channel util %", stroke: "#38bdf8" },
  { key: "temperature", label: "Temperature °C", stroke: "#f87171" },
];

export function TelemetryView({ state }: { state: AppState }) {
  const [nodeId, setNodeId] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("batteryLevel");
  const chartEl = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  const nodesWithTelemetry = useMemo(
    () => [...new Set(state.telemetry.map((t) => t.nodeId))],
    [state.telemetry],
  );

  const active = METRICS.find((m) => m.key === metric)!;

  const series = useMemo(() => {
    const rows = state.telemetry
      .filter((t) => t.nodeId === nodeId && t[metric] != null)
      .sort((a, b) => a.time - b.time);
    const xs = rows.map((r) => r.time / 1000);
    const ys = rows.map((r) => (r[metric] as number | undefined) ?? null);
    return [xs, ys] as uPlot.AlignedData;
  }, [state.telemetry, nodeId, metric]);

  useEffect(() => {
    if (!chartEl.current) return;
    plot.current?.destroy();
    plot.current = new uPlot(
      {
        width: chartEl.current.clientWidth || 600,
        height: 320,
        title: active.label,
        series: [{}, { label: active.label, stroke: active.stroke }],
        scales: { x: { time: true } },
      },
      series,
      chartEl.current,
    );
    return () => plot.current?.destroy();
  }, [series, active]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
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
        <select
          className="bg-zinc-800 rounded px-2 py-1 text-sm"
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>
      {nodeId ? <div ref={chartEl} /> : <p className="text-zinc-500">Pick a node to see its telemetry history.</p>}
    </div>
  );
}
