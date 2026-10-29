import sharp from "sharp";

/**
 * Smart Media Intelligence (v0.5)
 * Auto-tagging heuristik + deteksi konten sensitif + ekstraksi keyword.
 * Berjalan 100% offline tanpa model ML eksternal.
 */

// ---------- Stopwords (ID + EN) ----------
const STOPWORDS = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada", "adalah", "ini",
  "itu", "atau", "juga", "akan", "sudah", "telah", "tidak", "bisa", "dapat",
  "sebuah", "para", "oleh", "saat", "dalam", "ada", "aku", "kamu", "dia",
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "with", "and", "or",
  "is", "are", "was", "were", "be", "been", "by", "as", "this", "that", "it",
  "from", "very", "some", "into", "than", "then", "so", "just", "make", "made",
]);

// ---------- Kamus sinonim sederhana (untuk auto-tag & pencarian) ----------
const SYNONYMS: Record<string, string[]> = {
  kota: ["city", "urban", "metropolitan"],
  hujan: ["rain", "rainy", "storm"],
  malam: ["night", "dark", "noir"],
  siang: ["day", "daylight", "bright"],
  kucing: ["cat", "kitten"],
  anjing: ["dog", "puppy"],
  manusia: ["human", "person", "people"],
  potret: ["portrait", "wajah", "face"],
  pemandangan: ["landscape", "scenery", "vista"],
  sinematik: ["cinematic", "movie", "film"],
  masa_depan: ["futuristic", "future", "cyber"],
  animasi: ["animation", "animated", "cartoon"],
  tiga_dimensi: ["3d", "render", "cg"],
};

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Ekstrak keyword unggulan dari teks bebas (judul/deskripsi/prompt). */
export function extractKeywords(text: string, limit = 4): string[] {
  const freq = new Map<string, number>();
  for (const w of normalize(text)) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

// ---------- Analisis visual via thumbnail ----------
export interface VisualInfo {
  brightness: number; // 0-255
  dominantColor: string | null; // nama warna
}

const COLOR_NAMES: Array<{ name: string; r: number; g: number; b: number }> = [
  { name: "red", r: 220, g: 50, b: 50 },
  { name: "orange", r: 240, g: 140, b: 40 },
  { name: "yellow", r: 240, g: 220, b: 60 },
  { name: "green", r: 70, g: 190, b: 90 },
  { name: "cyan", r: 60, g: 200, b: 210 },
  { name: "blue", r: 70, g: 120, b: 230 },
  { name: "purple", r: 150, g: 80, b: 220 },
  { name: "pink", r: 240, g: 120, b: 180 },
  { name: "brown", r: 140, g: 100, b: 70 },
];

function nearestColorName(r: number, g: number, b: number): string | null {
  // jika grayscale → monochrome
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 25) return "monochrome";
  let best = COLOR_NAMES[0];
  let bestDist = Infinity;
  for (const c of COLOR_NAMES) {
    const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.name;
}

/** Analisis thumbnail: brightness + warna dominan. */
export async function analyzeThumbnail(thumbPath: string): Promise<VisualInfo | null> {
  try {
    const [stats, pixel] = await Promise.all([
      sharp(thumbPath).stats(),
      sharp(thumbPath).resize(1, 1).raw().toBuffer(),
    ]);
    const brightness = Math.round(
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3
    );
    return {
      brightness,
      dominantColor: nearestColorName(pixel[0], pixel[1], pixel[2]),
    };
  } catch {
    return null;
  }
}

// ---------- Auto-tagging ----------
export interface AutoTagInput {
  mediaType: "IMAGE" | "VIDEO";
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  hasAudio?: boolean;
  thumbPath?: string | null; // path absolut thumbnail (jika ada)
  prompt?: string | null;
  title?: string;
  description?: string | null;
}

/** Hasilkan tag otomatis dari heuristik visual + teks. */
export async function generateAutoTags(input: AutoTagInput): Promise<string[]> {
  const tags = new Set<string>();

  // Orientasi
  if (input.width && input.height) {
    const ratio = input.width / input.height;
    if (ratio > 1.2) tags.add("landscape");
    else if (ratio < 0.83) tags.add("portrait");
    else tags.add("square");
    if (input.width >= 3800) tags.add("high-res");
  }

  // Visual (dari thumbnail)
  if (input.thumbPath) {
    const v = await analyzeThumbnail(input.thumbPath);
    if (v) {
      if (v.dominantColor) tags.add(v.dominantColor);
      if (v.brightness < 70) tags.add("dark");
      else if (v.brightness > 180) tags.add("bright");
    }
  }

  // Video-specific
  if (input.mediaType === "VIDEO") {
    const d = input.durationSeconds ?? 0;
    if (d > 0 && d <= 15) tags.add("short-clip");
    else if (d > 60) tags.add("long-video");
    if (input.hasAudio) tags.add("with-audio");
    else tags.add("silent");
  }

  // Keyword dari prompt/judul/deskripsi
  const textBlob = [input.prompt ?? "", input.title ?? "", input.description ?? ""]
    .filter(Boolean)
    .join(" ");
  for (const kw of extractKeywords(textBlob, 3)) {
    tags.add(kw);
    // Tambahkan sinonim dari kamus
    if (SYNONYMS[kw]) SYNONYMS[kw].forEach((s) => tags.add(s));
  }

  return Array.from(tags).slice(0, 12);
}

// ---------- Deteksi konten sensitif ----------
const SENSITIVE_KEYWORDS = [
  "nsfw", "nude", "nudity", "naked", "explicit", "porn", "xxx", "gore",
  "blood", "sensual", "erotis", "telanjang", "darah", "kekerasan eksplisit",
];

/** Deteksi keyword sensitif pada teks metadata. */
export function detectSensitive(texts: Array<string | null | undefined>): boolean {
  const blob = texts.filter(Boolean).join(" ").toLowerCase();
  return SENSITIVE_KEYWORDS.some((k) => blob.includes(k));
}
