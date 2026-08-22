import { useEffect, useMemo, useState } from "react";
import exifr from "exifr";
import { precheckPost } from "../lib/api";
import {
  isTurnstileEnabled,
  TurnstileWidget,
} from "./TurnstileWidget";

type LocationSource = "exif" | "device" | "fallback";
type PostMode = "photo" | "text";

async function readExifLocation(
  file: File,
): Promise<{
  latitude: number;
  longitude: number;
  capturedAt?: string;
} | null> {
  try {
    const result = (await exifr.parse(file, {
      gps: true,
      pick: ["latitude", "longitude", "DateTimeOriginal"],
    })) as
      | { latitude?: number; longitude?: number; DateTimeOriginal?: Date }
      | undefined;

    if (!result || result.latitude == null || result.longitude == null) {
      return null;
    }

    return {
      latitude: result.latitude,
      longitude: result.longitude,
      capturedAt:
        result.DateTimeOriginal instanceof Date
          ? result.DateTimeOriginal.toISOString()
          : undefined,
    };
  } catch {
    return null;
  }
}

function getDeviceLocation(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: false },
    );
  });
}

async function createAiSafePhoto(file: File): Promise<File> {
  const imageElement = await new Promise<HTMLImageElement>(
    (resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("image_load_failed"));
      };
      img.src = objectUrl;
    },
  );

  const maxDimension = 800;
  const scale = Math.min(
    1,
    maxDimension / Math.max(imageElement.width, imageElement.height),
  );
  const width = Math.max(1, Math.round(imageElement.width * scale));
  const height = Math.max(1, Math.round(imageElement.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(imageElement, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("blob_conversion_failed"));
          return;
        }
        resolve(nextBlob);
      },
      "image/jpeg",
      0.6,
    );
  });

  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#/, "")
    .replace(/[　\s]+/g, " ");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))].filter(
    (tag) => tag.length <= 20,
  );
}

function parseTagInput(value: string): string[] {
  return normalizeTags(
    value
      .split(/[\s,、，]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

interface PostFormProps {
  onSubmit: (formData: FormData) => Promise<void>;
  defaultLocation?: { lat: number; lng: number };
}

export function PostForm({ onSubmit, defaultLocation }: PostFormProps) {
  const [postMode, setPostMode] = useState<PostMode>("photo");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSource, setLocationSource] =
    useState<LocationSource>("fallback");
  const [capturedAt, setCapturedAt] = useState<string | undefined>(undefined);
  const [resolvedLat, setResolvedLat] = useState<number | undefined>(undefined);
  const [resolvedLng, setResolvedLng] = useState<number | undefined>(undefined);
  const [reviewStep, setReviewStep] = useState<"editing" | "reviewing">(
    "editing",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [hasAcceptedPostTerms, setHasAcceptedPostTerms] = useState(false);
  const [isCcByLicensed, setIsCcByLicensed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const finalTags = useMemo(() => normalizeTags(selectedTags), [selectedTags]);
  const turnstileEnabled = isTurnstileEnabled();

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  const resetReviewState = (nextMessage?: string) => {
    setReviewStep("editing");
    setReviewMessage("");
    setReviewWarnings([]);
    setSuggestedTags([]);
    if (nextMessage) {
      setErrorMessage(nextMessage);
    }
  };

  const addTagsFromInput = () => {
    const nextTags = parseTagInput(tagInput);
    if (nextTags.length === 0) {
      return;
    }

    setSelectedTags((current) => normalizeTags([...current, ...nextTags]));
    setTagInput("");
  };

  const resetDraft = (nextMessage?: string) => {
    setReviewStep("editing");
    setReviewMessage("");
    setReviewWarnings([]);
    setSuggestedTags([]);
    setSelectedTags([]);
    setTurnstileToken("");
    if (nextMessage) {
      setErrorMessage(nextMessage);
    } else {
      setErrorMessage("");
    }
  };

  const clearFileInput = () => {
    const fileInput = document.getElementById(
      "post-photo",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const resetForm = () => {
    setTitle("");
    setSummary("");
    setPhotoFile(null);
    setLocationSource("fallback");
    setCapturedAt(undefined);
    setResolvedLat(undefined);
    setResolvedLng(undefined);
    setSuggestedTags([]);
    setReviewWarnings([]);
    setSelectedTags([]);
    setTagInput("");
    setHasAcceptedPostTerms(false);
    setIsCcByLicensed(false);
    setTurnstileToken("");
    setTurnstileResetKey((current) => current + 1);
    setReviewStep("editing");
    setReviewMessage("");
    setErrorMessage("");
    clearFileInput();
  };

  const handlePrecheck = async () => {
    if (postMode === "photo" && !photoFile) {
      setErrorMessage("投稿する写真を選択してください。");
      return;
    }

    if (postMode === "text" && (!title.trim() || !summary.trim())) {
      setErrorMessage("写真なし投稿ではタイトルと一言を入力してください。");
      return;
    }

    const precheckFormData = new FormData();
    precheckFormData.set("mode", postMode);
    precheckFormData.set("title", title.trim());
    precheckFormData.set("comment", summary.trim());
    if (postMode === "photo" && photoFile) {
      precheckFormData.set("photo", await createAiSafePhoto(photoFile));
    }

    setIsChecking(true);
    setErrorMessage("");

    try {
      const precheckResult = await precheckPost(precheckFormData);

      if (!precheckResult.ok) {
        setSuggestedTags([]);
        setSelectedTags([]);
        setReviewStep("editing");
        setReviewMessage("");
        setErrorMessage(
          precheckResult.message ??
            "この画像は投稿対象として適さない可能性があります。",
        );
        return;
      }

      const nextTags = normalizeTags(precheckResult.tags ?? []);
      if (precheckResult.title) {
        setTitle(precheckResult.title);
      }
      if (precheckResult.summary) {
        setSummary(precheckResult.summary);
      }
      setSuggestedTags(nextTags);
      setReviewWarnings(precheckResult.warnings ?? []);
      setSelectedTags((current) =>
        normalizeTags(current.length > 0 ? current : nextTags),
      );
      setReviewMessage(
        precheckResult.requiresReview
          ? "AIが公開前に確認したい点を検出しました。内容を確認してから投稿してください。"
          : postMode === "photo"
          ? "写真から作った下書きです。内容を確認して編集できます。"
          : "文章からタグ候補を作りました。内容を確認して投稿できます。",
      );
      setReviewStep("reviewing");
    } finally {
      setIsChecking(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!title.trim() || !summary.trim()) {
      setErrorMessage("タイトルと一言は必須です。");
      return;
    }

    if (postMode === "photo" && !photoFile) {
      setErrorMessage("投稿する写真を選択してください。");
      return;
    }

    if (!hasAcceptedPostTerms) {
      setErrorMessage("投稿規約と位置情報の公開について確認してください。");
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage("セキュリティ確認を完了してください。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const lat = resolvedLat ?? defaultLocation?.lat ?? 35.681236;
      const lng = resolvedLng ?? defaultLocation?.lng ?? 139.767125;

      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("summary", summary.trim());
      formData.set("lat", String(lat));
      formData.set("lng", String(lng));
      if (postMode === "photo" && photoFile) {
        formData.set("photo", photoFile);
      }
      formData.set("aiTags", JSON.stringify(suggestedTags));
      formData.set("humanTags", JSON.stringify(finalTags));
      formData.set("tags", JSON.stringify(finalTags));
      if (capturedAt) {
        formData.set("capturedAt", capturedAt);
      }
      formData.set("locationSource", locationSource);
      formData.set(
        "contentLicense",
        isCcByLicensed ? "cc-by-4.0" : "all-rights-reserved",
      );
      if (turnstileToken) {
        formData.set("cf-turnstile-response", turnstileToken);
      }

      await onSubmit(formData);

      setTitle("");
      setSummary("");
      setPhotoFile(null);
      setSuggestedTags([]);
      setReviewWarnings([]);
      setSelectedTags([]);
      setTagInput("");
      setHasAcceptedPostTerms(false);
      setIsCcByLicensed(false);
      setTurnstileToken("");
      setTurnstileResetKey((current) => current + 1);
      setReviewStep("editing");
      setReviewMessage("");
      clearFileInput();
    } finally {
      if (turnstileEnabled) {
        setTurnstileToken("");
        setTurnstileResetKey((current) => current + 1);
      }
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (reviewStep === "reviewing") {
      await handleFinalSubmit();
      return;
    }

    await handlePrecheck();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {[
          ["photo", "写真から投稿"],
          ["text", "写真なしで投稿"],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              const nextMode = mode as PostMode;
              setPostMode(nextMode);
              resetDraft();
              if (nextMode === "text") {
                setPhotoFile(null);
                setLocationSource("fallback");
                setCapturedAt(undefined);
                setResolvedLat(undefined);
                setResolvedLng(undefined);
                clearFileInput();
              }
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              postMode === mode
                ? "bg-white text-primary shadow-sm"
                : "text-slate-600 hover:bg-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {postMode === "text" || reviewStep === "reviewing" ? (
        <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          タイトル
        </label>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="例: 夕暮れの駅前の小さな広場"
          maxLength={60}
        />
        </div>
      ) : null}

      {postMode === "text" || reviewStep === "reviewing" ? (
        <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          一言
        </label>
        <textarea
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
          }}
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="おすすめの理由や見どころを一言で"
          maxLength={200}
        />
        </div>
      ) : null}

      {postMode === "photo" ? (
        <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          写真
        </label>
        <input
          id="post-photo"
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0] ?? null;
            setPhotoFile(file);
            if (reviewStep === "reviewing") {
              resetReviewState(
                "写真を変更したので、AI確認をやり直してください。",
              );
            }
            if (!file) {
              setLocationSource("fallback");
              setCapturedAt(undefined);
              setResolvedLat(undefined);
              setResolvedLng(undefined);
              return;
            }

            setIsLocating(true);
            try {
              const exif = await readExifLocation(file);
              if (exif) {
                setResolvedLat(exif.latitude);
                setResolvedLng(exif.longitude);
                setCapturedAt(exif.capturedAt ?? new Date().toISOString());
                setLocationSource("exif");
                return;
              }

              const device = await getDeviceLocation();
              if (device) {
                setResolvedLat(device.latitude);
                setResolvedLng(device.longitude);
                setCapturedAt(new Date().toISOString());
                setLocationSource("device");
                return;
              }

              setCapturedAt(new Date().toISOString());
              setLocationSource("fallback");
              setResolvedLat(undefined);
              setResolvedLng(undefined);
            } finally {
              setIsLocating(false);
            }
          }}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {isLocating && (
          <p className="mt-1 text-xs text-slate-500">位置情報を取得中...</p>
        )}
        {!isLocating && photoFile && (
          <p className="mt-1 text-xs text-slate-500">
            取得元：
            <span
              className={`ml-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                locationSource === "exif"
                  ? "bg-emerald-100 text-emerald-700"
                  : locationSource === "device"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {locationSource === "exif"
                ? "EXIF"
                : locationSource === "device"
                  ? "デバイス位置"
                  : "デフォルト"}
            </span>
          </p>
        )}
        </div>
      ) : null}

      {reviewStep === "reviewing" ? (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            {postMode === "photo" ? (
              <div className="lg:w-44">
              <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
                {photoPreviewUrl ? (
                  <img
                    src={photoPreviewUrl}
                    alt="投稿予定の写真"
                    className="h-40 w-full object-cover"
                  />
                ) : null}
              </div>
              </div>
            ) : null}

            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  ヒューマンインザループ
                </p>
                <p className="mt-1 text-sm text-slate-700">{reviewMessage}</p>
              </div>

              {reviewWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-sm font-semibold text-amber-800">
                    公開前に確認してください
                  </div>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">
                    {reviewWarnings.map((warning) => (
                      <li key={warning}>・{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-xl border border-emerald-100 bg-white p-3">
                <div className="text-sm font-semibold text-slate-800">
                  AI候補タグ
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedTags.length > 0 ? (
                    suggestedTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setSelectedTags((current) =>
                              current.includes(tag)
                                ? current.filter((item) => item !== tag)
                                : [...current, tag],
                            );
                          }}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isSelected
                              ? "border-primary bg-primary text-white"
                              : "border-primary/20 bg-primary/5 text-primary"
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-sm text-slate-500">
                      AI候補がありませんでした。手動で追加してください。
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-800">
                    最終タグ
                  </div>
                  <span className="text-xs text-slate-500">
                    クリックで削除できます
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {finalTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSelectedTags((current) =>
                          current.filter((item) => item !== tag),
                        );
                      }}
                      className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTagsFromInput();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="タグを追加（空白・カンマ区切り可）"
                    maxLength={20}
                  />
                  <button
                    type="button"
                    onClick={addTagsFromInput}
                    className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
                  >
                    追加
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                この内容でよければ、最後に人が確認して投稿してください。
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {reviewStep === "reviewing" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={hasAcceptedPostTerms}
            onChange={(event) => setHasAcceptedPostTerms(event.target.checked)}
            className="mt-1"
          />
          <span>
            投稿内容に必要な権利を持ち、人物・第三者著作物・位置情報の公開に必要な確認を済ませ、運営に必要な非独占的利用許諾に同意します。
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={isCcByLicensed}
            onChange={(event) => setIsCcByLicensed(event.target.checked)}
            className="mt-1"
          />
          <span>
            この投稿をCC BY 4.0で公開する（任意）。第三者による出典表示付きの商用利用・改変・再配布を許可します。
          </span>
        </label>
        </div>
      ) : null}

      {reviewStep === "editing" && suggestedTags.length > 0 ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">
            タグ候補
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setSelectedTags((current) =>
                      current.includes(tag)
                        ? current.filter((item) => item !== tag)
                        : [...current, tag],
                    );
                  }}
                  className={`rounded-full border px-2 py-1 text-xs transition ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-primary/20 bg-primary/5 text-primary"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {reviewStep === "reviewing" ? (
        <TurnstileWidget
          key={turnstileResetKey}
          onVerify={(token) => {
            setTurnstileToken(token);
            setErrorMessage("");
          }}
          onExpire={() => {
            setTurnstileToken("");
            setErrorMessage("セキュリティ確認の有効期限が切れました。");
          }}
          onError={() => {
            setTurnstileToken("");
            setErrorMessage(
              "セキュリティ確認に失敗しました。再読み込みして再度お試しください。",
            );
          }}
        />
      ) : null}

      <button
        type="submit"
        disabled={
          isSubmitting ||
          isChecking ||
          (reviewStep === "reviewing" && turnstileEnabled && !turnstileToken)
        }
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isChecking
          ? postMode === "photo"
            ? "AI下書き中..."
            : "タグ提案中..."
          : isSubmitting
            ? "投稿中..."
            : reviewStep === "reviewing"
              ? "内容を確認して投稿する"
              : postMode === "photo"
                ? "AIで下書きを作成する"
                : "AIでタグを提案する"}
      </button>

      {reviewStep === "reviewing" ? (
        <button
          type="button"
          onClick={() => {
            setReviewStep("editing");
            setReviewMessage("");
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          編集に戻る
        </button>
      ) : null}

      {reviewStep === "reviewing" ? (
        <button
          type="button"
          onClick={resetForm}
          className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          投稿をやめてフォームをリセットする
        </button>
      ) : null}
    </form>
  );
}
