import { useState } from "react";

interface PostFormProps {
  onSubmit: (formData: FormData) => Promise<void>;
  defaultLocation?: { lat: number; lng: number };
}

export function PostForm({ onSubmit, defaultLocation }: PostFormProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!title.trim() || !summary.trim()) {
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("summary", summary.trim());
    formData.set("lat", String(defaultLocation?.lat ?? 35.681236));
    formData.set("lng", String(defaultLocation?.lng ?? 139.767125));

    if (photoFile) {
      formData.set("photo", photoFile);
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setTitle("");
      setSummary("");
      setPhotoFile(null);
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "投稿中..." : "魅力を投稿する"}
      </button>
    </form>
  );
}
