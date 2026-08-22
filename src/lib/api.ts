import type { AdminPlace, CommunityPost } from "../types";
import { mockPosts } from "./mockData";

const API_BASE = "/api";

export type BboxQuery = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function buildBboxUrl(path: string, bbox?: BboxQuery): string {
  if (!bbox) {
    return `${API_BASE}${path}`;
  }

  const params = new URLSearchParams({
    minLat: String(bbox.minLat),
    maxLat: String(bbox.maxLat),
    minLng: String(bbox.minLng),
    maxLng: String(bbox.maxLng),
  });

  return `${API_BASE}${path}?${params.toString()}`;
}

export type AdminPlacesResponse = {
  count: number;
  visibleCount: number;
  places: AdminPlace[];
};

export async function fetchAdminPlaces(
  bbox?: BboxQuery,
): Promise<AdminPlacesResponse> {
  const response = await fetch(buildBboxUrl("/seed", bbox), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return { count: 0, visibleCount: 0, places: [] };
  }

  const payload = (await response.json()) as {
    places?: AdminPlace[];
    count?: number;
    visibleCount?: number;
  };
  const places = payload.places ?? [];

  return {
    count: payload.count ?? places.length,
    visibleCount: payload.visibleCount ?? places.length,
    places,
  };
}

export async function fetchPosts(bbox?: BboxQuery): Promise<CommunityPost[]> {
  const response = await fetch(buildBboxUrl("/posts", bbox), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return mockPosts;
  }

  const payload = (await response.json()) as { posts?: CommunityPost[] };
  return payload.posts ?? mockPosts;
}

export async function precheckPost(formData: FormData): Promise<{
  ok: boolean;
  title?: string;
  summary?: string;
  tags: string[];
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/posts/precheck`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    title?: string;
    summary?: string;
    tags?: string[];
    message?: string;
    reason?: string;
    error?: string;
  };

  if (!response.ok || !payload.ok) {
    return {
      ok: false,
      tags: [],
      message:
        payload.reason ?? payload.message ?? "画像の確認に失敗しました。",
    };
  }

  return {
    ok: true,
    title: typeof payload.title === "string" ? payload.title : undefined,
    summary: typeof payload.summary === "string" ? payload.summary : undefined,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  };
}

export async function submitPost(formData: FormData): Promise<CommunityPost> {
  const response = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      post?: CommunityPost;
    } | null;

    if (payload?.post) {
      return payload.post;
    }

    return {
      id: crypto.randomUUID(),
      title: String(formData.get("title") ?? "新しい魅力スポット"),
      summary: String(formData.get("summary") ?? "おすすめの場所です。"),
      lat: Number(formData.get("lat") ?? 35.681236),
      lng: Number(formData.get("lng") ?? 139.767125),
      photoUrl: String(
        formData.get("photoUrl") ??
          "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80",
      ),
      createdAt: new Date().toISOString(),
      capturedAt: String(formData.get("capturedAt") ?? "") || undefined,
      locationSource: (() => {
        const src = String(formData.get("locationSource") ?? "");
        return src === "exif" || src === "device" || src === "manual"
          ? (src as "exif" | "device" | "manual")
          : "fallback";
      })(),
      contentLicense:
        formData.get("contentLicense") === "cc-by-4.0"
          ? "cc-by-4.0"
          : "all-rights-reserved",
      tags: (() => {
        const rawTags = formData.get("tags");
        if (typeof rawTags !== "string") {
          return [];
        }

        try {
          const parsed = JSON.parse(rawTags) as unknown;
          return Array.isArray(parsed)
            ? parsed.filter((tag): tag is string => typeof tag === "string")
            : [];
        } catch {
          return [];
        }
      })(),
    };
  }

  const payload = (await response.json()) as { post?: CommunityPost };
  return (
    payload.post ?? {
      id: crypto.randomUUID(),
      title: "投稿しました",
      summary: "投稿を保存しました。",
      lat: 35.681236,
      lng: 139.767125,
      photoUrl:
        "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80",
      createdAt: new Date().toISOString(),
    }
  );
}
