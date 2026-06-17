import { useEffect, useRef } from "react";
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

export function MapView({ state }: { state: AppState }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!container.current) return;
    map.current = new maplibregl.Map({ container: container.current, style: STYLE, center: [0, 20], zoom: 1.5 });
    return () => map.current?.remove();
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const now = Date.now();
    for (const pos of Object.values(state.positions)) {
      const fresh = now - (state.nodes[pos.nodeId]?.lastHeard ?? pos.time) < 15 * 60 * 1000;
      const name = state.nodes[pos.nodeId]?.longName ?? pos.nodeId;
      let marker = markers.current.get(pos.nodeId);
      if (!marker) {
        marker = new maplibregl.Marker({ color: fresh ? "#22c55e" : "#71717a" })
          .setLngLat([pos.lon, pos.lat])
          .setPopup(new maplibregl.Popup().setText(name))
          .addTo(map.current);
        markers.current.set(pos.nodeId, marker);
      } else {
        marker.setLngLat([pos.lon, pos.lat]);
      }
    }
  }, [state.positions, state.nodes]);

  return <div ref={container} className="w-full h-full" />;
}
