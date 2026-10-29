import type { MemoryStore } from '../database/memory-store.js';
import type { BerkasPengajuan } from '../types/berkas.js';
import type { BerkasRepository } from './interfaces.js';

export class MemoryBerkasRepository implements BerkasRepository {
  constructor(private readonly store: MemoryStore) {}

  async createMany(items: BerkasPengajuan[]): Promise<void> {
    for (const b of items) this.store.berkas.set(b.id_berkas, structuredClone(b));
  }

  async listByPengajuan(idPengajuan: string): Promise<BerkasPengajuan[]> {
    return [...this.store.berkas.values()]
      .filter((b) => b.id_pengajuan === idPengajuan)
      .sort((a, b) => a.id_syarat.localeCompare(b.id_syarat))
      .map((b) => structuredClone(b));
  }

  async update(item: BerkasPengajuan): Promise<void> {
    if (!this.store.berkas.has(item.id_berkas)) throw new Error(`Berkas ${item.id_berkas} tidak ada`);
    this.store.berkas.set(item.id_berkas, structuredClone(item));
  }

  async delete(idBerkas: string): Promise<void> {
    this.store.berkas.delete(idBerkas);
  }
}
