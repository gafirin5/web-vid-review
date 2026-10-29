/**
 * Validasi magic bytes — memastikan isi file sesuai ekstensinya.
 * Mencegah upload file berbahaya dengan ekstensi palsu.
 */

export interface SignatureCheck {
  valid: boolean;
  reason?: string;
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function asciiAt(buf: Buffer, str: string, offset = 0): boolean {
  if (buf.length < offset + str.length) return false;
  return str === buf.toString("ascii", offset, offset + str.length);
}

/** Cek apakah buffer cocok dengan signature untuk ekstensi tertentu. */
export function checkFileSignature(buffer: Buffer, ext: string): SignatureCheck {
  const extLower = ext.toLowerCase();

  switch (extLower) {
    case "jpg":
    case "jpeg":
      return startsWith(buffer, [0xff, 0xd8, 0xff])
        ? { valid: true }
        : { valid: false, reason: "Bukan file JPEG yang valid" };
    case "png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ? { valid: true }
        : { valid: false, reason: "Bukan file PNG yang valid" };
    case "gif":
      return asciiAt(buffer, "GIF8")
        ? { valid: true }
        : { valid: false, reason: "Bukan file GIF yang valid" };
    case "webp":
      return asciiAt(buffer, "RIFF") && asciiAt(buffer, "WEBP", 8)
        ? { valid: true }
        : { valid: false, reason: "Bukan file WebP yang valid" };
    case "avif":
      return asciiAt(buffer, "ftyp", 4)
        ? { valid: true }
        : { valid: false, reason: "Bukan file AVIF/ISO-BMFF yang valid" };
    case "bmp":
      return asciiAt(buffer, "BM")
        ? { valid: true }
        : { valid: false, reason: "Bukan file BMP yang valid" };
    case "mp4":
    case "m4v":
    case "mov":
      return asciiAt(buffer, "ftyp", 4) ||
        asciiAt(buffer, "moov", 4) ||
        asciiAt(buffer, "mdat", 4)
        ? { valid: true }
        : { valid: false, reason: "Bukan file video MP4/MOV yang valid" };
    case "webm":
    case "mkv":
      return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])
        ? { valid: true }
        : { valid: false, reason: "Bukan file WebM/MKV yang valid" };
    case "avi":
      return asciiAt(buffer, "RIFF") && asciiAt(buffer, "AVI ", 8)
        ? { valid: true }
        : { valid: false, reason: "Bukan file AVI yang valid" };
    case "ogv":
      return asciiAt(buffer, "OggS")
        ? { valid: true }
        : { valid: false, reason: "Bukan file OGV yang valid" };
    case "svg":
      return { valid: false, reason: "SVG tidak diizinkan (potensi risiko keamanan)" };
    default:
      return { valid: false, reason: `Format .${ext} tidak didukung` };
  }
}