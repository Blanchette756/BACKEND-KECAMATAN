import type { MemoryStore } from '../database/memory-store.js';
import type { JenisLayanan, KontakKecamatan } from '../types/layanan.js';
import type { Kelurahan } from '../types/user.js';
import type { MasterRepository } from './interfaces.js';

/** Data master: layanan + persyaratan, kelurahan, kontak kecamatan. */
export class MemoryMasterRepository implements MasterRepository {
  constructor(private readonly store: MemoryStore) {}

  async listLayanan(): Promise<JenisLayanan[]> {
    return [...this.store.layanan.values()]
      .sort((a, b) => a.id_layanan.localeCompare(b.id_layanan))
      .map((l) => structuredClone(l));
  }

  async findLayanan(id: string): Promise<JenisLayanan | null> {
    const l = this.store.layanan.get(id);
    return l ? structuredClone(l) : null;
  }

  async listKelurahan(): Promise<Kelurahan[]> {
    return [...this.store.kelurahan.values()].map((k) => structuredClone(k));
  }

  async getKontak(): Promise<KontakKecamatan> {
    return structuredClone(this.store.kontak);
  }
}
