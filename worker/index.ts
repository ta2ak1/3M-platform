import { Hono, type Env } from "hono";
import seedGeojsonRaw from "../src/assets/seed.geojson?raw";
import type { CommunityPost } from "../src/types";

type CloudflareEnv = {
  DB?: D1Database;
  R2_BUCKET?: R2Bucket;
  BUCKET_PUBLIC_URL?: string;
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

async function readPostsFromD1(
  db: D1Database | undefined,
): Promise<CommunityPost[]> {
  if (!db) {
    return [];
  }

  const results = await db
    .prepare(
      "SELECT id, title, summary, lat, lng, photo_url AS photoUrl, created_at AS createdAt FROM community_posts ORDER BY created_at DESC LIMIT 50",
    )
    .all<PostRow>();

  return (results.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    lat: Number(row.lat),
    lng: Number(row.lng),
    photoUrl: row.photoUrl,
    createdAt: row.createdAt,
  }));
}

async function writePostToD1(db: D1Database | undefined, post: CommunityPost) {
  if (!db) {
    return;
  }

  await db
    .prepare(
      "INSERT INTO community_posts (id, title, summary, lat, lng, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      post.id,
      post.title,
      post.summary,
      post.lat,
      post.lng,
      post.photoUrl,
      post.createdAt,
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
): Promise<AdminPlace[]> {
  if (!db) {
    return seedPlaces;
  }

  const results = await db
    .prepare(
      "SELECT id, name, category, city, prefecture, lat, lng FROM admin_places ORDER BY name ASC LIMIT 200",
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
    return (results.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      prefecture: row.prefecture,
      lat: Number(row.lat),
      lng: Number(row.lng),
    }));
  }

  return seedPlaces;
}

function buildFallbackUrl(fileName: string, fallback: string) {
  return fileName
    ? `https://images.unsplash.com/${fallback}?auto=format&fit=crop&w=1200&q=80`
    : fallback;
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
  const places = await readSeedPlacesFromD1(c.env.DB);

  return c.json({
    count: places.length,
    places,
  });
});

app.get("/api/posts", async (c) => {
  const dbPosts = await readPostsFromD1(c.env.DB);
  if (dbPosts.length > 0) {
    return c.json({ posts: dbPosts });
  }

  return c.json({ posts: getStoredPosts() });
});

app.post("/api/posts", async (c) => {
  const body = await c.req.parseBody();
  const title = String(body.title ?? "新しい魅力スポット");
  const summary = String(body.summary ?? "地域のおすすめスポットです。");
  const lat = Number(body.lat ?? 35.681236);
  const lng = Number(body.lng ?? 139.767125);
  const photoUrlFromBody = body.photoUrl ? String(body.photoUrl) : "";
  const file = body.photo instanceof File ? body.photo : null;

  let photoUrl =
    photoUrlFromBody ||
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80";

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

  const createdAt = new Date().toISOString();
  const post: CommunityPost = {
    id: crypto.randomUUID(),
    title,
    summary,
    lat,
    lng,
    photoUrl,
    createdAt,
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
