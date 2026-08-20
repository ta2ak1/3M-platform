import type { AdminPlace, CommunityPost } from "../types";
import { mockPosts } from "./mockData";

const API_BASE = "/api";

export async function fetchAdminPlaces(): Promise<AdminPlace[]> {
  const response = await fetch(`${API_BASE}/seed`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    places?: AdminPlace[];
    count?: number;
  };

  return payload.places ?? [];
}

export async function fetchPosts(): Promise<CommunityPost[]> {
  const response = await fetch(`${API_BASE}/posts`, {
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
  tags: string[];
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/posts/precheck`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
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
