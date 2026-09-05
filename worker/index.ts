import { Hono, type Env } from "hono";
import seedGeojsonRaw from "../src/assets/seed.geojson?raw";
import { urbanExperienceTags } from "../src/lib/urbanExperienceTags";
import type { CommunityPost } from "../src/types";

type CloudflareEnv = {
  DB?: D1Database;
  R2_BUCKET?: R2Bucket;
  BUCKET_PUBLIC_URL?: string;
  AI?: {
    run: (
      model: string,
      input: unknown,
      options?: {
        gateway?: { id: string; skipCache?: boolean; cacheTtl?: number };
      },
    ) => Promise<unknown>;
  };
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  TURNSTILE_SECRET_KEY?: string;
};

type AppEnv = {
  Bindings: Env & CloudflareEnv;
};

type PostRow = {
  id: string;
  title: string;
  summary: string;
  lat: number;
  lng: number;
  photoUrl: string;
  createdAt: string;
  capturedAt?: string;
  locationSource?: string;
  contentLicense?: string;
  tags?: string;
  aiTags?: string;
  humanTags?: string;
};

type LocationSource = "exif" | "device" | "manual" | "fallback";
type ContentLicense = "all-rights-reserved" | "cc-by-4.0";

type TurnstileSiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

type GeoJsonSeedFeature = {
  type?: string;
  properties?: {
    name?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
};

type GeoJsonSeedCollection = {
  features?: GeoJsonSeedFeature[];
};

type AdminPlace = {
  id: string;
  name: string;
  category: string;
  city: string;
  prefecture: string;
  lat: number;
  lng: number;
};

type RegionalInsight = {
  lens: "policy" | "tourism" | "community";
  overview: string;
  civicSignals: string;
  adminGap: string;
  actionHint: string;
  collectionTheme: string;
  dataQualityNote: string;
  caveat: string;
  generatedAt: string;
  source: "ai" | "fallback";
};

const seedPlaces = (() => {
  const collection = JSON.parse(seedGeojsonRaw) as GeoJsonSeedCollection;

  return (collection.features ?? []).flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    const name = feature.properties?.name ?? `行政データ ${index + 1}`;
    const [lng, lat] = coordinates ?? [139.767125, 35.681236];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return [];
    }

    return [
      {
        id: `seed-${index + 1}`,
        name,
        category: "行政データ",
        city: "東京都",
        prefecture: "東京都",
        lat,
        lng,
      },
    ];
  });
})();

const defaultPosts: CommunityPost[] = [
  {
    id: "seed-post-01",
    title: "朝の東京駅前が広がる",
    summary: "駅前の風景が一段落ち着いていて、朝の一番乗りにぴったりです。",
    lat: 35.681236,
    lng: 139.767125,
    photoUrl:
      "https://images.unsplash.com/photo-1526481280695-3c4691d4b3f5?auto=format&fit=crop&w=1200&q=80",
    createdAt: "2026-08-08T08:00:00.000Z",
  },
  {
    id: "seed-post-02",
    title: "浅草の路地に癒やし",
    summary: "人混みの中にも落ち着いた空間があり、夕暮れの景色が特に好きです。",
    lat: 35.714765,
    lng: 139.796655,
    photoUrl:
      "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80",
    createdAt: "2026-08-09T18:45:00.000Z",
  },
];

const inMemoryStore = globalThis as typeof globalThis & {
  __community_posts__?: CommunityPost[];
};

if (!inMemoryStore.__community_posts__) {
  inMemoryStore.__community_posts__ = [...defaultPosts];
}

function getStoredPosts(): CommunityPost[] {
  return [...(inMemoryStore.__community_posts__ ?? [])];
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

type BboxParams = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function parseBboxParams(q: Record<string, string | undefined>) {
  const minLat = parseFloat(q.minLat ?? "");
  const maxLat = parseFloat(q.maxLat ?? "");
  const minLng = parseFloat(q.minLng ?? "");
  const maxLng = parseFloat(q.maxLng ?? "");

  return Number.isFinite(minLat) &&
    Number.isFinite(maxLat) &&
    Number.isFinite(minLng) &&
    Number.isFinite(maxLng) &&
    minLat < maxLat &&
    minLng < maxLng
    ? { minLat, maxLat, minLng, maxLng }
    : undefined;
}

async function readPostsFromD1(
  db: D1Database | undefined,
  bbox?: BboxParams,
  limit = 100,
): Promise<CommunityPost[]> {
  if (!db) {
    return [];
  }

  const safeLimit = Math.min(Math.max(1, limit), 1000);

  const SELECT =
    "SELECT id, title, summary, lat, lng, photo_url AS photoUrl, created_at AS createdAt, captured_at AS capturedAt, location_source AS locationSource, content_license AS contentLicense, tags, ai_tags AS aiTags, human_tags AS humanTags FROM community_posts";

  const results =
    bbox != null
      ? await db
          .prepare(
            `${SELECT} WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ?`,
          )
          .bind(bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, safeLimit)
          .all<PostRow>()
      : await db
          .prepare(`${SELECT} ORDER BY created_at DESC LIMIT ?`)
          .bind(safeLimit)
          .all<PostRow>();

  return (results.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    lat: Number(row.lat),
    lng: Number(row.lng),
    photoUrl: row.photoUrl,
    createdAt: row.createdAt,
    capturedAt: row.capturedAt,
    locationSource: parseLocationSource(row.locationSource),
    contentLicense: parseContentLicense(row.contentLicense),
    tags: safeParseTags(row.humanTags ?? row.tags),
    aiTags: safeParseTags(row.aiTags),
    humanTags: safeParseTags(row.humanTags ?? row.tags),
  }));
}

function parseLocationSource(value: unknown): LocationSource {
  return value === "exif" ||
    value === "device" ||
    value === "manual" ||
    value === "fallback"
    ? value
    : "fallback";
}

function parseContentLicense(value: unknown): ContentLicense {
  return value === "cc-by-4.0" ? "cc-by-4.0" : "all-rights-reserved";
}

async function verifyTurnstile(
  env: CloudflareEnv,
  token: unknown,
  remoteIp: string | undefined,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }

  const formData = new FormData();
  formData.set("secret", env.TURNSTILE_SECRET_KEY);
  formData.set("response", token);
  formData.set("idempotency_key", crypto.randomUUID());
  if (remoteIp) {
    formData.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );
    const result = (await response.json()) as TurnstileSiteverifyResponse;

    if (!response.ok || !result.success) {
      return false;
    }

    return !result.action || result.action === "community_post";
  } catch {
    return false;
  }
}

function normalizeCapturedAt(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function safeParseTags(value?: string): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function writePostToD1(db: D1Database | undefined, post: CommunityPost) {
  if (!db) {
    return;
  }

  await db
    .prepare(
      "INSERT INTO community_posts (id, title, summary, lat, lng, photo_url, created_at, captured_at, location_source, content_license, tags, ai_tags, human_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      post.id,
      post.title,
      post.summary,
      post.lat,
      post.lng,
      post.photoUrl,
      post.createdAt,
      post.capturedAt ?? null,
      post.locationSource ?? "fallback",
      post.contentLicense ?? "all-rights-reserved",
      JSON.stringify(post.tags ?? []),
      JSON.stringify(post.aiTags ?? []),
      JSON.stringify(post.humanTags ?? post.tags ?? []),
    )
    .run();
}

async function ensureSeedData(db: D1Database | undefined) {
  if (!db) {
    return;
  }

  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM admin_places")
    .first<{ count: number }>();

  const currentCount = count?.count ?? 0;
  const needsRefresh = currentCount === 0 || currentCount < seedPlaces.length;

  if (!needsRefresh) {
    return;
  }

  await db.prepare("DELETE FROM admin_places").run();

  for (const place of seedPlaces) {
    await db
      .prepare(
        "INSERT INTO admin_places (id, name, category, city, prefecture, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        place.id,
        place.name,
        place.category,
        place.city,
        place.prefecture,
        place.lat,
        place.lng,
      )
      .run();
  }
}

async function readSeedPlacesFromD1(
  db: D1Database | undefined,
  bbox?: BboxParams,
  limit = 500,
): Promise<{ count: number; places: AdminPlace[] }> {
  const safeLimit = Math.min(Math.max(1, limit), 10000);

  if (!db) {
    const filteredPlaces = bbox
      ? seedPlaces.filter(
          (place) =>
            place.lat >= bbox.minLat &&
            place.lat <= bbox.maxLat &&
            place.lng >= bbox.minLng &&
            place.lng <= bbox.maxLng,
        )
      : seedPlaces;

    return {
      count: seedPlaces.length,
      places: filteredPlaces.slice(0, safeLimit),
    };
  }

  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM admin_places")
    .first<{ count: number }>();

  const results = await db
    .prepare(
      bbox
        ? "SELECT id, name, category, city, prefecture, lat, lng FROM admin_places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY name ASC LIMIT ?"
        : "SELECT id, name, category, city, prefecture, lat, lng FROM admin_places ORDER BY name ASC LIMIT ?",
    )
    .bind(
      ...(bbox
        ? [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, safeLimit]
        : [safeLimit]),
    )
    .all<{
      id: string;
      name: string;
      category: string;
      city: string;
      prefecture: string;
      lat: number;
      lng: number;
    }>();

  if ((results.results ?? []).length > 0) {
    return {
      count: count?.count ?? 0,
      places: (results.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      prefecture: row.prefecture,
      lat: Number(row.lat),
      lng: Number(row.lng),
      })),
    };
  }

  return {
    count: count?.count ?? 0,
    places: [],
  };
}

function buildFallbackUrl(fileName: string, fallback: string) {
  return fileName
    ? `https://images.unsplash.com/${fallback}?auto=format&fit=crop&w=1200&q=80`
    : fallback;
}

function normalizeJsonResponse(response: unknown): Record<string, unknown> {
  const seen = new Set<unknown>();

  const parseStringCandidate = (value: string): Record<string, unknown> => {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }

    const candidates = [trimmed];
    const fenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (fenced !== trimmed) {
      candidates.push(fenced);
    }

    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      candidates.push(match[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // continue trying other candidate strings
      }
    }

    return {};
  };

  const visit = (value: unknown): Record<string, unknown> => {
    if (value == null) {
      return {};
    }

    if (typeof value === "string") {
      return parseStringCandidate(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const parsed = visit(item);
        if (Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
      return {};
    }

    if (typeof value === "object") {
      if (seen.has(value)) {
        return {};
      }
      seen.add(value);

      const objectValue = value as Record<string, unknown>;

      if (
        "safe" in objectValue ||
        "reason" in objectValue ||
        "tags" in objectValue ||
        "message" in objectValue ||
        "value" in objectValue ||
        "text" in objectValue
      ) {
        const reasonCandidate =
          objectValue.reason ??
          objectValue.message ??
          objectValue.text ??
          objectValue.value;

        if (
          typeof reasonCandidate === "string" ||
          typeof objectValue.safe !== "undefined" ||
          typeof objectValue.tags !== "undefined"
        ) {
          return objectValue;
        }
      }

      for (const key of Object.keys(objectValue)) {
        const parsed = visit(objectValue[key]);
        if (Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    }

    return {};
  };

  return visit(response);
}

function sanitizeTags(tags: string[]): string[] {
  const allowed = new Set([
    "温泉",
    "景色",
    "夜景",
    "海",
    "山",
    "街並み",
    "食事",
    "カフェ",
    "散歩",
    "祭り",
    "駅",
    "公園",
    "町",
    "自然",
    ...urbanExperienceTags,
  ]);

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    .filter((tag) => tag.length <= 20)
    .filter((tag) => allowed.has(tag) || tag.length >= 2);
}

function buildUrbanExperienceTagInstruction() {
  return `
    タグ候補は、次の「都市体験タグ」から3〜6個を優先して選んでください。
    写真や文章から読み取れないタグは付けないでください。
    必要な場合のみ、都市体験タグに加えて短い自由タグを1個まで追加できます。

    都市体験タグ:
    ${urbanExperienceTags.join("、")}
  `;
}

function sanitizeDraftText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : fallback;
}

function arrayBufferToBase64DataUrl(
  buffer: ArrayBuffer,
  mimeType = "image/jpeg",
): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

const MAX_AI_IMAGE_BYTES = 600_000;

function ensureAiImageSize(imageBuffer: ArrayBuffer): void {
  if (imageBuffer.byteLength > MAX_AI_IMAGE_BYTES) {
    throw new Error("image_too_large_for_ai");
  }
}

async function resizeImageForAi(
  imageBuffer: ArrayBuffer,
  maxDimension = 1200,
  quality = 0.72,
): Promise<ArrayBuffer> {
  ensureAiImageSize(imageBuffer);

  const globalWithCanvas = globalThis as typeof globalThis & {
    OffscreenCanvas?: new (
      width: number,
      height: number,
    ) => {
      getContext: (type: string) => {
        drawImage: (...args: unknown[]) => void;
      } | null;
      convertToBlob: (options?: {
        type?: string;
        quality?: number;
      }) => Promise<Blob>;
    };
    createImageBitmap?: (
      image: Blob,
    ) => Promise<{ width: number; height: number }>;
  };

  if (
    !globalWithCanvas.OffscreenCanvas ||
    !globalWithCanvas.createImageBitmap
  ) {
    return imageBuffer;
  }

  try {
    const blob = new Blob([imageBuffer]);
    const bitmap = await globalWithCanvas.createImageBitmap(blob);
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new globalWithCanvas.OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      return imageBuffer;
    }

    context.drawImage(bitmap as never, 0, 0, width, height);

    const resizedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });

    return await resizedBlob.arrayBuffer();
  } catch {
    throw new Error("image_resize_failed");
  }
}

let visionModelAgreementAccepted = false;

function resolveGatewayName(env: CloudflareEnv): string | undefined {
  const rawName = env.AI_GATEWAY_NAME?.trim();
  if (!rawName) {
    return undefined;
  }

  // Treat template placeholders as unset to avoid breaking production calls.
  if (rawName.toUpperCase().startsWith("YOUR_")) {
    return undefined;
  }

  return rawName;
}

async function ensureVisionModelAccepted(env: CloudflareEnv): Promise<void> {
  if (visionModelAgreementAccepted) {
    return;
  }

  if (!env.AI) {
    throw new Error("AI binding is not configured");
  }

  const gatewayName = resolveGatewayName(env);
  const payload = {
    prompt: "agree",
  };

  try {
    if (gatewayName) {
      await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload, {
        gateway: { id: gatewayName },
      });
    } else {
      await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload);
    }

    visionModelAgreementAccepted = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Model Agreement") ||
      message.includes("You may now use the model")
    ) {
      visionModelAgreementAccepted = true;
      return;
    }

    throw error;
  }
}

async function runVisionModel(
  env: CloudflareEnv,
  payload: Record<string, unknown>,
): Promise<unknown> {
  if (!env.AI) {
    throw new Error("AI binding is not configured");
  }

  const gatewayName = resolveGatewayName(env);

  if (gatewayName) {
    return await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload, {
      gateway: {
        id: gatewayName,
      },
    });
  }

  return await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload);
}

function extractReasonFromParsedResult(
  parsed: Record<string, unknown>,
): string | undefined {
  const candidates: unknown[] = [
    parsed.reason,
    parsed.message,
    parsed.explanation,
    parsed.summary,
    parsed.detail,
    parsed.error,
    parsed.text,
    parsed.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

async function runModerationCheck(
  env: CloudflareEnv,
  imageBuffer: ArrayBuffer,
  title: string,
  comment: string,
): Promise<{
  safe: boolean;
  requiresReview?: boolean;
  reason?: string;
  detected?: string[];
  possibleMisses?: string[];
  serviceError?: boolean;
}> {
  try {
    const constrainedImage = await resizeImageForAi(imageBuffer, 1200, 0.7);
    const imageDataUrl = arrayBufferToBase64DataUrl(
      constrainedImage,
      "image/jpeg",
    );

    await ensureVisionModelAccepted(env);

    const response = await runVisionModel(env, {
      messages: [
        {
          role: "system",
          content:
            "あなたは公開用オープンデータ画像の安全性を判定する審査員です。公開不可、要確認、公開可を区別して JSON だけで返してください。",
        },
        {
          role: "user",
          content: `
            次の画像を公開用オープンデータ画像として確認してください。
            目的は「個人・組織・店舗・商品・場所が特定できる可能性」を人が確認できるようにすることです。

            明確に公開不可なものは safe=false:
            - 性的、暴力的、差別的、露骨な表現
            - 危険行為、嫌がらせ、犯罪を助長する内容

            次の情報が少しでも視認または推測できる場合は safe=true かつ requiresReview=true:
            - 顔
            - 人物
            - 名札
            - 社名
            - 店舗名
            - 商品名
            - ブランドロゴ
            - QRコード
            - バーコード
            - ナンバープレート
            - 電話番号
            - メールアドレス
            - 地名
            - 建物名
            - PC画面
            - ホワイトボード記載内容

            顔や人物は、小さい、遠い、横顔、後ろ姿、ぼやけている、一部だけ写っている場合でも requiresReview=true。
            画像内に人間らしい輪郭、頭部、手足、服装、肌色領域が見える場合は requiresReview=true。
            特定できるか判断に迷う場合も requiresReview=true。

            特定につながる情報が見当たらず、通常の風景・自然・公園・空・植物・一般的な街並みであれば safe=true かつ requiresReview=false。

            出力は必ず JSON で以下の形式にしてください:
            {
              "safe": true|false,
              "requiresReview": true|false,
              "reason": "短い理由",
              "detected": ["検出した項目"],
              "possibleMisses": ["見落としの可能性がある箇所"]
            }

            タイトル: ${title}
            コメント: ${comment}
          `,
        },
      ],
      image: imageDataUrl,
    });

    const parsed = normalizeJsonResponse(response);
    const safeValue = parsed.safe;
    const safe =
      safeValue === true ||
      (typeof safeValue === "string" && safeValue.toLowerCase() === "true");

    const reason = extractReasonFromParsedResult(parsed);
    const requiresReviewValue = parsed.requiresReview ?? parsed.requires_review;
    const requiresReview =
      requiresReviewValue === true ||
      (typeof requiresReviewValue === "string" &&
        requiresReviewValue.toLowerCase() === "true");
    const detected = Array.isArray(parsed.detected)
      ? parsed.detected.filter((item): item is string => typeof item === "string")
      : [];
    const possibleMisses = Array.isArray(parsed.possibleMisses)
      ? parsed.possibleMisses.filter(
          (item): item is string => typeof item === "string",
        )
      : Array.isArray(parsed.possible_misses)
        ? parsed.possible_misses.filter(
            (item): item is string => typeof item === "string",
          )
        : [];

    return {
      safe,
      requiresReview,
      reason,
      detected,
      possibleMisses,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("image_too_large_for_ai")) {
      return {
        safe: false,
        requiresReview: false,
        reason:
          "画像サイズが大きすぎます。もう少し小さな写真で再度お試しください。",
      };
    }

    if (
      message.includes("context window") ||
      message.includes("estimated number of input")
    ) {
      return {
        safe: false,
        requiresReview: false,
        reason:
          "画像が大きすぎるため、AI 判定ができませんでした。画像をもう少し小さくして再度お試しください。",
      };
    }

    return {
      // Fail-open on transient AI service failures; user performs final human review.
      safe: true,
      requiresReview: true,
      serviceError: true,
      reason: `AI 判定サービスが応答できませんでした（${message}）。画像を別のものにして再度お試しください。`,
    };
  }
}

async function runTagSuggestion(
  env: CloudflareEnv,
  imageBuffer: ArrayBuffer,
  title: string,
  comment: string,
): Promise<string[]> {
  try {
    const constrainedImage = await resizeImageForAi(imageBuffer, 1200, 0.7);
    const imageDataUrl = arrayBufferToBase64DataUrl(
      constrainedImage,
      "image/jpeg",
    );

    await ensureVisionModelAccepted(env);

    const response = await runVisionModel(env, {
      messages: [
        {
          role: "system",
          content:
            "あなたは地域の魅力投稿向けに画像を分析し、適切な日本語タグ候補を作成するアシスタントです。",
        },
        {
          role: "user",
          content: `
            この画像とコメントをもとに、投稿に使えるタグ候補を3〜6個作成してください。
            ${buildUrbanExperienceTagInstruction()}
            出力は必ず JSON で以下の形式にしてください:
            { "tags": ["緑がある", "休憩しやすい", "季節を感じる"] }

            タイトル: ${title}
            コメント: ${comment}
          `,
        },
      ],
      image: imageDataUrl,
    });

    const parsed = normalizeJsonResponse(response);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
      : typeof parsed.tags === "string"
        ? parsed.tags
            .split(/[\s,、,]+/)
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

    return sanitizeTags(tags);
  } catch {
    return [];
  }
}

async function runPhotoDraftSuggestion(
  env: CloudflareEnv,
  imageBuffer: ArrayBuffer,
): Promise<{ title: string; summary: string; tags: string[] }> {
  try {
    const constrainedImage = await resizeImageForAi(imageBuffer, 1200, 0.7);
    const imageDataUrl = arrayBufferToBase64DataUrl(
      constrainedImage,
      "image/jpeg",
    );

    await ensureVisionModelAccepted(env);

    const response = await runVisionModel(env, {
      messages: [
        {
          role: "system",
          content:
            "あなたは地域の魅力投稿の下書きを作る編集者です。写真から、自然な日本語の短い投稿案を作ってください。",
        },
        {
          role: "user",
          content: `
            この写真をもとに、投稿タイトル、一言コメント、タグ候補を作成してください。
            誇張しすぎず、写真から読み取れる範囲で具体的にしてください。
            ${buildUrbanExperienceTagInstruction()}
            出力は必ず JSON で以下の形式にしてください:
            { "title": "短いタイトル", "summary": "一言コメント", "tags": ["緑がある", "歩きやすい", "地域らしさ"] }
          `,
        },
      ],
      image: imageDataUrl,
    });

    const parsed = normalizeJsonResponse(response);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    return {
      title: sanitizeDraftText(parsed.title, "地域の魅力スポット", 60),
      summary: sanitizeDraftText(
        parsed.summary ?? parsed.comment,
        "写真から見つけた地域のおすすめスポットです。",
        200,
      ),
      tags: sanitizeTags(tags),
    };
  } catch {
    return {
      title: "地域の魅力スポット",
      summary: "写真から見つけた地域のおすすめスポットです。",
      tags: [],
    };
  }
}

async function runTextTagSuggestion(
  env: CloudflareEnv,
  title: string,
  comment: string,
): Promise<string[]> {
  try {
    await ensureVisionModelAccepted(env);

    const response = await runVisionModel(env, {
      messages: [
        {
          role: "system",
          content:
            "あなたは地域の魅力投稿向けに、文章から適切な日本語タグ候補を作成するアシスタントです。",
        },
        {
          role: "user",
          content: `
            次の投稿文からタグ候補を3〜6個作成してください。
            ${buildUrbanExperienceTagInstruction()}
            出力は必ず JSON で以下の形式にしてください:
            { "tags": ["休憩しやすい", "静か", "ベンチがある"] }

            タイトル: ${title}
            コメント: ${comment}
          `,
        },
      ],
    });

    const parsed = normalizeJsonResponse(response);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
      : typeof parsed.tags === "string"
        ? parsed.tags
            .split(/[\s,、,]+/)
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

    return sanitizeTags(tags);
  } catch {
    return sanitizeTags([title, ...comment.split(/[\s,、。]+/)]).slice(0, 6);
  }
}

function getCommunityPostTags(post: CommunityPost): string[] {
  return post.humanTags ?? post.tags ?? [];
}

async function findSimilarPostWarnings(
  env: CloudflareEnv,
  location: { lat: number; lng: number },
  tags: string[],
): Promise<string[]> {
  const bboxMargin = 0.003;
  const nearbyPosts = env.DB
    ? await readPostsFromD1(
        env.DB,
        {
          minLat: location.lat - bboxMargin,
          maxLat: location.lat + bboxMargin,
          minLng: location.lng - bboxMargin,
          maxLng: location.lng + bboxMargin,
        },
        20,
      )
    : getStoredPosts();
  const normalizedTags = new Set(tags.map((tag) => tag.trim()).filter(Boolean));

  const candidates = nearbyPosts
    .map((post) => {
      const distanceMeters = getDistanceMeters(location, post);
      const postTags = getCommunityPostTags(post);
      const matchedTags = postTags.filter((tag) => normalizedTags.has(tag));
      const similarityScore =
        distanceMeters <= 30
          ? 3
          : distanceMeters <= 80
            ? 2
            : distanceMeters <= 150
              ? 1
              : 0;

      return {
        post,
        distanceMeters,
        matchedTags,
        score: similarityScore + matchedTags.length,
      };
    })
    .filter(
      (candidate) =>
        candidate.distanceMeters <= 150 &&
        (candidate.distanceMeters <= 50 || candidate.matchedTags.length > 0),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.distanceMeters - b.distanceMeters ||
        a.post.title.localeCompare(b.post.title, "ja"),
    )
    .slice(0, 3);

  if (candidates.length === 0) {
    return [];
  }

  return [
    `近い場所に似た投稿候補が${candidates.length}件あります。重複ではなく別の発見として公開できるか確認してください。`,
    ...candidates.map((candidate) => {
      const tagText =
        candidate.matchedTags.length > 0
          ? ` / 共通タグ: ${candidate.matchedTags.join("、")}`
          : "";
      return `類似候補: ${candidate.post.title}（約${Math.round(candidate.distanceMeters)}m${tagText}）`;
    }),
  ];
}

function sanitizeInsightText(value: unknown, fallback: string, maxLength = 180) {
  return sanitizeDraftText(value, fallback, maxLength);
}

function buildFallbackRegionalInsight(input: {
  scope: "visible" | "all";
  lens: "policy" | "tourism" | "community";
  posts: CommunityPost[];
  adminPlaces: AdminPlace[];
  seedCount: number;
  visibleSeedCount: number;
  tagRanking: { tag: string; count: number }[];
  ccByPostCount: number;
}): RegionalInsight {
  const scopeLabel = input.scope === "all" ? "全件データ" : "表示範囲";
  const lensLabel =
    input.lens === "tourism"
      ? "観光・地域PR"
      : input.lens === "community"
        ? "市民活動"
        : "自治体施策";
  const topTags = input.tagRanking.slice(0, 3).map((item) => `#${item.tag}`);
  const topTagText = topTags.length > 0 ? topTags.join("、") : "タグはまだ少なめ";

  return {
    lens: input.lens,
    overview: `${scopeLabel}では、市民投稿${input.posts.length}件と行政オープンデータ${input.visibleSeedCount}件を比較できます。`,
    civicSignals:
      input.posts.length > 0
        ? `市民投稿では${topTagText}などの切り口が見えています。投稿数が増えるほど、地域の体験価値の傾向を読み取りやすくなります。`
        : "現時点では市民投稿が少ないため、地域の実感値を読み解くには追加投稿が必要です。",
    adminGap:
      input.adminPlaces.length > 0 && input.posts.length > 0
        ? "行政データと市民投稿を重ねることで、制度上の資源と市民が魅力を感じる場所の重なりや空白を確認できます。"
        : "行政データまたは市民投稿が不足しているため、ギャップ分析は限定的です。",
    actionHint:
      input.posts.length > 0
        ? `${lensLabel}の観点では、上位タグ周辺の投稿を増やし、CSV/GeoJSONで二次利用すると検討素材になります。`
        : "まずは写真付き投稿を数件集め、タグと位置のばらつきを確認すると分析の出発点になります。",
    collectionTheme:
      input.posts.length > 0
        ? `${topTagText}に近い観点で、まだ投稿が少ない周辺エリアの写真や一言コメントを集めると比較しやすくなります。`
        : "まずは駅前、公園、歩道、休憩できる場所など、日常的に使われる場所の投稿を集めるのがおすすめです。",
    dataQualityNote:
      input.posts.length > 0
        ? `再利用可能な投稿は${input.ccByPostCount}件です。位置、タグ、ライセンス同意がそろうほど、外部利用しやすいデータになります。`
        : "投稿数が少ないため、傾向分析よりもデータ収集フェーズとして扱うのが適切です。",
    caveat: `このインサイトは${scopeLabel}の集計に基づく参考情報です。施策判断には現地確認や追加調査を組み合わせてください。`,
    generatedAt: new Date().toISOString(),
    source: "fallback",
  };
}

async function runRegionalInsight(
  env: CloudflareEnv,
  input: {
    scope: "visible" | "all";
    lens: "policy" | "tourism" | "community";
    posts: CommunityPost[];
    adminPlaces: AdminPlace[];
    seedCount: number;
    visibleSeedCount: number;
    tagRanking: { tag: string; count: number }[];
    ccByPostCount: number;
  },
): Promise<RegionalInsight> {
  const fallback = buildFallbackRegionalInsight(input);

  try {
    const lensInstruction =
      input.lens === "tourism"
        ? "観光・地域PR担当者の視点で、回遊、地域資源、まち歩き、発信素材としての可能性を重視してください。"
        : input.lens === "community"
          ? "市民活動・地域団体の視点で、住民参加、身近な困りごと、追加で集めたい声を重視してください。"
          : "自治体職員の視点で、施策検討、公共空間、行政データとのギャップ、追加調査候補を重視してください。";
    const representativePosts = input.posts.slice(0, 8).map((post) => ({
      title: post.title,
      summary: post.summary,
      tags: getCommunityPostTags(post).slice(0, 6),
      lat: Number(post.lat.toFixed(5)),
      lng: Number(post.lng.toFixed(5)),
      contentLicense: post.contentLicense ?? "all-rights-reserved",
    }));
    const representativeAdminPlaces = input.adminPlaces
      .slice(0, 12)
      .map((place) => ({
        name: place.name,
        category: place.category,
        lat: Number(place.lat.toFixed(5)),
        lng: Number(place.lng.toFixed(5)),
      }));

    await ensureVisionModelAccepted(env);

    const response = await runVisionModel(env, {
      messages: [
        {
          role: "system",
          content:
            "あなたは自治体・地域団体向けに、市民投稿データと行政オープンデータの関係を慎重に読み解く分析者です。断定しすぎず、示唆・候補として短く整理してください。JSONだけで返してください。",
        },
        {
          role: "user",
          content: `
            次の集計データから、地域インサイトを日本語で作成してください。
            目的は「行政データと市民投稿のギャップや活用ヒント」をデモで分かりやすく示すことです。
            分析視点: ${lensInstruction}

            制約:
            - 各項目は80〜140字程度
            - 断定せず「示唆されます」「候補です」など慎重な表現にする
            - 投稿数が少ない場合は、その限界を明記する
            - 出力は必ずJSONのみ

            出力形式:
            {
              "overview": "この地域の特徴",
              "civicSignals": "市民投稿から見える魅力",
              "adminGap": "行政データとのギャップ",
              "actionHint": "活用・改善のヒント",
              "collectionTheme": "次に集めたい投稿テーマ",
              "dataQualityNote": "データ品質・再利用性のメモ",
              "caveat": "注意書き"
            }

            集計範囲: ${input.scope === "all" ? "全件データ" : "表示範囲"}
            分析視点キー: ${input.lens}
            市民投稿数: ${input.posts.length}
            行政オープンデータ件数: ${input.visibleSeedCount}
            行政オープンデータ総数: ${input.seedCount}
            CC BY 4.0投稿数: ${input.ccByPostCount}
            上位タグ: ${JSON.stringify(input.tagRanking.slice(0, 8))}
            代表的な市民投稿: ${JSON.stringify(representativePosts)}
            代表的な行政データ: ${JSON.stringify(representativeAdminPlaces)}
          `,
        },
      ],
    });

    const parsed = normalizeJsonResponse(response);

    return {
      lens: input.lens,
      overview: sanitizeInsightText(parsed.overview, fallback.overview),
      civicSignals: sanitizeInsightText(
        parsed.civicSignals ?? parsed.civic_signals,
        fallback.civicSignals,
      ),
      adminGap: sanitizeInsightText(
        parsed.adminGap ?? parsed.admin_gap,
        fallback.adminGap,
      ),
      actionHint: sanitizeInsightText(
        parsed.actionHint ?? parsed.action_hint,
        fallback.actionHint,
      ),
      collectionTheme: sanitizeInsightText(
        parsed.collectionTheme ?? parsed.collection_theme,
        fallback.collectionTheme,
      ),
      dataQualityNote: sanitizeInsightText(
        parsed.dataQualityNote ?? parsed.data_quality_note,
        fallback.dataQualityNote,
      ),
      caveat: sanitizeInsightText(parsed.caveat, fallback.caveat),
      generatedAt: new Date().toISOString(),
      source: "ai",
    };
  } catch {
    return fallback;
  }
}

const app = new Hono<AppEnv>();

app.get("/uploads/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/uploads\//, ""));
  const object = key ? await c.env.R2_BUCKET?.get(key) : null;

  if (!object || !object.body) {
    return c.body(null, 404);
  }

  const headers = new Headers();
  const contentType =
    object.httpMetadata?.contentType || "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

app.get("/api/health", (c) => {
  return c.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/seed", async (c) => {
  await ensureSeedData(c.env.DB);
  const q = c.req.query();
  const bbox = parseBboxParams(q);
  const limit = parseInt(q.limit ?? "500", 10);
  const result = await readSeedPlacesFromD1(
    c.env.DB,
    bbox,
    Number.isFinite(limit) ? limit : 500,
  );

  return c.json({
    count: result.count,
    visibleCount: result.places.length,
    places: result.places,
  });
});

app.get("/api/posts", async (c) => {
  const q = c.req.query();
  const limit = parseInt(q.limit ?? "100", 10);
  const bbox = parseBboxParams(q);

  const dbPosts = await readPostsFromD1(
    c.env.DB,
    bbox,
    Number.isFinite(limit) ? limit : 100,
  );
  if (c.env.DB) {
    return c.json({ posts: dbPosts });
  }

  return c.json({ posts: getStoredPosts() });
});

app.post("/api/insights/region", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    scope?: string;
    lens?: string;
    posts?: CommunityPost[];
    adminPlaces?: AdminPlace[];
    seedCount?: number;
    visibleSeedCount?: number;
    tagRanking?: { tag: string; count: number }[];
    ccByPostCount?: number;
  };

  const posts = Array.isArray(body.posts)
    ? body.posts.slice(0, 1000).flatMap((post) => {
        const lat = Number(post.lat);
        const lng = Number(post.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return [];
        }

        return [
          {
            ...post,
            title: sanitizeDraftText(post.title, "無題の投稿", 60),
            summary: sanitizeDraftText(post.summary, "", 200),
            lat,
            lng,
            tags: sanitizeTags(getCommunityPostTags(post)),
            humanTags: sanitizeTags(post.humanTags ?? post.tags ?? []),
            aiTags: sanitizeTags(post.aiTags ?? []),
          },
        ];
      })
    : [];

  const adminPlaces = Array.isArray(body.adminPlaces)
    ? body.adminPlaces.slice(0, 10000).flatMap((place) => {
        const lat = Number(place.lat);
        const lng = Number(place.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return [];
        }

        return [
          {
            ...place,
            name: sanitizeDraftText(place.name, "行政データ", 80),
            category: sanitizeDraftText(place.category, "行政データ", 40),
            city: sanitizeDraftText(place.city, "東京都", 40),
            prefecture: sanitizeDraftText(place.prefecture, "東京都", 40),
            lat,
            lng,
          },
        ];
      })
    : [];

  const insight = await runRegionalInsight(c.env, {
    scope: body.scope === "all" ? "all" : "visible",
    lens:
      body.lens === "tourism" || body.lens === "community"
        ? body.lens
        : "policy",
    posts,
    adminPlaces,
    seedCount: Number.isFinite(body.seedCount) ? Number(body.seedCount) : 0,
    visibleSeedCount: Number.isFinite(body.visibleSeedCount)
      ? Number(body.visibleSeedCount)
      : adminPlaces.length,
    tagRanking: Array.isArray(body.tagRanking)
      ? body.tagRanking.slice(0, 8).flatMap((item) => {
          const count = Number(item.count);
          if (!item.tag || !Number.isFinite(count)) {
            return [];
          }

          return [
            {
              tag: sanitizeDraftText(item.tag, "", 20),
              count,
            },
          ];
        })
      : [],
    ccByPostCount: Number.isFinite(body.ccByPostCount)
      ? Number(body.ccByPostCount)
      : 0,
  });

  return c.json({ ok: true, insight });
});

app.post("/api/posts/precheck", async (c) => {
  const formData = await c.req.formData();
  const mode = String(formData.get("mode") ?? "photo");
  const photo = formData.get("photo");
  const title = String(formData.get("title") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const lat = Number(formData.get("lat") ?? 35.681236);
  const lng = Number(formData.get("lng") ?? 139.767125);
  const location =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : { lat: 35.681236, lng: 139.767125 };

  if (mode === "text") {
    if (!title || !comment) {
      return c.json(
        {
          ok: false,
          error: "missing_text",
          message: "写真なし投稿ではタイトルと一言を入力してください。",
        },
        400,
      );
    }

    const tags = await runTextTagSuggestion(c.env, title, comment);
    const similarWarnings = await findSimilarPostWarnings(
      c.env,
      location,
      tags,
    );
    return c.json({
      ok: true,
      safe: true,
      title,
      summary: comment,
      tags,
      warnings: similarWarnings,
      requiresReview: similarWarnings.length > 0,
    });
  }

  if (!(photo instanceof File)) {
    return c.json(
      {
        ok: false,
        error: "missing_photo",
        message: "画像が選択されていません。",
      },
      400,
    );
  }

  const imageBuffer = await photo.arrayBuffer();
  const draft = await runPhotoDraftSuggestion(c.env, imageBuffer);
  const moderation = await runModerationCheck(
    c.env,
    imageBuffer,
    title || draft.title,
    comment || draft.summary,
  );

  if (!moderation.safe) {
    return c.json(
      {
        ok: false,
        error: "unsafe_image",
        message:
          moderation.reason ??
          "投稿対象の画像はガイドラインに適合しません。別の写真を選択してください。",
        reason:
          moderation.reason ??
          "投稿対象の画像はガイドラインに適合しません。別の写真を選択してください。",
      },
      422,
    );
  }

  const tags =
    draft.tags.length > 0
      ? draft.tags
      : await runTagSuggestion(
          c.env,
          imageBuffer,
          title || draft.title,
          comment || draft.summary,
        );
  const similarWarnings = await findSimilarPostWarnings(c.env, location, tags);
  const warnings = [
    ...(moderation.requiresReview
      ? [
          moderation.reason ??
            "画像に公開前確認が必要な情報が含まれる可能性があります。",
        ]
      : []),
    ...(moderation.detected && moderation.detected.length > 0
      ? [`検出候補: ${moderation.detected.join("、")}`]
      : []),
    ...(moderation.possibleMisses && moderation.possibleMisses.length > 0
      ? [`見落とし注意: ${moderation.possibleMisses.join("、")}`]
      : []),
    ...(moderation.serviceError
      ? [
          moderation.reason ??
            "AI 判定サービスが一時的に不安定です。内容を確認して投稿してください。",
        ]
      : []),
    ...similarWarnings,
  ];

  return c.json({
    ok: true,
    safe: true,
    title: title || draft.title,
    summary: comment || draft.summary,
    tags,
    warnings,
    requiresReview:
      moderation.requiresReview === true ||
      moderation.serviceError === true ||
      similarWarnings.length > 0,
  });
});

app.post("/api/posts", async (c) => {
  const body = await c.req.parseBody();
  const title = String(body.title ?? "新しい魅力スポット");
  const summary = String(body.summary ?? "地域のおすすめスポットです。");
  const lat = Number(body.lat ?? 35.681236);
  const lng = Number(body.lng ?? 139.767125);
  const photoUrlFromBody = body.photoUrl ? String(body.photoUrl) : "";
  const file = body.photo instanceof File ? body.photo : null;
  const turnstileToken = body["cf-turnstile-response"];

  const isVerified = await verifyTurnstile(
    c.env,
    turnstileToken,
    c.req.header("CF-Connecting-IP") ?? undefined,
  );
  if (!isVerified) {
    return c.json(
      {
        ok: false,
        error: "turnstile_failed",
        message: "セキュリティ確認に失敗しました。再度お試しください。",
      },
      403,
    );
  }

  let photoUrl =
    photoUrlFromBody ||
    (file
      ? "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80"
      : "/favicon.svg");

  if (file) {
    const extension = file.name.includes(".")
      ? (file.name.split(".").pop() ?? "jpg")
      : "jpg";
    const objectKey = `posts/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    if (c.env.R2_BUCKET) {
      await c.env.R2_BUCKET.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: file.type || "image/jpeg",
        },
      });

      const requestUrl = new URL(c.req.url);
      photoUrl = `${requestUrl.origin}/uploads/${objectKey}`;
    } else {
      photoUrl = buildFallbackUrl(
        file.name,
        "photo-1493246507139-91e8fad9978e",
      );
    }
  }

  const parseTagField = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.filter((tag): tag is string => typeof tag === "string");
    }

    if (typeof value !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      return [];
    }
  };

  const aiTags = parseTagField(body.aiTags ?? body.tags);
  const humanTags = parseTagField(body.humanTags ?? body.tags);
  const tags = humanTags;
  const capturedAt = normalizeCapturedAt(body.capturedAt);
  const locationSource = parseLocationSource(body.locationSource);
  const contentLicense = parseContentLicense(body.contentLicense);

  const createdAt = new Date().toISOString();
  const post: CommunityPost = {
    id: crypto.randomUUID(),
    title,
    summary,
    lat,
    lng,
    photoUrl,
    createdAt,
    capturedAt,
    locationSource,
    contentLicense,
    tags,
    aiTags,
    humanTags,
  };

  const existing = getStoredPosts();
  inMemoryStore.__community_posts__ = [post, ...existing];
  await writePostToD1(c.env.DB, post);

  return c.json({ ok: true, post });
});

app.get("/api/*", (c) => {
  return c.json({
    ok: true,
    path: new URL(c.req.url).pathname,
  });
});

app.notFound((c) => {
  return c.body(null, 404);
});

export default app;
