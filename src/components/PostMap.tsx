import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AdminPlace, CommunityPost } from "../types";

interface PostMapProps {
  posts: CommunityPost[];
  adminPlaces?: AdminPlace[];
  selectedPostId?: string | null;
  onSelectPost?: (post: CommunityPost | null) => void;
  onLocationPick?: (location: { lat: number; lng: number }) => void;
}

async function loadLeaflet(): Promise<typeof Leaflet> {
  const L = (await import("leaflet")).default;
  (window as any).L = L;
  return L;
}

export function PostMap({
  posts,
  adminPlaces = [],
  selectedPostId,
  onSelectPost,
  onLocationPick,
}: PostMapProps) {
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const adminMarkerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  // リサイズ監視処理
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) {
        return;
      }

      mapRef.current?.invalidateSize();
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    let disposed = false;

    (async () => {
      const L = await loadLeaflet();
      if (disposed || !container) {
        return;
      }

      const map = L.map(container, {
        zoomControl: true,
      }).setView([35.681236, 139.767125], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      adminMarkerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setIsReady(true);

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        onLocationPick?.({ lat, lng });
      });
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      adminMarkerLayerRef.current = null;
      markerMapRef.current.clear();
    };
  }, [onLocationPick]);

  const normalizedPosts = useMemo(
    () =>
      posts.filter(
        (post) => Number.isFinite(post.lat) && Number.isFinite(post.lng),
      ),
    [posts],
  );

  const normalizedAdminPlaces = useMemo(
    () =>
      adminPlaces.filter(
        (place) => Number.isFinite(place.lat) && Number.isFinite(place.lng),
      ),
    [adminPlaces],
  );

  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    const adminLayer = adminMarkerLayerRef.current;
    if (!map || !layer || !adminLayer || !isReady) {
      return;
    }

    const nextMarkers = new Map<string, Leaflet.Marker>();
    layer.clearLayers();

    normalizedPosts.forEach((post) => {
      const marker = (window as any).L.marker([post.lat, post.lng]).bindPopup(`
          <div style="min-width:180px; max-width:220px;">
            <strong>${post.title}</strong>
            <div style="margin:8px 0;">${post.summary}</div>
            <img src="${post.photoUrl}" alt="${post.title}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;" />
          </div>
        `);

      marker.on("click", () => {
        onSelectPost?.(post);
      });

      marker.addTo(layer);
      nextMarkers.set(post.id, marker);
    });

    adminLayer.clearLayers();
    normalizedAdminPlaces.forEach((place) => {
      const marker = (window as any).L.circleMarker([place.lat, place.lng], {
        radius: 7,
        color: "#0f766e",
        fillColor: "#2dd4bf",
        fillOpacity: 0.9,
        weight: 2,
      }).bindPopup(`
          <div style="min-width:180px; max-width:220px;">
            <strong>${place.name}</strong>
            <div style="margin:8px 0; color:#475569;">${place.category}</div>
            <div style="font-size:12px; color:#64748b;">${place.prefecture} / ${place.city}</div>
          </div>
        `);

      marker.addTo(adminLayer);
    });

    markerMapRef.current = nextMarkers;

    const allPoints = [
      ...normalizedPosts.map(
        (post) => [post.lat, post.lng] as [number, number],
      ),
      ...normalizedAdminPlaces.map(
        (place) => [place.lat, place.lng] as [number, number],
      ),
    ];

    if (allPoints.length > 0) {
      const bounds = (window as any).L.latLngBounds(allPoints);
      map.fitBounds(bounds.pad(0.3));
    }
  }, [normalizedPosts, normalizedAdminPlaces, isReady, onSelectPost]);

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    const marker = markerMapRef.current.get(selectedPostId);
    if (!marker) {
      return;
    }

    marker.openPopup();
  }, [selectedPostId]);

  return <div ref={mapContainerRef} className={"h-full w-full"} />;
}
