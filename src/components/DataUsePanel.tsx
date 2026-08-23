import { useMemo } from "react";
import type { AdminPlace, CommunityPost } from "../types";

type DataUsePanelProps = {
  posts: CommunityPost[];
  adminPlaces: AdminPlace[];
  seedCount: number;
  visibleSeedCount: number;
};

type NearbyPair = {
  post: CommunityPost;
  place: AdminPlace;
  distanceMeters: number;
};

function getPostTags(post: CommunityPost) {
  return post.humanTags ?? post.tags ?? [];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

function escapeCsvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildPostsCsv(posts: CommunityPost[]) {
  const rows = [
    [
      "id",
      "title",
      "summary",
      "lat",
      "lng",
      "tags",
      "contentLicense",
      "createdAt",
      "photoUrl",
    ],
    ...posts.map((post) => [
      post.id,
      post.title,
      post.summary,
      post.lat,
      post.lng,
      getPostTags(post).join("|"),
      post.contentLicense ?? "",
      post.createdAt,
      post.photoUrl,
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
}

function buildPostsGeoJson(posts: CommunityPost[]) {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: posts.map((post) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [post.lng, post.lat],
        },
        properties: {
          id: post.id,
          title: post.title,
          summary: post.summary,
          tags: getPostTags(post),
          aiTags: post.aiTags ?? [],
          contentLicense: post.contentLicense ?? "",
          createdAt: post.createdAt,
          photoUrl: post.photoUrl,
        },
      })),
    },
    null,
    2,
  );
}

export function DataUsePanel({
  posts,
  adminPlaces,
  seedCount,
  visibleSeedCount,
}: DataUsePanelProps) {
  const tagRanking = useMemo(() => {
    const tagCounts = new Map<string, number>();
    posts.forEach((post) => {
      getPostTags(post).forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });

    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"))
      .slice(0, 8);
  }, [posts]);

  const uniqueTagCount = useMemo(() => {
    const tags = new Set<string>();
    posts.forEach((post) => {
      getPostTags(post).forEach((tag) => tags.add(tag));
    });
    return tags.size;
  }, [posts]);

  const nearbyPairs = useMemo<NearbyPair[]>(() => {
    return posts
      .map((post) => {
        const nearestPlace = adminPlaces
          .map((place) => ({
            post,
            place,
            distanceMeters: getDistanceMeters(post, place),
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

        return nearestPlace;
      })
      .filter((pair): pair is NearbyPair => Boolean(pair))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 5);
  }, [adminPlaces, posts]);

  const ccByPostCount = posts.filter(
    (post) => post.contentLicense === "cc-by-4.0",
  ).length;

  const handleDownloadCsv = () => {
    downloadTextFile(
      "3m-community-posts.csv",
      buildPostsCsv(posts),
      "text/csv;charset=utf-8",
    );
  };

  const handleDownloadGeoJson = () => {
    downloadTextFile(
      "3m-community-posts.geojson",
      buildPostsGeoJson(posts),
      "application/geo+json;charset=utf-8",
    );
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Data use view
        </p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              集まった地域データを活用する
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              市民投稿と行政オープンデータを重ね、地域の魅力や関心の偏りを見える化します。
              投稿データはCSV / GeoJSONとして出力でき、まちづくり・観光・地域PRの素材として再利用できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={posts.length === 0}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              CSVをダウンロード
            </button>
            <button
              type="button"
              onClick={handleDownloadGeoJson}
              disabled={posts.length === 0}
              className="rounded-full border border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
            >
              GeoJSONをダウンロード
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold text-slate-500">市民投稿</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {posts.length.toLocaleString("ja-JP")}件
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            地域の気づきとして蓄積された投稿数です。
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold text-slate-500">
            行政オープンデータ
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {visibleSeedCount.toLocaleString("ja-JP")}件
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            全{seedCount.toLocaleString("ja-JP")}件のうち、現在表示中の件数です。
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold text-slate-500">公開再利用向け</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {ccByPostCount.toLocaleString("ja-JP")}件
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            CC BY 4.0として扱える市民投稿です。
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold text-slate-500">タグ種類</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {uniqueTagCount.toLocaleString("ja-JP")}種
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            市民が見つけた魅力の切り口です。
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900">
            人気タグランキング
          </h3>
          {tagRanking.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {tagRanking.map((item, index) => (
                <li key={item.tag} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                    #{item.tag}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    {item.count}件
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              まだタグ付き投稿がありません。投稿が増えると、地域の魅力の傾向が見えてきます。
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900">
            行政データと近い市民投稿
          </h3>
          {nearbyPairs.length > 0 ? (
            <div className="mt-4 space-y-3">
              {nearbyPairs.map((pair) => (
                <div
                  key={`${pair.post.id}-${pair.place.id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {pair.post.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        近くの行政データ：{pair.place.name}（{pair.place.category}）
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-2.5 py-1 text-xs font-bold text-primary">
                      約{Math.round(pair.distanceMeters).toLocaleString("ja-JP")}m
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              市民投稿と行政データがそろうと、周辺資源との関係を確認できます。
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
        <h3 className="font-bold">デモで伝えられること</h3>
        <p className="mt-2">
          この画面は、投稿を集めるだけでなく、地域の魅力データとして分析・共有・再利用できることを示します。
          行政オープンデータと市民投稿を重ねることで、観光ルートづくり、地域資源の発見、施策検討のための一次情報として活用できます。
        </p>
      </div>
    </section>
  );
}
