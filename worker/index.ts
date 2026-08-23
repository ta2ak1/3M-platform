import { Hono, type Env } from "hono";
import seedGeojsonRaw from "../src/assets/seed.geojson?raw";
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
  ]);

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    .filter((tag) => tag.length <= 20)
    .filter((tag) => allowed.has(tag) || tag.length >= 2);
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
            既存のタグに依存せず、自然で適切な日本語タグを返してください。
            出力は必ず JSON で以下の形式にしてください:
            { "tags": ["温泉", "景色", "夜景"] }

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
            出力は必ず JSON で以下の形式にしてください:
            { "title": "短いタイトル", "summary": "一言コメント", "tags": ["公園", "散歩", "自然"] }
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
            出力は必ず JSON で以下の形式にしてください:
            { "tags": ["公園", "散歩", "自然"] }

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

app.post("/api/posts/precheck", async (c) => {
  const formData = await c.req.formData();
  const mode = String(formData.get("mode") ?? "photo");
  const photo = formData.get("photo");
  const title = String(formData.get("title") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();

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
    return c.json({
      ok: true,
      safe: true,
      title,
      summary: comment,
      tags,
      warnings: [],
      requiresReview: false,
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
  ];

  return c.json({
    ok: true,
    safe: true,
    title: title || draft.title,
    summary: comment || draft.summary,
    tags,
    warnings,
    requiresReview:
      moderation.requiresReview === true || moderation.serviceError === true,
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
