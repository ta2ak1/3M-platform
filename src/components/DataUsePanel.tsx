import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPlaces,
  fetchPosts,
  fetchRegionalInsight,
} from "../lib/api";
import type { AdminPlace, CommunityPost, RegionalInsight } from "../types";

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

type InsightScope = "visible" | "all";

const ALL_DATA_LIMIT = 10000;
const ALL_POST_LIMIT = 1000;

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
  const [scope, setScope] = useState<InsightScope>("visible");
  const [allPosts, setAllPosts] = useState<CommunityPost[] | null>(null);
  const [allAdminPlaces, setAllAdminPlaces] = useState<AdminPlace[] | null>(
    null,
  );
  const [allSeedCount, setAllSeedCount] = useState<number | null>(null);
  const [isLoadingAllData, setIsLoadingAllData] = useState(false);
  const [allDataError, setAllDataError] = useState<string | null>(null);
  const [regionalInsight, setRegionalInsight] =
    useState<RegionalInsight | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    if (
      scope !== "all" ||
      (allPosts != null && allAdminPlaces != null) ||
      isLoadingAllData
    ) {
      return;
    }

    let cancelled = false;

    const loadAllData = async () => {
      setIsLoadingAllData(true);
      setAllDataError(null);

      try {
        const [nextPosts, nextAdminPlacesResponse] = await Promise.all([
          fetchPosts(undefined, { limit: ALL_POST_LIMIT }),
          fetchAdminPlaces(undefined, { limit: ALL_DATA_LIMIT }),
        ]);

        if (cancelled) {
          return;
        }

        setAllPosts(nextPosts);
        setAllAdminPlaces(nextAdminPlacesResponse.places);
        setAllSeedCount(nextAdminPlacesResponse.count);
      } catch {
        if (!cancelled) {
          setAllDataError(
            "全件データの取得に失敗しました。表示範囲のデータで確認してください。",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAllData(false);
        }
      }
    };

    void loadAllData();

    return () => {
      cancelled = true;
    };
  }, [allAdminPlaces, allPosts, isLoadingAllData, scope]);

  const hasAllData = allPosts != null && allAdminPlaces != null;
  const usesAllData = scope === "all" && hasAllData;
  const activePosts = usesAllData ? allPosts : posts;
  const activeAdminPlaces = usesAllData ? allAdminPlaces : adminPlaces;
  const activeSeedCount = usesAllData ? (allSeedCount ?? seedCount) : seedCount;
  const activeVisibleSeedCount =
    usesAllData ? allAdminPlaces.length : visibleSeedCount;
  const activeScopeLabel = usesAllData ? "全件データ" : "表示範囲";

  const tagRanking = useMemo(() => {
    const tagCounts = new Map<string, number>();
    activePosts.forEach((post) => {
      getPostTags(post).forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });

    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"))
      .slice(0, 8);
  }, [activePosts]);

  const uniqueTagCount = useMemo(() => {
    const tags = new Set<string>();
    activePosts.forEach((post) => {
      getPostTags(post).forEach((tag) => tags.add(tag));
    });
    return tags.size;
  }, [activePosts]);

  const nearbyPairs = useMemo<NearbyPair[]>(() => {
    return activePosts
      .map((post) => {
        const nearestPlace = activeAdminPlaces
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
  }, [activeAdminPlaces, activePosts]);

  const ccByPostCount = activePosts.filter(
    (post) => post.contentLicense === "cc-by-4.0",
  ).length;

  useEffect(() => {
    setRegionalInsight(null);
    setInsightError(null);
  }, [
    activeScopeLabel,
    activePosts.length,
    activeAdminPlaces.length,
    tagRanking.map((item) => `${item.tag}:${item.count}`).join("|"),
  ]);

  const handleGenerateRegionalInsight = async () => {
    setIsGeneratingInsight(true);
    setInsightError(null);

    try {
      const insight = await fetchRegionalInsight({
        scope: usesAllData ? "all" : "visible",
        posts: activePosts,
        adminPlaces: activeAdminPlaces,
        seedCount: activeSeedCount,
        visibleSeedCount: activeVisibleSeedCount,
        tagRanking,
        ccByPostCount,
      });
      setRegionalInsight(insight);
    } catch {
      setInsightError(
        "AI地域インサイトの生成に失敗しました。少し時間を置いて再度お試しください。",
      );
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const handleDownloadCsv = () => {
    downloadTextFile(
      "3m-community-posts.csv",
      buildPostsCsv(activePosts),
      "text/csv;charset=utf-8",
    );
  };

  const handleDownloadGeoJson = () => {
    downloadTextFile(
      "3m-community-posts.geojson",
      buildPostsGeoJson(activePosts),
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
              disabled={activePosts.length === 0}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              CSVをダウンロード
            </button>
            <button
              type="button"
              onClick={handleDownloadGeoJson}
              disabled={activePosts.length === 0}
              className="rounded-full border border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
            >
              GeoJSONをダウンロード
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setScope("visible")}
              className={`rounded-xl px-4 py-3 text-left transition ${
                scope === "visible"
                  ? "bg-white text-primary shadow-sm"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              <span className="block text-sm font-bold">表示範囲で集計</span>
              <span className="mt-1 block text-xs">
                いま地図で読み込んでいる範囲を見る
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`rounded-xl px-4 py-3 text-left transition ${
                scope === "all"
                  ? "bg-white text-primary shadow-sm"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              <span className="block text-sm font-bold">全件データで集計</span>
              <span className="mt-1 block text-xs">
                投稿と行政データを全体傾向として見る
              </span>
            </button>
          </div>
          {isLoadingAllData ? (
            <p className="mt-2 px-2 text-xs text-slate-500">
              全件データを読み込んでいます…
            </p>
          ) : null}
          {allDataError ? (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {allDataError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
          <p className="text-sm font-semibold text-slate-500">
            市民投稿（{activeScopeLabel}）
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {activePosts.length.toLocaleString("ja-JP")}件
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
            {activeVisibleSeedCount.toLocaleString("ja-JP")}件
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            全{activeSeedCount.toLocaleString("ja-JP")}件のうち、集計対象の件数です。
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

      <div className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm shadow-violet-100/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
              AI regional insight
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              AI地域インサイト
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {activeScopeLabel}の市民投稿・行政オープンデータ・タグ傾向をもとに、地域の特徴やギャップ、活用ヒントを短く整理します。
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateRegionalInsight}
            disabled={isGeneratingInsight || isLoadingAllData}
            className="w-full rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
          >
            {isGeneratingInsight ? "AI分析中..." : "AIで地域を読み解く"}
          </button>
        </div>

        {insightError ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {insightError}
          </p>
        ) : null}

        {regionalInsight ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["この地域の特徴", regionalInsight.overview],
              ["市民投稿から見える魅力", regionalInsight.civicSignals],
              ["行政データとのギャップ", regionalInsight.adminGap],
              ["活用・改善のヒント", regionalInsight.actionHint],
            ].map(([label, text]) => (
              <div
                key={label}
                className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"
              >
                <p className="text-xs font-bold text-violet-700">{label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <p className="text-sm leading-6 text-slate-600">
                  {regionalInsight.caveat}
                </p>
                <span className="w-fit shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {regionalInsight.source === "ai"
                    ? "Workers AI生成"
                    : "簡易インサイト"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">
            デモでは、投稿が少ない状態でも「どのデータをもとに何が言えるか」をAIが慎重に整理する様子を見せられます。
          </p>
        )}
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
