import { useState } from "react";
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

interface PostFormProps {
  onSubmit: (formData: FormData) => Promise<void>;
  defaultLocation?: { lat: number; lng: number };
}

export function PostForm({ onSubmit, defaultLocation }: PostFormProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        setErrorMessage(
          precheckResult.message ??
            "この画像は投稿対象として適さない可能性があります。",
        );
        setSuggestedTags([]);
        return;
      }

      const nextTags = precheckResult.tags ?? [];
      const finalTags = selectedTags.length > 0 ? selectedTags : nextTags;
      setSuggestedTags(nextTags);
      setSelectedTags(finalTags);

      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("summary", summary.trim());
      formData.set("lat", String(defaultLocation?.lat ?? 35.681236));
      formData.set("lng", String(defaultLocation?.lng ?? 139.767125));
      formData.set("photo", photoFile);
      formData.set("tags", JSON.stringify(finalTags));

      setIsSubmitting(true);
      await onSubmit(formData);

      setTitle("");
      setSummary("");
      setPhotoFile(null);
      setSuggestedTags([]);
      setSelectedTags([]);
      const fileInput = document.getElementById(
        "post-photo",
      ) as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
    } finally {
      setIsChecking(false);
      setIsSubmitting(false);
    }
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
          onChange={(event) => setTitle(event.target.value)}
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
          onChange={(event) => setSummary(event.target.value)}
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
          onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {suggestedTags.length > 0 ? (
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
            : "魅力を投稿する"}
      </button>
    </form>
  );
}
