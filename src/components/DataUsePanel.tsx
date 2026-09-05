import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPlaces,
  fetchPosts,
  fetchRegionalInsight,
} from "../lib/api";
import {
  isUrbanExperienceTag,
  splitUrbanExperienceTags,
} from "../lib/urbanExperienceTags";
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

type GapCandidate =
  | {
      type: "admin_without_posts";
      place: AdminPlace;
      nearestPost?: CommunityPost;
      distanceMeters?: number;
    }
  | {
      type: "post_without_admin";
      post: CommunityPost;
      nearestPlace?: AdminPlace;
      distanceMeters?: number;
    };

type InsightScope = "visible" | "all";
type InsightLens = "policy" | "tourism" | "community";

const insightLensOptions: {
  value: InsightLens;
  label: string;
  description: string;
}[] = [
  {
    value: "policy",
    label: "自治体施策",
    description: "公共空間や行政データとのギャップを読む",
  },
  {
    value: "tourism",
    label: "観光・地域PR",
    description: "回遊や地域資源としての魅力を読む",
  },
  {
    value: "community",
    label: "市民活動",
    description: "住民参加や次に集めたい声を読む",
  },
];

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
  const [insightLens, setInsightLens] = useState<InsightLens>("policy");
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
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  const urbanExperienceTagCount = useMemo(() => {
    const tags = new Set<string>();
    activePosts.forEach((post) => {
      getPostTags(post).forEach((tag) => {
        if (isUrbanExperienceTag(tag)) {
          tags.add(tag);
        }
      });
    });
    return tags.size;
  }, [activePosts]);

  const urbanExperienceTaggedPostCount = activePosts.filter((post) => {
    const { standardTags } = splitUrbanExperienceTags(getPostTags(post));
    return standardTags.length > 0;
  }).length;

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

  const gapCandidates = useMemo<GapCandidate[]>(() => {
    const adminWithoutPosts = activeAdminPlaces
      .map((place) => {
        const nearestPost = activePosts
          .map((post) => ({
            post,
            distanceMeters: getDistanceMeters(place, post),
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

        return {
          type: "admin_without_posts" as const,
          place,
          nearestPost: nearestPost?.post,
          distanceMeters: nearestPost?.distanceMeters,
        };
      })
      .filter(
        (candidate) =>
          candidate.distanceMeters == null || candidate.distanceMeters > 200,
      )
      .sort(
        (a, b) =>
          (b.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
          (a.distanceMeters ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 3);

    const postsWithoutAdmin = activePosts
      .map((post) => {
        const nearestPlace = activeAdminPlaces
          .map((place) => ({
            place,
            distanceMeters: getDistanceMeters(post, place),
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

        return {
          type: "post_without_admin" as const,
          post,
          nearestPlace: nearestPlace?.place,
          distanceMeters: nearestPlace?.distanceMeters,
        };
      })
      .filter(
        (candidate) =>
          candidate.distanceMeters == null || candidate.distanceMeters > 200,
      )
      .sort(
        (a, b) =>
          (b.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
          (a.distanceMeters ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 3);

    return [...adminWithoutPosts, ...postsWithoutAdmin];
  }, [activeAdminPlaces, activePosts]);

  const adminGapCount = gapCandidates.filter(
    (candidate) => candidate.type === "admin_without_posts",
  ).length;
  const civicDiscoveryCount = gapCandidates.filter(
    (candidate) => candidate.type === "post_without_admin",
  ).length;
  const regionalInsightGapCandidates = gapCandidates.map((candidate) => {
    const isAdminGap = candidate.type === "admin_without_posts";
    const title = isAdminGap ? candidate.place.name : candidate.post.title;
    const description = isAdminGap
      ? `行政データ「${candidate.place.category}」はあるが、近い市民投稿が少ない候補`
      : "市民投稿はあるが、近い行政オープンデータが少ない候補";

    return {
      type: candidate.type,
      title,
      description,
      distanceMeters: candidate.distanceMeters,
    };
  });

  const ccByPostCount = activePosts.filter(
    (post) => post.contentLicense === "cc-by-4.0",
  ).length;
  const ccByRate =
    activePosts.length > 0 ? Math.round((ccByPostCount / activePosts.length) * 100) : 0;
  const topTagSummary =
    tagRanking.length > 0
      ? tagRanking
          .slice(0, 3)
          .map((item) => `#${item.tag}`)
          .join("、")
      : "タグ未蓄積";
  const nearestDistanceSummary =
    nearbyPairs.length > 0
      ? `最短 約${Math.round(nearbyPairs[0].distanceMeters).toLocaleString("ja-JP")}m`
      : "近接関係なし";
  const dataReadinessChecks = [
    {
      label: "市民投稿",
      ok: activePosts.length >= 5,
      message:
        activePosts.length >= 5
          ? "分析に使える投稿が集まり始めています"
          : "まずは5件以上の投稿があると傾向を読みやすくなります",
    },
    {
      label: "タグ",
      ok: uniqueTagCount >= 3,
      message:
        uniqueTagCount >= 3
          ? "複数の切り口で地域を比較できます"
          : "タグの種類が増えると、魅力や課題の違いが見えやすくなります",
    },
    {
      label: "都市体験タグ",
      ok:
        activePosts.length > 0 &&
        urbanExperienceTaggedPostCount >= Math.min(activePosts.length, 3),
      message:
        activePosts.length > 0 &&
        urbanExperienceTaggedPostCount >= Math.min(activePosts.length, 3)
          ? "分析しやすい標準タグが投稿に付いています"
          : "都市体験タグが増えると、地域比較やギャップ分析に使いやすくなります",
    },
    {
      label: "行政データ",
      ok: activeVisibleSeedCount > 0,
      message:
        activeVisibleSeedCount > 0
          ? "行政データとの比較ができます"
          : "行政データがない範囲では、市民投稿中心の分析になります",
    },
    {
      label: "近接関係",
      ok: nearbyPairs.length > 0,
      message:
        nearbyPairs.length > 0
          ? "市民投稿と行政データの近さを説明できます"
          : "市民投稿と行政データが近い場所にあると、ギャップ分析がしやすくなります",
    },
    {
      label: "再利用性",
      ok: activePosts.length > 0 && ccByRate >= 50,
      message:
        activePosts.length > 0 && ccByRate >= 50
          ? "再利用しやすい投稿が多い状態です"
          : "CC BY 4.0同意の投稿が増えると、外部活用しやすくなります",
    },
  ];
  const dataReadinessScore = Math.round(
    (dataReadinessChecks.filter((check) => check.ok).length /
      dataReadinessChecks.length) *
      100,
  );
  const dataReadinessLabel =
    dataReadinessScore >= 80
      ? "活用しやすい"
      : dataReadinessScore >= 50
        ? "育成中"
        : "収集中";

  useEffect(() => {
    setRegionalInsight(null);
    setInsightError(null);
    setCopyMessage(null);
  }, [
    activeScopeLabel,
    insightLens,
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
        lens: insightLens,
        posts: activePosts,
        adminPlaces: activeAdminPlaces,
        seedCount: activeSeedCount,
        visibleSeedCount: activeVisibleSeedCount,
        tagRanking,
        ccByPostCount,
        gapCandidates: regionalInsightGapCandidates,
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

  const buildRegionalInsightReport = (insight: RegionalInsight) => {
    const lensLabel =
      insightLensOptions.find((option) => option.value === insight.lens)
        ?.label ?? "自治体施策";

    return [
      "# 3M Platform AI地域インサイト",
      "",
      `- 分析範囲: ${activeScopeLabel}`,
      `- 分析視点: ${lensLabel}`,
      `- 市民投稿: ${activePosts.length.toLocaleString("ja-JP")}件`,
      `- 行政オープンデータ: ${activeVisibleSeedCount.toLocaleString("ja-JP")}件`,
      `- 上位タグ: ${topTagSummary}`,
      `- 都市体験タグ: ${urbanExperienceTagCount}種 / ${urbanExperienceTaggedPostCount}投稿`,
      `- CC BY率: ${ccByRate}%`,
      `- 行政データとの近さ: ${nearestDistanceSummary}`,
      `- ギャップ候補: 行政データ側 ${adminGapCount}件 / 市民発見側 ${civicDiscoveryCount}件`,
      `- データ充実度: ${dataReadinessScore}%（${dataReadinessLabel}）`,
      `- 生成方式: ${insight.source === "ai" ? "Workers AI" : "簡易インサイト"}`,
      "",
      "## この地域の特徴",
      insight.overview,
      "",
      "## 市民投稿から見える魅力",
      insight.civicSignals,
      "",
      "## 行政データとのギャップ",
      insight.adminGap,
      "",
      "## 活用・改善のヒント",
      insight.actionHint,
      "",
      "## 次に集めたい投稿テーマ",
      insight.collectionTheme,
      "",
      "## データ品質・再利用性メモ",
      insight.dataQualityNote,
      "",
      "## ギャップ候補",
      regionalInsightGapCandidates.length > 0
        ? regionalInsightGapCandidates
            .map((candidate) => {
              const distanceText =
                candidate.distanceMeters == null
                  ? "比較対象なし"
                  : `約${Math.round(candidate.distanceMeters).toLocaleString("ja-JP")}m`;
              return `- ${candidate.title}: ${candidate.description}（${distanceText}）`;
            })
            .join("\n")
        : "目立つギャップ候補はありません。",
      "",
      "## 注意",
      insight.caveat,
    ].join("\n");
  };

  const handleCopyRegionalInsight = async () => {
    if (!regionalInsight) {
      return;
    }

    const report = buildRegionalInsightReport(regionalInsight);

    try {
      await navigator.clipboard.writeText(report);
      setCopyMessage("AI地域インサイトをコピーしました。");
    } catch {
      setCopyMessage(
        "コピーできませんでした。ブラウザの権限設定を確認してください。",
      );
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
            うち都市体験タグは{urbanExperienceTagCount.toLocaleString("ja-JP")}種です。
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
              Data readiness
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              AI分析に向けたデータ充実度
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              AI地域インサイトの前提になる投稿数・タグ・行政データとの関係・再利用性を確認します。
            </p>
          </div>
          <div className="rounded-2xl bg-sky-50 px-5 py-4 text-center">
            <p className="text-xs font-bold text-sky-700">
              {dataReadinessLabel}
            </p>
            <p className="mt-1 text-3xl font-black text-slate-900">
              {dataReadinessScore}%
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {dataReadinessChecks.map((check) => (
            <div
              key={check.label}
              className={`rounded-2xl border p-3 ${
                check.ok
                  ? "border-sky-100 bg-sky-50/70"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    check.ok
                      ? "bg-sky-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {check.ok ? "✓" : "!"}
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {check.label}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {check.message}
              </p>
            </div>
          ))}
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
              {activeScopeLabel}の市民投稿・行政オープンデータ・タグ傾向・ギャップ候補をもとに、地域の特徴や活用ヒントを短く整理します。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
            <button
              type="button"
              onClick={handleGenerateRegionalInsight}
              disabled={isGeneratingInsight || isLoadingAllData}
              className="w-full rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
            >
              {isGeneratingInsight ? "AI分析中..." : "AIで地域を読み解く"}
            </button>
            {regionalInsight ? (
              <button
                type="button"
                onClick={handleCopyRegionalInsight}
                className="w-full rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50 md:w-auto"
              >
                インサイトをコピー
              </button>
            ) : null}
          </div>
        </div>

        {insightError ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {insightError}
          </p>
        ) : null}

        {copyMessage ? (
          <p className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            {copyMessage}
          </p>
        ) : null}

        <div className="mt-5 rounded-2xl bg-slate-50 p-2">
          <p className="px-2 py-1 text-xs font-bold text-slate-500">
            AIの分析視点
          </p>
          <div className="mt-1 grid gap-2 md:grid-cols-3">
            {insightLensOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInsightLens(option.value)}
                className={`rounded-xl px-3 py-3 text-left transition ${
                  insightLens === option.value
                    ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-200"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs leading-5">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {regionalInsight ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
              <p className="text-xs font-bold text-violet-700">
                AIが参照した集計サマリー
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["分析範囲", activeScopeLabel],
                  [
                    "分析視点",
                    insightLensOptions.find(
                      (option) => option.value === regionalInsight.lens,
                    )?.label ?? "自治体施策",
                  ],
                  [
                    "投稿 / 行政データ",
                    `${activePosts.length.toLocaleString("ja-JP")}件 / ${activeVisibleSeedCount.toLocaleString("ja-JP")}件`,
                  ],
                  ["上位タグ", topTagSummary],
                  [
                    "都市体験タグ",
                    `${urbanExperienceTagCount.toLocaleString("ja-JP")}種 / ${urbanExperienceTaggedPostCount.toLocaleString("ja-JP")}投稿`,
                  ],
                  ["CC BY率", `${ccByRate}%`],
                  ["行政データとの近さ", nearestDistanceSummary],
                [
                  "データ充実度",
                  `${dataReadinessScore}%（${dataReadinessLabel}）`,
                ],
                  [
                    "ギャップ候補",
                    `${adminGapCount + civicDiscoveryCount}件`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/70 bg-white px-3 py-2"
                  >
                    <p className="text-[11px] font-semibold text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-800">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
            {[
              ["この地域の特徴", regionalInsight.overview],
              ["市民投稿から見える魅力", regionalInsight.civicSignals],
              ["行政データとのギャップ", regionalInsight.adminGap],
              ["活用・改善のヒント", regionalInsight.actionHint],
              ["次に集めたい投稿テーマ", regionalInsight.collectionTheme],
              ["データ品質・再利用性メモ", regionalInsight.dataQualityNote],
            ].map(([label, text]) => (
              <div
                key={label}
                className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"
              >
                <p className="text-xs font-bold text-violet-700">{label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
              </div>
            ))}
            </div>

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

      <div className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm shadow-indigo-100/70">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          AI operations
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          AI活用の運用設計
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          公共性のある市民投稿データとして扱えるよう、AIの自動判断だけに寄せず、監査・失敗時の継続・人の確認を前提にしています。
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            [
              "Workers AI",
              "画像確認、タグ候補、地域インサイト生成をWorker内で実行します。",
            ],
            [
              "AI Gateway対応",
              "環境変数を設定すると、AI呼び出しをGateway経由にできます。",
            ],
            [
              "フォールバック",
              "AI地域インサイトが失敗しても、簡易インサイトで画面を継続します。",
            ],
            [
              "人の確認",
              "公開可否や最終タグは、AI候補を見た投稿者が判断します。",
            ],
          ].map(([label, description]) => (
            <div
              key={label}
              className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"
            >
              <p className="text-sm font-bold text-indigo-800">{label}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm shadow-amber-100/70">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
              Gap candidates
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              行政データと市民投稿のギャップ候補
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              200m以内に対応する相手側データが少ない場所を、追加調査や投稿収集の候補として表示します。
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              行政側 {adminGapCount}件
            </span>
            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
              市民発見側 {civicDiscoveryCount}件
            </span>
          </div>
        </div>

        {gapCandidates.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {gapCandidates.map((candidate) => {
              const isAdminGap = candidate.type === "admin_without_posts";
              const title = isAdminGap
                ? candidate.place.name
                : candidate.post.title;
              const description = isAdminGap
                ? `行政データ「${candidate.place.category}」はありますが、近い市民投稿がまだ薄い候補です。`
                : "市民投稿はありますが、近い行政オープンデータが少ない候補です。";
              const distanceText =
                candidate.distanceMeters == null
                  ? "比較対象なし"
                  : `最寄りまで約${Math.round(candidate.distanceMeters).toLocaleString("ja-JP")}m`;

              return (
                <div
                  key={`${candidate.type}-${isAdminGap ? candidate.place.id : candidate.post.id}`}
                  className={`rounded-2xl border p-4 ${
                    isAdminGap
                      ? "border-amber-100 bg-amber-50/60"
                      : "border-orange-100 bg-orange-50/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-500">
                        {isAdminGap
                          ? "行政データ側の空白"
                          : "市民発見側の空白"}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-900">
                        {title}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                      {distanceText}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    {description}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            現在の集計範囲では、目立つギャップ候補は見つかりませんでした。表示範囲を変えるか、投稿が増えると候補が出やすくなります。
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
                    {isUrbanExperienceTag(item.tag) ? (
                      <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        都市体験
                      </span>
                    ) : null}
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
