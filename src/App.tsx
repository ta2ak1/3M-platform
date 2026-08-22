import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PostForm } from "./components/PostForm";
import { PostMap } from "./components/PostMap";
import { LegalNotice } from "./components/LegalNotice";
import { fetchAdminPlaces, fetchPosts, submitPost } from "./lib/api";
import type { BboxQuery } from "./lib/api";
import type { AdminPlace, CommunityPost } from "./types";

const DEFAULT_LOCATION = { lat: 35.681236, lng: 139.767125 };
type Location = typeof DEFAULT_LOCATION;

function App() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [adminPlaces, setAdminPlaces] = useState<AdminPlace[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [formLocation, setFormLocation] = useState<Location | null>(null);
  const [initialMapLocation, setInitialMapLocation] =
    useState<Location | null>(null);
  const [isResolvingInitialLocation, setIsResolvingInitialLocation] =
    useState(true);
  const [seedCount, setSeedCount] = useState(0);
  const [visibleSeedCount, setVisibleSeedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapBbox, setMapBbox] = useState<BboxQuery | null>(null);
  const mapBboxRef = useRef<BboxQuery | null>(null);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );

  const selectedAiTags = selectedPost?.aiTags ?? [];
  const selectedHumanTags = selectedPost?.humanTags ?? selectedPost?.tags ?? [];

  const loadPosts = useCallback(async (bbox?: BboxQuery | null) => {
    setIsLoading(true);
    try {
      const [nextPosts, nextAdminPlacesResponse] = await Promise.all([
        fetchPosts(bbox ?? undefined),
        fetchAdminPlaces(bbox ?? undefined),
      ]);

      setPosts(nextPosts);
      setAdminPlaces(nextAdminPlacesResponse.places);
      setSeedCount(nextAdminPlacesResponse.count);
      setVisibleSeedCount(nextAdminPlacesResponse.visibleCount);
      setErrorMessage(null);
    } catch {
      setErrorMessage(
        "投稿データの取得に失敗しました。少し時間を置いて再読み込みしてください。",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleBoundsChange = useCallback((bbox: BboxQuery) => {
    mapBboxRef.current = bbox;
    setMapBbox(bbox);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setInitialMapLocation(DEFAULT_LOCATION);
      setFormLocation(DEFAULT_LOCATION);
      setIsResolvingInitialLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setInitialMapLocation(nextLocation);
        setFormLocation(nextLocation);
        setIsResolvingInitialLocation(false);
      },
      () => {
        setInitialMapLocation(DEFAULT_LOCATION);
        setFormLocation(DEFAULT_LOCATION);
        setIsResolvingInitialLocation(false);
      },
      { timeout: 5000, enableHighAccuracy: false },
    );
  }, []);

  // mapBbox が変化したら再取得（初期表示時を含む）
  useEffect(() => {
    if (mapBbox) {
      void loadPosts(mapBbox);
    }
  }, [mapBbox, loadPosts]);

  const handleLocationPick = useCallback(
    (location: { lat: number; lng: number }) => {
      setFormLocation(location);
      setSelectedPostId(null);
    },
    [],
  );

  const handleSelectPost = useCallback((post: CommunityPost | null) => {
    setSelectedPostId(post?.id ?? null);
    if (post) {
      setFormLocation({ lat: post.lat, lng: post.lng });
    }
  }, []);

  const handleSubmit = useCallback(async (formData: FormData) => {
    const createdPost = await submitPost(formData);
    setPosts((current) => [createdPost, ...current]);
    setSelectedPostId(createdPost.id);
    setFormLocation({ lat: createdPost.lat, lng: createdPost.lng });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-primary px-4 py-5 text-white shadow-lg shadow-slate-300/40">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                3M Platform
              </p>
              <h1 className="mt-2 text-2xl font-bold md:text-4xl">
                地域のいいね！
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-50">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                行政シード {seedCount.toLocaleString("ja-JP")}件 / 表示中{" "}
                {visibleSeedCount.toLocaleString("ja-JP")}件
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                市民投稿 {posts.length}件
              </span>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-emerald-50 md:text-base">
            行政のオープンデータと市民の発見を結び、地域の魅力を写真と一言で共有するマップサービスです。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 xl:px-8">
        {errorMessage ? (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">最近の投稿</h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {posts.length}件
              </span>
            </div>

            <div className="flex-1 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  読み込み中です…
                </div>
              ) : posts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  まだ投稿はありません。最初の魅力を共有しましょう。
                </div>
              ) : (
                posts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handleSelectPost(post)}
                    className={`w-full overflow-hidden rounded-2xl border text-left transition duration-200 ${
                      selectedPost?.id === post.id
                        ? "border-primary bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex gap-3 p-3">
                      <img
                        src={post.photoUrl}
                        alt={post.title}
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {post.title}
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">
                          {post.summary}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(post.humanTags ?? post.tags ?? [])
                            .slice(0, 3)
                            .map((tag) => (
                              <span
                                key={`${post.id}-${tag}`}
                                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                              >
                                #{tag}
                              </span>
                            ))}
                          {(post.aiTags ?? []).length > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              AI候補 {(post.aiTags ?? []).length}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400">
                          {new Date(post.createdAt).toLocaleDateString(
                            "ja-JP",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">投稿詳細</h3>
                {selectedPost ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    選択中
                  </span>
                ) : null}
              </div>

              {selectedPost ? (
                <div className="mt-3 space-y-3">
                  <img
                    src={selectedPost.photoUrl}
                    alt={selectedPost.title}
                    className="h-36 w-full rounded-xl object-cover"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {selectedPost.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {selectedPost.summary}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      人が修正した最終タグ
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedHumanTags.length > 0 ? (
                        selectedHumanTags.map((tag) => (
                          <span
                            key={`human-${selectedPost.id}-${tag}`}
                            className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">
                          まだ最終タグがありません。
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      AI候補
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedAiTags.length > 0 ? (
                        selectedAiTags.map((tag) => (
                          <span
                            key={`ai-${selectedPost.id}-${tag}`}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">
                          まだAI候補がありません。
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  投稿を選ぶと、AI候補と人が確定した最終タグを確認できます。
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-lg font-bold text-slate-900">マップ</h2>
                <span className="text-xs font-medium text-slate-500">
                  クリックで投稿位置を指定できます
                </span>
              </div>
              <div className="h-[540px] w-full">
                {isResolvingInitialLocation || !initialMapLocation ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
                    現在地を確認しています...
                  </div>
                ) : (
                  <PostMap
                    posts={posts}
                    adminPlaces={adminPlaces}
                    initialCenter={initialMapLocation}
                    draftLocation={
                      selectedPostId ? undefined : formLocation ?? undefined
                    }
                    selectedPostId={selectedPostId}
                    onSelectPost={handleSelectPost}
                    onLocationPick={handleLocationPick}
                    onBoundsChange={handleBoundsChange}
                  />
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    投稿フォーム
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    この場所を紹介する
                  </h2>
                </div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {formLocation
                    ? `${formLocation.lat.toFixed(5)}, ${formLocation.lng.toFixed(5)}`
                    : "現在地を確認中..."}
                </div>
              </div>

              <PostForm
                onSubmit={handleSubmit}
                defaultLocation={formLocation ?? DEFAULT_LOCATION}
              />
            </div>
          </section>
        </div>
      </main>
      <LegalNotice />
    </div>
  );
}

export default App;
