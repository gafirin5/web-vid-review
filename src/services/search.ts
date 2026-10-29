import { db } from "@/db/client";

/**
 * Pencarian relevansi ringan (TF-IDF-ish) tanpa model embedding.
 * Mendukung sinonim ID/EN, pencocokan prefix, dan bobot per-field.
 */

const STOPWORDS = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada", "adalah", "ini",
  "itu", "atau", "juga", "akan", "sudah", "telah", "tidak", "bisa", "dapat",
  "yang", "sebuah", "para", "oleh", "saat", "dalam", "ada",
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "with", "and", "or",
  "is", "are", "was", "were", "be", "been", "by", "as", "this", "that", "it",
  "from", "very", "some", "into", "than", "then", "so", "just",
]);

const SYNONYM_PAIRS: Array<[string, string]> = [
  ["kota", "city"], ["kota", "urban"], ["hujan", "rain"], ["malam", "night"],
  ["siang", "day"], ["kucing", "cat"], ["anjing", "dog"], ["manusia", "human"],
  ["potret", "portrait"], ["wajah", "face"], ["pemandangan", "landscape"],
  ["sinematik", "cinematic"], ["animasi", "animation"], ["3d", "render"],
  ["masa", "future"], ["depan", "future"], ["mobil", "car"], ["rumah", "house"],
  ["pohon", "tree"], ["laut", "sea"], ["gunung", "mountain"], ["matahari", "sun"],
  ["gelap", "dark"], ["terang", "bright"], ["warna", "color"],
];

const SYNONYM_MAP = new Map<string, Set<string>>();
for (const [a, b] of SYNONYM_PAIRS) {
  if (!SYNONYM_MAP.has(a)) SYNONYM_MAP.set(a, new Set());
  if (!SYNONYM_MAP.has(b)) SYNONYM_MAP.set(b, new Set());
  SYNONYM_MAP.get(a)!.add(b);
  SYNONYM_MAP.get(b)!.add(a);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function expand(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) {
    const syn = SYNONYM_MAP.get(t);
    if (syn) syn.forEach((s) => out.add(s));
  }
  return out;
}

interface SearchableMedia {
  id: string;
  title: string;
  description: string | null;
  prompt: string | null;
  transcript: string | null;
  tags: Array<{ tag: { name: string } }>;
}

const FIELD_WEIGHTS = {
  title: 4,
  tags: 3,
  prompt: 2.5,
  transcript: 2,
  description: 1.5,
};

function scoreMedia(queryTokens: Set<string>, phrases: string[], media: SearchableMedia): number {
  let score = 0;
  const fields: Array<[string, number]> = [
    [media.title, FIELD_WEIGHTS.title],
    [media.tags.map((t) => t.tag.name).join(" "), FIELD_WEIGHTS.tags],
    [media.prompt ?? "", FIELD_WEIGHTS.prompt],
    [media.transcript ?? "", FIELD_WEIGHTS.transcript],
    [media.description ?? "", FIELD_WEIGHTS.description],
  ];

  for (const [text, weight] of fields) {
    if (!text) continue;
    const lower = text.toLowerCase();
    const tokens = new Set(tokenize(lower));
    for (const q of queryTokens) {
      if (tokens.has(q)) score += weight;
      else if (Array.from(tokens).some((t) => t.startsWith(q) || q.startsWith(t))) {
        score += weight * 0.5; // partial match
      }
    }
    // Bonus frasa utuh
    for (const phrase of phrases) {
      if (phrase.length >= 4 && lower.includes(phrase)) score += weight * 1.5;
    }
  }

  return score;
}

export interface SearchHit {
  media: unknown;
  score: number;
}

/** Cari media berdasarkan relevansi teks. */
export async function searchMedia(
  query: string,
  options: { limit?: number; includeAllStatuses?: boolean } = {}
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const tokens = expand(tokenize(q));
  const phrases = [q.toLowerCase()];

  const candidates = await db.prisma.media.findMany({
    where: {
      ...(options.includeAllStatuses ? {} : { status: "APPROVED" }),
    },
    include: {
      agent: { select: { id: true, name: true, modelProvider: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500, // kandidat maksimal untuk diskoring
  });

  return candidates
    .map((m) => ({ media: m, score: scoreMedia(tokens, phrases, m) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20);
}