import type * as Leaflet from "leaflet";
import type React from "react";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { CommunityPost } from "../types";

interface MapComponentProps {
  className?: string;
  posts: CommunityPost[];
  selectedPostId?: string | null;
  onSelectPost?: (post: CommunityPost | null) => void;
  onLocationPick?: (location: { lat: number; lng: number }) => void;
}

interface useMapProps {
  posts: CommunityPost[];
  selectedPostId?: string | null;
  onSelectPost?: (post: CommunityPost | null) => void;
  onLocationPick?: (location: { lat: number; lng: number }) => void;
}

async function loadLeaflet(): Promise<typeof Leaflet> {
  // leafletパッケージを動的インポート
  const L = (await import("leaflet")).default;

  // プラグインを使う場合はグローバルスコープ上の`L`にLeafletの中身を代入
  (window as any).L = L;

  return L;
}

function useMap({
  // posts,
  // selectedPostId,
  // onSelectPost,
  onLocationPick,
}: useMapProps) {
  const mapRef = useRef<Leaflet.Map | null>(null);
  // const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  // const markerMapRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  // const [isReady, setIsReady] = useState(false);
  // const normalizedPosts = useMemo(
  //   () =>
  //     posts.filter(
  //       (post) => Number.isFinite(post.lat) && Number.isFinite(post.lng),
  //     ),
  //   [posts],
  // );

  // リサイズ監視処理
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) {
        return;
      }

      mapRef.current?.invalidateSize();
    });

    if (mapElementRef.current) {
      resizeObserver.observe(mapElementRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Leaflet初期化処理
  useEffect(() => {
    const container = mapElementRef.current;
    if (!container || mapRef.current) {
      return;
    }

    (async () => {
      // Leafletパッケージを読み込む
      const L = await loadLeaflet();

      // Mapオブジェクトが存在するときは処理を打ち切る
      if (mapRef.current) {
        return;
      }

      // 地図をdiv要素にバインディングして初期化
      const map = L.map(container);
      mapRef.current = map;
      // setIsReady(true);

      // 東京駅の位置を地図の中心に表示させる
      map.setView([35.681236, 139.767125], 15);

      // 地図の画像ソースを設定
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        onLocationPick?.({ lat, lng });
      });
    })();

    return () => {
      if (mapRef.current) {
        // クリーンアップ時はMapオブジェクトの開放を忘れない
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // useEffect(() => {
  //   const map = mapRef.current;
  //   const layer = markerLayerRef.current;
  //   if (!map || !layer) {
  //     return;
  //   }

  //   const nextMarkers = new Map<string, Leaflet.Marker>();
  //   layer.clearLayers();

  //   normalizedPosts.forEach((post) => {
  //     const marker = (window as any).L.marker([post.lat, post.lng]).bindPopup(`
  //           <div style="min-width:180px; max-width:220px;">
  //             <strong>${post.title}</strong>
  //             <div style="margin:8px 0;">${post.summary}</div>
  //             <img src="${post.photoUrl}" alt="${post.title}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;" />
  //           </div>
  //         `);

  //     marker.on("click", () => {
  //       onSelectPost?.(post);
  //     });

  //     marker.addTo(layer);
  //     nextMarkers.set(post.id, marker);
  //   });

  //   markerMapRef.current = nextMarkers;

  //   if (normalizedPosts.length > 0) {
  //     const bounds = (window as any).L.latLngBounds(
  //       normalizedPosts.map((post) => [post.lat, post.lng]),
  //     );
  //     map.fitBounds(bounds.pad(0.3));
  //   }
  // }, [normalizedPosts, onSelectPost]);

  // useEffect(() => {
  //   if (!selectedPostId) {
  //     return;
  //   }

  //   const marker = markerMapRef.current.get(selectedPostId);
  //   if (!marker) {
  //     return;
  //   }

  //   marker.openPopup();
  // }, [selectedPostId]);

  return { mapElementRef };
}

export function MapComponent({
  className,
  posts,
  selectedPostId,
  onSelectPost,
  onLocationPick,
}: MapComponentProps): React.JSX.Element {
  const { mapElementRef } = useMap({
    posts,
    selectedPostId,
    onSelectPost,
    onLocationPick,
  });

  return <div ref={mapElementRef} className={className}></div>;
}
