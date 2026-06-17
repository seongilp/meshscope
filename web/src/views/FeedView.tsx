import type { AppState } from "../store.js";

export function FeedView({ state }: { state: AppState }) {
  const msgs = [...state.messages].reverse(); // newest first
  return (
    <div className="h-full overflow-y-auto p-3 space-y-1 font-mono text-sm">
      {msgs.length === 0 && <p className="text-zinc-500">Waiting for messages…</p>}
      {msgs.map((m, i) => {
        const name = state.nodes[m.from]?.longName ?? state.nodes[m.from]?.shortName ?? m.from;
        return (
          <div key={`${m.id}-${i}`} className="flex gap-2">
            <span className="text-zinc-500">{new Date(m.time).toLocaleTimeString()}</span>
            <span className="text-cyan-400 shrink-0">{name}</span>
            <span className="text-zinc-500">[{m.channel}]</span>
            <span className="flex-1">{m.text}</span>
            {m.rxSnr != null && <span className="text-zinc-600">{m.rxSnr.toFixed(1)}dB</span>}
          </div>
        );
      })}
    </div>
  );
}
