import { useEffect, useMemo, useState } from "react";
import { precheckPost } from "../lib/api";

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
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [reviewStep, setReviewStep] = useState<"editing" | "reviewing">(
    "editing",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const finalTags = useMemo(() => normalizeTags(selectedTags), [selectedTags]);

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

  const handlePrecheck = async () => {
    if (!title.trim() || !summary.trim()) {
      setErrorMessage("タイトルと一言は必須です。");
      return;
    }

    if (!photoFile) {
      setErrorMessage("投稿する写真を選択してください。");
      return;
    }

    const precheckFormData = new FormData();
    precheckFormData.set("title", title.trim());
    precheckFormData.set("comment", summary.trim());
    precheckFormData.set("photo", await createAiSafePhoto(photoFile));

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
      setSuggestedTags(nextTags);
      setSelectedTags((current) =>
        normalizeTags(current.length > 0 ? current : nextTags),
      );
      setReviewMessage("AIの提案を確認し、人が最終判断する段階です。");
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

    if (!photoFile) {
      setErrorMessage("投稿する写真を選択してください。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("summary", summary.trim());
      formData.set("lat", String(defaultLocation?.lat ?? 35.681236));
      formData.set("lng", String(defaultLocation?.lng ?? 139.767125));
      formData.set("photo", photoFile);
      formData.set("aiTags", JSON.stringify(suggestedTags));
      formData.set("humanTags", JSON.stringify(finalTags));
      formData.set("tags", JSON.stringify(finalTags));

      await onSubmit(formData);

      setTitle("");
      setSummary("");
      setPhotoFile(null);
      setSuggestedTags([]);
      setSelectedTags([]);
      setTagInput("");
      setReviewStep("editing");
      setReviewMessage("");
      const fileInput = document.getElementById(
        "post-photo",
      ) as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
    } finally {
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
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          タイトル
        </label>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (reviewStep === "reviewing") {
              resetReviewState(
                "内容を修正したので、AI確認をやり直してください。",
              );
            }
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="例: 夕暮れの駅前の小さな広場"
          maxLength={60}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          一言
        </label>
        <textarea
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
            if (reviewStep === "reviewing") {
              resetReviewState(
                "内容を修正したので、AI確認をやり直してください。",
              );
            }
          }}
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="おすすめの理由や見どころを一言で"
          maxLength={200}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">
          写真
        </label>
        <input
          id="post-photo"
          type="file"
          accept="image/*"
          onChange={(event) => {
            setPhotoFile(event.target.files?.[0] ?? null);
            if (reviewStep === "reviewing") {
              resetReviewState(
                "写真を変更したので、AI確認をやり直してください。",
              );
            }
          }}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </div>

      {reviewStep === "reviewing" ? (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-col gap-4 lg:flex-row">
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

            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  ヒューマンインザループ
                </p>
                <p className="mt-1 text-sm text-slate-700">{reviewMessage}</p>
              </div>

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

      <button
        type="submit"
        disabled={isSubmitting || isChecking}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isChecking
          ? "AI判定中..."
          : isSubmitting
            ? "投稿中..."
            : reviewStep === "reviewing"
              ? "内容を確認して投稿する"
              : "AIで下書きを作成する"}
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
    </form>
  );
}
