import type { MemoryStore } from '../database/memory-store.js';
import type { PengajuanPelayanan } from '../types/pengajuan.js';
import type { StatusPengajuan } from '../constants/workflow.js';
import type { Seksi } from '../types/common.js';
import type { Halaman, Paging, PengajuanRepository } from './interfaces.js';

function paginate<T>(rows: T[], { page, limit }: Paging): Halaman<T> {
  const start = (page - 1) * limit;
  return { items: rows.slice(start, start + limit), total: rows.length, page, limit };
}

const terbaruDulu = (a: PengajuanPelayanan, b: PengajuanPelayanan) => b.tgl_pengajuan.localeCompare(a.tgl_pengajuan);
const terlamaDulu = (a: PengajuanPelayanan, b: PengajuanPelayanan) => a.tgl_pengajuan.localeCompare(b.tgl_pengajuan);

export class MemoryPengajuanRepository implements PengajuanRepository {
  constructor(private readonly store: MemoryStore) {}

  async create(p: PengajuanPelayanan): Promise<void> {
    if (this.store.pengajuan.has(p.id_pengajuan)) throw new Error(`Duplikat id_pengajuan ${p.id_pengajuan}`);
    for (const x of this.store.pengajuan.values()) {
      if (x.no_registrasi === p.no_registrasi) throw new Error(`Duplikat no_registrasi ${p.no_registrasi}`);
    }
    this.store.pengajuan.set(p.id_pengajuan, structuredClone(p));
  }

  async findById(id: string): Promise<PengajuanPelayanan | null> {
    const p = this.store.pengajuan.get(id);
    return p ? structuredClone(p) : null;
  }

  async findByNoRegistrasi(noRegistrasi: string): Promise<PengajuanPelayanan | null> {
    for (const p of this.store.pengajuan.values()) {
      if (p.no_registrasi === noRegistrasi) return structuredClone(p);
    }
    return null;
  }

  async listByUser(idUser: string, paging: Paging): Promise<Halaman<PengajuanPelayanan>> {
    const rows = [...this.store.pengajuan.values()].filter((p) => p.id_user === idUser).sort(terbaruDulu);
    return paginate(rows.map((p) => structuredClone(p)), paging);
  }

  async listByStatus(
    statuses: readonly StatusPengajuan[],
    filter: { seksi?: Seksi },
    paging: Paging,
  ): Promise<Halaman<PengajuanPelayanan>> {
    const rows = [...this.store.pengajuan.values()]
      .filter((p) => statuses.includes(p.status_pengajuan))
      .filter((p) => filter.seksi === undefined || p.seksi === filter.seksi)
      .sort(terlamaDulu); // antrian: yang paling lama menunggu di atas
    return paginate(rows.map((p) => structuredClone(p)), paging);
  }

  async listAll(): Promise<PengajuanPelayanan[]> {
    return [...this.store.pengajuan.values()].map((p) => structuredClone(p));
  }

  async updateIfVersion(p: PengajuanPelayanan, expectedVersion: number): Promise<boolean> {
    const current = this.store.pengajuan.get(p.id_pengajuan);
    if (!current || current.version !== expectedVersion) return false;
    this.store.pengajuan.set(p.id_pengajuan, structuredClone({ ...p, version: expectedVersion + 1 }));
    return true;
  }

  async nextNomorSurat(tahun: string): Promise<number> {
    const next = (this.store.nomorSuratCounter.get(tahun) ?? 0) + 1;
    this.store.nomorSuratCounter.set(tahun, next);
    return next;
  }
}
