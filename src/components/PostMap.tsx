import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AdminPlace, CommunityPost } from "../types";

interface PostMapProps {
  posts: CommunityPost[];
  adminPlaces?: AdminPlace[];
  initialCenter?: { lat: number; lng: number };
  selectedPostId?: string | null;
  onSelectPost?: (post: CommunityPost | null) => void;
  onLocationPick?: (location: { lat: number; lng: number }) => void;
  onBoundsChange?: (bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
}

async function loadLeaflet(): Promise<typeof Leaflet> {
  const L = (await import("leaflet")).default;
  (window as any).L = L;
  return L;
}

function createCommunityPostIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: "community-post-marker",
    html: '<span class="community-post-marker__glyph">投稿</span>',
    iconSize: [48, 30],
    iconAnchor: [24, 30],
    popupAnchor: [0, -30],
  });
}

function createCurrentLocationIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: "current-location-marker",
    html: '<span class="current-location-marker__pulse"></span><span class="current-location-marker__dot"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

export function PostMap({
  posts,
  adminPlaces = [],
  initialCenter = { lat: 35.681236, lng: 139.767125 },
  selectedPostId,
  onSelectPost,
  onLocationPick,
  onBoundsChange,
}: PostMapProps) {
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const adminMarkerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const currentLocationLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // fitBounds による moveend で再取得ループを防ぐ
  const suppressMoveendRef = useRef(false);
  // 初回表示時のみ fitBounds を呼び出す
  const hasFittedBoundsRef = useRef(false);
  const hasUserMovedMapRef = useRef(false);
  const hasAppliedInitialCenterRef = useRef("");
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
      }).setView([initialCenter.lat, initialCenter.lng], 14);
      hasAppliedInitialCenterRef.current = `${initialCenter.lat},${initialCenter.lng}`;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      adminMarkerLayerRef.current = L.layerGroup().addTo(map);
      currentLocationLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setIsReady(true);

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        onLocationPick?.({ lat, lng });
      });

      map.on("dragstart zoomstart", () => {
        hasUserMovedMapRef.current = true;
      });

      let boundsTimer: ReturnType<typeof setTimeout> | null = null;
      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChange?.({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLng: b.getWest(),
          maxLng: b.getEast(),
        });
      };

      map.on("moveend", () => {
        // fitBounds によるプログラム的移動はスキップ
        if (suppressMoveendRef.current) return;
        if (boundsTimer !== null) {
          clearTimeout(boundsTimer);
        }
        boundsTimer = setTimeout(() => {
          emitBounds();
          boundsTimer = null;
        }, 500);
      });

      // 初期ビューポートを通知（初回ロード用）
      emitBounds();
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      adminMarkerLayerRef.current = null;
      currentLocationLayerRef.current = null;
      markerMapRef.current.clear();
    };
  }, [onLocationPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || hasUserMovedMapRef.current) {
      return;
    }

    const centerKey = `${initialCenter.lat},${initialCenter.lng}`;
    if (hasAppliedInitialCenterRef.current === centerKey) {
      return;
    }

    hasAppliedInitialCenterRef.current = centerKey;
    suppressMoveendRef.current = true;
    map.setView([initialCenter.lat, initialCenter.lng], 14);
    map.once("moveend", () => {
      suppressMoveendRef.current = false;
      const b = map.getBounds();
      onBoundsChange?.({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      });
    });
  }, [initialCenter.lat, initialCenter.lng, isReady, onBoundsChange]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = currentLocationLayerRef.current;
    if (!map || !layer || !isReady) {
      return;
    }

    const L = (window as any).L as typeof Leaflet;
    layer.clearLayers();
    L.marker([initialCenter.lat, initialCenter.lng], {
      icon: createCurrentLocationIcon(L),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
  }, [initialCenter.lat, initialCenter.lng, isReady]);

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
    const postIcon = createCommunityPostIcon((window as any).L);

    normalizedPosts.forEach((post) => {
      const marker = (window as any).L.marker([post.lat, post.lng], {
        icon: postIcon,
      }).bindPopup(`
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

    // 初回のみ自動フィット（以降はユーザー操作に委ねる）
    if (
      !hasFittedBoundsRef.current &&
      !hasUserMovedMapRef.current &&
      hasAppliedInitialCenterRef.current === "35.681236,139.767125" &&
      allPoints.length > 0
    ) {
      hasFittedBoundsRef.current = true;
      suppressMoveendRef.current = true;
      const bounds = (window as any).L.latLngBounds(allPoints);
      map.fitBounds(bounds.pad(0.3));
      map.once("moveend", () => {
        suppressMoveendRef.current = false;
      });
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
