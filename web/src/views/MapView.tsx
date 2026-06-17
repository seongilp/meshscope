import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { AppState } from "../store.js";

// Free demo raster style (no API key).
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const FRESH_MS = 15 * 60 * 1000;

export function MapView({ state }: { state: AppState }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, { marker: maplibregl.Marker; fresh: boolean }>>(new Map());
  const hasFit = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({ container: container.current, style: STYLE, center: [0, 20], zoom: 1.5 });
    map.current = m;
    // On unmount (incl. StrictMode's dev double-mount), drop markers tied to this
    // map instance so they get re-added to the next one instead of vanishing.
    return () => {
      markers.current.forEach((e) => e.marker.remove());
      markers.current.clear();
      hasFit.current = false;
      m.remove();
      map.current = null;
    };
  }, []);

  // Re-evaluate freshness periodically so silent nodes fade even without new data.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const now = Date.now();
    const positions = Object.values(state.positions);
    for (const pos of positions) {
      const fresh = now - (state.nodes[pos.nodeId]?.lastHeard ?? pos.time) < FRESH_MS;
      const name = state.nodes[pos.nodeId]?.longName ?? pos.nodeId;
      const existing = markers.current.get(pos.nodeId);
      if (existing && existing.fresh === fresh) {
        existing.marker.setLngLat([pos.lon, pos.lat]);
        continue;
      }
      // New node, or freshness changed — (re)create the marker (color is fixed at construction).
      existing?.marker.remove();
      const marker = new maplibregl.Marker({ color: fresh ? "#22c55e" : "#71717a" })
        .setLngLat([pos.lon, pos.lat])
        .setPopup(new maplibregl.Popup().setText(name))
        .addTo(map.current);
      markers.current.set(pos.nodeId, { marker, fresh });
    }
    // First time nodes appear, frame them so a handful of pins are actually
    // visible instead of being lost on a zoomed-out world map.
    if (!hasFit.current && positions.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      positions.forEach((p) => bounds.extend([p.lon, p.lat]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 0 });
      hasFit.current = true;
    }
  }, [state.positions, state.nodes, tick]);

  return <div ref={container} className="w-full h-full" />;
}
