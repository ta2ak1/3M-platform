import { useEffect, useMemo, useState } from "react";
import {
  fetchAiAnalysisLogs,
  fetchRegionalInsight,
} from "../lib/api";
import {
  isUrbanExperienceTag,
  splitUrbanExperienceTags,
  urbanExperienceTags,
} from "../lib/urbanExperienceTags";
import type {
  AdminPlace,
  AiAnalysisLog,
  CommunityPost,
  RegionalInsight,
} from "../types";

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

type InsightLens = "policy" | "tourism" | "community";
type DataUseMode = "explore" | "analyze";

type CollectionCampaignSuggestion = {
  id: string;
  title: string;
  reason: string;
  ask: string;
  expectedUse: string;
  priority: "高" | "中" | "育成";
  tone: string;
};

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

const useCaseStories: {
  value: InsightLens;
  eyebrow: string;
  title: string;
  scenario: string;
  outputs: string[];
  nextStep: string;
  tone: string;
}[] = [
  {
    value: "policy",
    eyebrow: "自治体・まちづくり",
    title: "市民の実感と行政データの空白を探す",
    scenario:
      "公園・緑地・歩行空間などの行政オープンデータに、市民が見つけた魅力や困りごとを重ねて、追加調査や施策検討の入口にします。",
    outputs: ["ギャップ候補", "データ充実度", "施策検討メモ"],
    nextStep: "ギャップ候補を現地確認リストにする",
    tone: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
  },
  {
    value: "tourism",
    eyebrow: "観光・地域PR",
    title: "まち歩きで紹介しやすい地域資源を見つける",
    scenario:
      "写真付き投稿や都市体験タグから、回遊ルート、休憩スポット、季節感のある場所など、地域PRに使える素材を整理します。",
    outputs: ["人気タグ", "近接スポット", "PR素材候補"],
    nextStep: "CSV/GeoJSONを地域紹介マップに使う",
    tone: "border-orange-200 bg-orange-50/70 text-orange-800",
  },
  {
    value: "community",
    eyebrow: "市民活動・地域団体",
    title: "次に集める声と投稿テーマを決める",
    scenario:
      "投稿が多いテーマ・少ないテーマを見ながら、地域イベントやワークショップで呼びかける投稿テーマを具体化します。",
    outputs: ["収集テーマ", "不足データ", "参加の呼びかけ"],
    nextStep: "次回の投稿キャンペーンのテーマにする",
    tone: "border-sky-200 bg-sky-50/70 text-sky-800",
  },
];

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

function buildMarkdownList(items: string[]) {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join("\n")
    : "- まだ十分な材料がありません。";
}

function formatLogDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ja-JP");
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
  const [dataUseMode, setDataUseMode] = useState<DataUseMode>("explore");
  const [exploreQuery, setExploreQuery] = useState("");
  const [insightLens, setInsightLens] = useState<InsightLens>("policy");
  const [regionalInsight, setRegionalInsight] =
    useState<RegionalInsight | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showDataUseReport, setShowDataUseReport] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<AiAnalysisLog[]>([]);
  const [isLoadingAnalysisLogs, setIsLoadingAnalysisLogs] = useState(false);
  const [analysisLogError, setAnalysisLogError] = useState<string | null>(null);

  const loadAnalysisLogs = async () => {
    setIsLoadingAnalysisLogs(true);
    setAnalysisLogError(null);

    try {
      const logs = await fetchAiAnalysisLogs({ limit: 5 });
      setAnalysisLogs(logs);
    } catch {
      setAnalysisLogError("AI分析ログの取得に失敗しました。");
    } finally {
      setIsLoadingAnalysisLogs(false);
    }
  };

  useEffect(() => {
    void loadAnalysisLogs();
  }, []);

  const activePosts = posts;
  const activeAdminPlaces = adminPlaces;
  const activeSeedCount = seedCount;
  const activeVisibleSeedCount = visibleSeedCount;
  const activeScopeLabel = "現在の表示範囲";

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

  const suggestedExploreKeywords = useMemo(() => {
    const keywords = [
      ...tagRanking.map((item) => item.tag),
      "休憩",
      "歩きやすい",
      "静か",
      "景色",
    ];
    return [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
      .slice(0, 8);
  }, [tagRanking]);

  const exploreResults = useMemo(() => {
    const terms = normalizeSearchText(exploreQuery)
      .split(/\s+/)
      .filter(Boolean);

    const postsWithScore = activePosts.map((post) => {
      const tags = getPostTags(post);
      const title = normalizeSearchText(post.title);
      const summary = normalizeSearchText(post.summary);
      const tagText = normalizeSearchText(tags.join(" "));
      const searchText = `${title} ${summary} ${tagText}`;
      const score =
        terms.length === 0
          ? 1
          : terms.reduce((total, term) => {
              if (!searchText.includes(term)) {
                return total;
              }

              const titleScore = title.includes(term) ? 3 : 0;
              const summaryScore = summary.includes(term) ? 2 : 0;
              const tagScore = tagText.includes(term) ? 4 : 0;
              return total + titleScore + summaryScore + tagScore;
            }, 0);

      return { post, score };
    });

    return postsWithScore
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score;
        }

        return (
          new Date(b.post.createdAt).getTime() -
          new Date(a.post.createdAt).getTime()
        );
      })
      .slice(0, 8)
      .map((item) => item.post);
  }, [activePosts, exploreQuery]);

  const exploreRelatedTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    exploreResults.forEach((post) => {
      getPostTags(post).forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });

    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"))
      .slice(0, 6);
  }, [exploreResults]);

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
  const selectedUseCaseStory =
    useCaseStories.find((story) => story.value === insightLens) ??
    useCaseStories[0];
  const collectionCampaignSuggestions = useMemo<CollectionCampaignSuggestion[]>(
    () => {
      const suggestions: CollectionCampaignSuggestion[] = [];
      const urbanTagCounts = new Map<string, number>();
      activePosts.forEach((post) => {
        getPostTags(post).forEach((tag) => {
          if (isUrbanExperienceTag(tag)) {
            urbanTagCounts.set(tag, (urbanTagCounts.get(tag) ?? 0) + 1);
          }
        });
      });
      const missingUrbanTags = urbanExperienceTags
        .filter((tag) => !urbanTagCounts.has(tag))
        .slice(0, 4);
      const topGapCandidate = gapCandidates[0];

      if (topGapCandidate) {
        const isAdminGap = topGapCandidate.type === "admin_without_posts";
        const title = isAdminGap
          ? topGapCandidate.place.name
          : topGapCandidate.post.title;
        const distanceText =
          topGapCandidate.distanceMeters == null
            ? "比較対象がまだありません"
            : `最寄りの相手側データまで約${Math.round(topGapCandidate.distanceMeters).toLocaleString("ja-JP")}m`;

        suggestions.push({
          id: "gap-campaign",
          title: `${title}周辺の現地投稿を集める`,
          reason: isAdminGap
            ? `行政オープンデータはありますが、近い市民投稿がまだ薄い候補です。${distanceText}。`
            : `市民投稿はありますが、対応する行政オープンデータが少ない候補です。${distanceText}。`,
          ask: "写真、短いコメント、歩きやすさ・休憩しやすさなどの都市体験タグを添えて投稿してもらう。",
          expectedUse:
            "行政データと市民の実感の重なりや空白を、現地確認リストとして使えます。",
          priority: "高",
          tone: "border-amber-200 bg-amber-50 text-amber-800",
        });
      }

      if (missingUrbanTags.length > 0) {
        suggestions.push({
          id: "urban-tags-campaign",
          title: "未収集の都市体験タグを集める",
          reason: `この範囲では ${missingUrbanTags.map((tag) => `#${tag}`).join("、")} などの観点がまだ薄いです。`,
          ask: "日常の移動、休憩、安心感、案内の分かりやすさなど、体験ベースの気づきを投稿してもらう。",
          expectedUse:
            "地域比較やバリアフリー、観光回遊、公共空間改善の切り口が増えます。",
          priority: activePosts.length >= 5 ? "中" : "高",
          tone: "border-violet-200 bg-violet-50 text-violet-800",
        });
      }

      if (activePosts.length < 5) {
        suggestions.push({
          id: "starter-campaign",
          title: "まずは5件の写真付き投稿を集める",
          reason:
            "投稿数が少ないため、AI地域インサイトやタグ傾向を強く読むには材料が不足しています。",
          ask: "駅前、公園、歩道、休憩できる場所など、日常的に使う場所を写真付きで投稿してもらう。",
          expectedUse:
            "デモや地域ワークショップで、収集から分析までの流れを説明しやすくなります。",
          priority: "高",
          tone: "border-sky-200 bg-sky-50 text-sky-800",
        });
      }

      if (activePosts.length > 0 && ccByRate < 80) {
        suggestions.push({
          id: "license-campaign",
          title: "再利用しやすい投稿を増やす",
          reason: `CC BY 4.0として扱える投稿は${ccByRate}%です。外部活用には再利用条件の明確さが重要です。`,
          ask: "投稿前に公開条件を確認してもらい、可能な範囲でCC BY 4.0を選んでもらう。",
          expectedUse:
            "CSV/GeoJSONを自治体、地域団体、観光PR素材として共有しやすくなります。",
          priority: "中",
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        });
      }

      suggestions.push({
        id: "time-diversity-campaign",
        title: "時間帯の違いが分かる投稿を集める",
        reason:
          "同じ場所でも朝・昼・夕方・夜で、安心感、混雑、日陰、にぎわいの見え方が変わります。",
        ask: "時間帯が分かるコメントを添えて、同じ地域を別の時間に投稿してもらう。",
        expectedUse:
          "観光回遊、夜間の安心感、暑さ対策など、時間軸を含む分析に広げられます。",
        priority: activePosts.length >= 5 ? "中" : "育成",
        tone: "border-slate-200 bg-slate-50 text-slate-800",
      });

      return suggestions.slice(0, 4);
    },
    [activePosts, ccByRate, gapCandidates],
  );
  const tagRankingDependencyKey = tagRanking
    .map((item) => `${item.tag}:${item.count}`)
    .join("|");

  useEffect(() => {
    setRegionalInsight(null);
    setInsightError(null);
    setCopyMessage(null);
    setShowDataUseReport(false);
  }, [
    activeScopeLabel,
    insightLens,
    activePosts.length,
    activeAdminPlaces.length,
    tagRankingDependencyKey,
  ]);

  const handleGenerateRegionalInsight = async () => {
    setIsGeneratingInsight(true);
    setInsightError(null);

    try {
      const insight = await fetchRegionalInsight({
        scope: "visible",
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
      await loadAnalysisLogs();
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
      "## 要約",
      insight.overview,
      "",
      "## 主要な発見",
      buildMarkdownList(insight.findings),
      "",
      "## 解釈・運用上の注意",
      buildMarkdownList(insight.risks),
      "",
      "## 推奨アクション",
      buildMarkdownList(insight.recommendedActions),
      "",
      "## 不足しているデータ",
      buildMarkdownList(insight.dataGaps),
      "",
      "## 次に集めたい投稿テーマ",
      buildMarkdownList(insight.collectionThemes),
      "",
      "## 投稿キャンペーン候補",
      collectionCampaignSuggestions
        .map(
          (suggestion) =>
            `- ${suggestion.title}（優先度: ${suggestion.priority}）\n  - 理由: ${suggestion.reason}\n  - 呼びかけ: ${suggestion.ask}\n  - 活用先: ${suggestion.expectedUse}`,
        )
        .join("\n"),
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
      "## 補足: 次に集めたい投稿テーマ",
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

  const buildDataUseReport = () => {
    const lensLabel =
      insightLensOptions.find((option) => option.value === insightLens)
        ?.label ?? "自治体施策";

    return [
      "# 3M Platform データ活用レポート",
      "",
      "## 1. 利用シーン",
      `- 想定利用者: ${selectedUseCaseStory.eyebrow}`,
      `- 目的: ${selectedUseCaseStory.title}`,
      `- 使い方: ${selectedUseCaseStory.scenario}`,
      `- 次の一手: ${selectedUseCaseStory.nextStep}`,
      "",
      "## 2. 集計サマリー",
      `- 分析範囲: ${activeScopeLabel}`,
      `- 分析視点: ${lensLabel}`,
      `- 市民投稿: ${activePosts.length.toLocaleString("ja-JP")}件`,
      `- 行政オープンデータ: ${activeVisibleSeedCount.toLocaleString("ja-JP")}件`,
      `- 上位タグ: ${topTagSummary}`,
      `- 都市体験タグ: ${urbanExperienceTagCount}種 / ${urbanExperienceTaggedPostCount}投稿`,
      `- CC BY率: ${ccByRate}%`,
      `- データ充実度: ${dataReadinessScore}%（${dataReadinessLabel}）`,
      "",
      "## 3. 地域から見えること",
      regionalInsight
        ? regionalInsight.overview
        : `${activeScopeLabel}では、市民投稿と行政オープンデータを重ねて、地域の魅力・関心・空白を確認できます。AI地域インサイトを生成すると、より具体的な自然文レポートにできます。`,
      "",
      "## 4. 主要な発見",
      regionalInsight
        ? buildMarkdownList(regionalInsight.findings)
        : buildMarkdownList([
            `市民投稿は${activePosts.length.toLocaleString("ja-JP")}件、行政オープンデータは${activeVisibleSeedCount.toLocaleString("ja-JP")}件あります。`,
            `上位タグは${topTagSummary}です。`,
            `ギャップ候補は${(adminGapCount + civicDiscoveryCount).toLocaleString("ja-JP")}件あります。`,
          ]),
      "",
      "## 5. 行政データと市民投稿のギャップ",
      regionalInsight
        ? regionalInsight.adminGap
        : gapCandidates.length > 0
          ? "行政データと市民投稿の近接関係が薄い場所があります。追加投稿や現地確認の候補として扱えます。"
          : "現時点では目立つギャップ候補は多くありません。投稿が増えると比較しやすくなります。",
      "",
      "## 6. 次に集めたい投稿",
      collectionCampaignSuggestions
        .map(
          (suggestion) =>
            `- ${suggestion.title}（優先度: ${suggestion.priority}）: ${suggestion.ask}`,
        )
        .join("\n"),
      "",
      "## 7. 活用アイデア",
      buildMarkdownList([
        selectedUseCaseStory.nextStep,
        "CSV/GeoJSONを出力して、地域マップや会議資料に再利用する。",
        "投稿キャンペーン候補を使い、次回の市民参加テーマを決める。",
      ]),
      "",
      "## 8. 注意",
      regionalInsight
        ? regionalInsight.caveat
        : "このレポートは現在の集計値に基づく参考情報です。施策判断には現地確認や追加調査を組み合わせてください。",
    ].join("\n");
  };

  const handleCopyDataUseReport = async () => {
    try {
      await navigator.clipboard.writeText(buildDataUseReport());
      setCopyMessage("データ活用レポートをコピーしました。");
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

  const dataUseReport = buildDataUseReport();
  const dataUseSteps =
    dataUseMode === "explore"
      ? [
          ["1", "キーワードを入れる", "気になる街のよさを探す"],
          ["2", "タグで広げる", "近い言葉や視点を見つける"],
          ["3", "投稿を見る", "写真とコメントで確かめる"],
          ["4", "範囲を変える", "地図を動かして探し直す"],
        ]
      : [
          ["1", "目的を決める", "データの使い道を選ぶ"],
          ["2", "充実度を見る", "表示範囲の前提を確かめる"],
          ["3", "AIで分析する", "目的に沿った結果を見る"],
          ["4", "レポート出力", "結果を共有・再利用する"],
        ];

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Data use view
        </p>
        <div className="mt-2">
          <h2 className="text-2xl font-bold text-slate-900">
            集まった地域データを活用する
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {dataUseMode === "explore"
              ? "市民や来訪者が、地図で表示している範囲から街のいいところを探せます。"
              : "何に活用するかを決めると、地図で表示している範囲に沿ってAIが地域データを読み解きます。最後に、分析結果をそのまま共有できるレポートとして持ち帰れます。"}
          </p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {dataUseSteps.map(([step, title, description]) => (
            <div
              key={step}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <p className="text-xs font-black text-primary">STEP {step}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {description}
              </p>
            </div>
          ))}
        </div>

      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {[
          [
            "explore",
            "市民向け探索モード",
            "街のいいところを探す",
            "キーワードやタグから、いま地図に表示している範囲の投稿を探します。",
          ],
          [
            "analyze",
            "データ活用分析モード",
            "集まった声を読み解く",
            "自治体、観光、地域活動の目的に沿ってAI分析とレポート出力を行います。",
          ],
        ].map(([mode, eyebrow, title, description]) => {
          const isActive = dataUseMode === mode;

          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDataUseMode(mode as DataUseMode)}
              className={`rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                isActive
                  ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/15"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">
                {eyebrow}
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {description}
              </p>
            </button>
          );
        })}
      </div>

      {dataUseMode === "explore" ? (
        <div className="rounded-3xl border border-orange-200 bg-white p-5 shadow-sm shadow-orange-100/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
                EXPLORE
              </p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">
                街のいいところをキーワードで探す
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                現在の地図表示範囲にある市民投稿から、タイトル、コメント、タグに一致する投稿を探します。
              </p>
            </div>
            <div className="rounded-2xl bg-orange-50 px-5 py-4 text-center">
              <p className="text-xs font-bold text-orange-700">検索対象</p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {activePosts.length.toLocaleString("ja-JP")}件
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label
              htmlFor="data-use-explore-query"
              className="text-sm font-bold text-slate-900"
            >
              キーワード
            </label>
            <input
              id="data-use-explore-query"
              type="search"
              value={exploreQuery}
              onChange={(event) => setExploreQuery(event.target.value)}
              placeholder="例: 休憩、歩きやすい、景色、静か"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
            />
            {suggestedExploreKeywords.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedExploreKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => setExploreQuery(keyword)}
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 transition hover:bg-orange-100"
                  >
                    #{keyword}
                  </button>
                ))}
                {exploreQuery ? (
                  <button
                    type="button"
                    onClick={() => setExploreQuery("")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    検索をクリア
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["見つかった投稿", `${exploreResults.length.toLocaleString("ja-JP")}件`],
              [
                "関連タグ",
                exploreRelatedTags.length > 0
                  ? exploreRelatedTags.map((item) => `#${item.tag}`).join("、")
                  : "まだありません",
              ],
              ["表示範囲", activeScopeLabel],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4"
              >
                <p className="text-xs font-bold text-orange-700">{label}</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {exploreResults.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {exploreResults.map((post) => {
                const tags = getPostTags(post).slice(0, 5);

                return (
                  <article
                    key={post.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                  >
                    <div className="grid gap-0 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <img
                        src={post.photoUrl}
                        alt=""
                        className="h-40 w-full object-cover sm:h-full"
                        loading="lazy"
                      />
                      <div className="p-4">
                        <p className="text-sm font-bold text-slate-900">
                          {post.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {post.summary}
                        </p>
                        {tags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setExploreQuery(tag)}
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:bg-orange-50 hover:text-orange-800"
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
              該当する投稿はありません。キーワードを変えるか、地図の表示範囲を広げてみてください。
            </p>
          )}
        </div>
      ) : (
        <>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              STEP 1 / PURPOSE
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              利用目的を選ぶ
            </h3>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            活用する人の視点を選ぶと、AI地域インサイトの分析視点も切り替わります。
            以降の分析・レポート・収集テーマが、この目的に沿って読みやすくなります。
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {useCaseStories.map((story) => {
            const isActive = insightLens === story.value;

            return (
              <button
                key={story.value}
                type="button"
                onClick={() => setInsightLens(story.value)}
                className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                  isActive
                    ? `${story.tone} ring-2 ring-primary/20`
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">
                  {story.eyebrow}
                </p>
                <h4 className="mt-2 text-base font-bold text-slate-900">
                  {story.title}
                </h4>

                <div className="mt-3 flex flex-wrap gap-2">
                  {story.outputs.map((output) => (
                    <span
                      key={output}
                      className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700"
                    >
                      {output}
                    </span>
                  ))}
                </div>

                {isActive ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-slate-700">
                      {story.scenario}
                    </p>
                    <p className="rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-700">
                      次の一手: {story.nextStep}
                    </p>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
              STEP 2 / DATA READINESS
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              AI分析に向けたデータ充実度
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              地図で表示している範囲について、AI地域インサイトの前提になる投稿数・タグ・行政データとの関係・再利用性を確認します。
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["市民投稿", `${activePosts.length.toLocaleString("ja-JP")}件`],
            ["行政オープンデータ", `${activeVisibleSeedCount.toLocaleString("ja-JP")}件`],
            ["公開再利用向け", `${ccByPostCount.toLocaleString("ja-JP")}件`],
            ["タグ種類", `${uniqueTagCount.toLocaleString("ja-JP")}種`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3"
            >
              <p className="text-xs font-bold text-sky-700">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
            </div>
          ))}
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
              STEP 3 / AI ANALYSIS
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {selectedUseCaseStory.eyebrow}のためのAI地域インサイト
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {activeScopeLabel}の市民投稿・行政オープンデータ・タグ傾向・ギャップ候補をもとに、選択した利用目的に必要な発見と次の行動を整理します。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
            <button
              type="button"
              onClick={handleGenerateRegionalInsight}
              disabled={isGeneratingInsight}
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

        <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-violet-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-violet-700">選択中の利用目的</p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {selectedUseCaseStory.eyebrow} — {selectedUseCaseStory.title}
            </p>
          </div>
          <p className="text-xs leading-5 text-slate-600">
            目的を変える場合は、上の「利用目的を選ぶ」から選び直してください。
          </p>
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
                  ["利用目的", selectedUseCaseStory.eyebrow],
                  [
                    "投稿 / 行政データ",
                    `${activePosts.length.toLocaleString("ja-JP")}件 / ${activeVisibleSeedCount.toLocaleString("ja-JP")}件`,
                  ],
                  [
                    "データ充実度",
                    `${dataReadinessScore}%（${dataReadinessLabel}）`,
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

            <div className="rounded-2xl border border-violet-100 bg-white p-4">
              <p className="text-xs font-bold text-violet-700">
                AI分析レポート
              </p>
              <h4 className="mt-2 text-lg font-bold text-slate-900">
                {regionalInsight.overview}
              </h4>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {[
                  ["主要な発見", regionalInsight.findings, "bg-violet-50"],
                  ["解釈・運用上の注意", regionalInsight.risks, "bg-rose-50"],
                  [
                    "推奨アクション",
                    regionalInsight.recommendedActions,
                    "bg-emerald-50",
                  ],
                  [
                    "不足しているデータ",
                    regionalInsight.dataGaps,
                    "bg-amber-50",
                  ],
                  [
                    "次に集めたい投稿テーマ",
                    regionalInsight.collectionThemes,
                    "bg-sky-50",
                  ],
                ].map(([label, items, tone]) => (
                  <div
                    key={label as string}
                    className={`rounded-2xl p-4 ${tone as string}`}
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {label as string}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {(items as string[]).map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <details className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-violet-800">
                分析の補足を見る
              </summary>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ["市民投稿から見える魅力", regionalInsight.civicSignals],
                  ["行政データとのギャップ", regionalInsight.adminGap],
                  ["活用・改善のヒント", regionalInsight.actionHint],
                  ["データ品質・再利用性メモ", regionalInsight.dataQualityNote],
                ].map(([label, text]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-violet-100 bg-white p-4"
                  >
                    <p className="text-xs font-bold text-violet-700">{label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </details>

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

        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Collection strategy
              </p>
              <h4 className="mt-1 text-base font-bold text-slate-900">
                次に集める投稿テーマ
              </h4>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                分析結果を、次の投稿キャンペーン候補へつなげます。
              </p>
            </div>
            <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">
              {collectionCampaignSuggestions.length}件の候補
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {collectionCampaignSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`rounded-2xl border bg-white/80 p-4 ${suggestion.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-80">
                      投稿キャンペーン案
                    </p>
                    <h5 className="mt-1 text-sm font-bold text-slate-900">
                      {suggestion.title}
                    </h5>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-xs font-black text-slate-700">
                    優先度 {suggestion.priority}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-700">
                  <p>
                    <span className="font-bold text-slate-900">理由:</span>{" "}
                    {suggestion.reason}
                  </p>
                  <p>
                    <span className="font-bold text-slate-900">呼びかけ:</span>{" "}
                    {suggestion.ask}
                  </p>
                  <p>
                    <span className="font-bold text-slate-900">活用先:</span>{" "}
                    {suggestion.expectedUse}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-teal-200 bg-white p-5 shadow-sm shadow-teal-100/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">
              STEP 4 / REPORT
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              分析レポートを出力
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              利用者視点、集計サマリー、地域の発見、ギャップ、次に集めたい投稿、活用アイデアを1枚のレポートにまとめます。
              AI地域インサイトを生成済みの場合は、その分析結果も反映します。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
            <button
              type="button"
              onClick={() => setShowDataUseReport((current) => !current)}
              className="w-full rounded-full bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
            >
              {showDataUseReport ? "レポートを閉じる" : "レポートを表示"}
            </button>
            <button
              type="button"
              onClick={handleCopyDataUseReport}
              className="w-full rounded-full border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 md:w-auto"
            >
              レポートをコピー
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["利用シーン", selectedUseCaseStory.eyebrow],
            ["分析範囲", activeScopeLabel],
            ["データ充実度", `${dataReadinessScore}%（${dataReadinessLabel}）`],
            [
              "AI反映",
              regionalInsight
                ? regionalInsight.source === "ai"
                  ? "Workers AI分析済み"
                  : "簡易インサイト反映"
                : "未生成",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4"
            >
              <p className="text-xs font-bold text-teal-700">{label}</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {showDataUseReport ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200">
                Report preview
              </p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
                Markdown
              </span>
            </div>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6">
              {dataUseReport}
            </pre>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900">
            {regionalInsight
              ? "レポートを表示すると、分析結果を1枚のMarkdownとして確認できます。"
              : "先にAI地域インサイトを生成すると、その分析結果をレポートとして表示・コピーできます。"}
          </p>
        )}

        <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">
            分析元データを書き出す
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            選択中の分析範囲に含まれる市民投稿を、再利用しやすい形式で保存します。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
        </details>
      </div>
        </>
      )}

      <details className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm shadow-amber-100/70">
        <summary className="cursor-pointer text-lg font-bold text-slate-900">
          根拠データを見る
          <span className="ml-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
            tags / gaps / nearby
          </span>
        </summary>

        <div className="mt-4 space-y-5">
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
        </div>
      </details>

      {dataUseMode === "analyze" ? (
        <>
          <details className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm shadow-indigo-100/70">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">
              運用情報を見る
              <span className="ml-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                AI operations / logs
              </span>
            </summary>

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  AI活用の運用設計
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  公共性のある市民投稿データとして扱えるよう、AIの自動判断だけに寄せず、監査・失敗時の継続・人の確認を前提にしています。
                </p>
              </div>

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
          </details>

          <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <summary className="cursor-pointer text-lg font-bold text-slate-900">
              AI分析ログを見る
              <span className="ml-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                optional
              </span>
            </summary>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  AI analysis logs
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  最近のAI分析ログ
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  AI地域インサイトを生成した範囲・視点・件数・生成方式をD1に残します。
                  監査やデモ後の振り返りに使える、軽量な運用ログです。
                </p>
              </div>
              <button
                type="button"
                onClick={loadAnalysisLogs}
                disabled={isLoadingAnalysisLogs}
                className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 md:w-auto"
              >
                {isLoadingAnalysisLogs ? "更新中..." : "ログを更新"}
              </button>
            </div>

            {analysisLogError ? (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {analysisLogError}
              </p>
            ) : null}

            {analysisLogs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {analysisLogs.map((log) => {
                  const lensLabel =
                    insightLensOptions.find(
                      (option) => option.value === log.lens,
                    )?.label ?? "自治体施策";
                  const topTags =
                    log.tagSummary.length > 0
                      ? log.tagSummary
                          .slice(0, 3)
                          .map((item) => `#${item.tag}`)
                          .join("、")
                      : "タグ未蓄積";

                  return (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">
                            {formatLogDate(log.createdAt)} / {lensLabel} /{" "}
                            {log.scope === "all" ? "全件データ" : "表示範囲"}
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-slate-900">
                            {typeof log.outputSummary.overview === "string"
                              ? log.outputSummary.overview
                              : "AI地域インサイトを生成しました。"}
                          </p>
                        </div>
                        <span className="w-fit shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                          {log.source === "ai" ? "Workers AI" : "フォールバック"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                        <span className="rounded-xl bg-white px-3 py-2">
                          市民投稿 {log.postCount.toLocaleString("ja-JP")}件
                        </span>
                        <span className="rounded-xl bg-white px-3 py-2">
                          行政データ{" "}
                          {log.adminPlaceCount.toLocaleString("ja-JP")}件
                        </span>
                        <span className="rounded-xl bg-white px-3 py-2">
                          上位タグ {topTags}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
                まだAI分析ログはありません。「AIで地域を読み解く」を実行すると、分析履歴がここに残ります。
              </p>
            )}
          </details>
        </>
      ) : null}

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
        <h3 className="font-bold">デモで伝えられること</h3>
        <p className="mt-2">
          {dataUseMode === "explore"
            ? "この画面は、市民投稿が街の発見体験としてそのまま使えることを示します。キーワードやタグから地域のいいところを探せるため、投稿する人と使う人の循環を見せられます。"
            : "この画面は、投稿を集めるだけでなく、地域の魅力データとして分析・共有・再利用できることを示します。行政オープンデータと市民投稿を重ねることで、観光ルートづくり、地域資源の発見、施策検討のための一次情報として活用できます。"}
        </p>
      </div>
    </section>
  );
}
