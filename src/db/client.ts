import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

type Prisma = ReturnType<typeof createPrisma>;

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

/**
 * Prisma client container. `db.prisma` dapat di-swap saat runtime
 * (dipakai oleh restore backup agar koneksi database diperbarui).
 */
class DbContainer {
  private _prisma: Prisma;
  private readonly globalKey = Symbol.for("wvr.prisma");

  constructor() {
    const g = globalThis as unknown as Record<symbol, Prisma | undefined>;
    this._prisma = g[this.globalKey] ?? createPrisma();
    g[this.globalKey] = this._prisma;
  }

  get prisma(): Prisma {
    return this._prisma;
  }

  /** Tutup koneksi saat ini dan buat koneksi baru (mis. setelah restore DB). */
  async reset(): Promise<void> {
    try {
      await this._prisma.$disconnect();
    } catch {
      // abaikan error disconnect
    }
    this._prisma = createPrisma();
    const g = globalThis as unknown as Record<symbol, Prisma | undefined>;
    g[this.globalKey] = this._prisma;
  }
}

export const db = new DbContainer();

/** Kompatibilitas untuk import yang sudah ada. */
export const prisma = db.prisma;
