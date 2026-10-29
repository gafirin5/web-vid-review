"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Send } from "lucide-react";

interface ReviewFormProps {
  mediaId: string;
  onTimestampPick?: (seconds: number) => void;
}

export default function ReviewForm({ mediaId }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(8);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/media/${mediaId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment || undefined,
          timestamp_seconds: timestamp ? parseFloat(timestamp) : undefined,
          author_name: name || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Gagal mengirim review");
      }
      setComment("");
      setTimestamp("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Star className="size-4 text-amber-400" /> Tulis Review
      </h3>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-zinc-400">Skor:</span>
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                n <= rating
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-sm font-semibold text-amber-400">{rating}/10</span>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Komentar review... (mis. detik 00:05 tangan karakter terdistorsi)"
        rows={3}
        className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama reviewer (opsional)"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <input
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
          placeholder="Detik video (mis. 12.5)"
          type="number"
          min="0"
          step="0.1"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-3 flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        <Send className="size-4" />
        {submitting ? "Mengirim..." : "Kirim Review"}
      </button>
    </form>
  );
}
