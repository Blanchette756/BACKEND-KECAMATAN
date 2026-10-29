import type { MemoryStore } from '../database/memory-store.js';
import type { Repositories } from './interfaces.js';
import { MemoryUserRepository } from './user.repository.js';
import { MemoryMasterRepository } from './layanan.repository.js';
import { MemoryPengajuanRepository } from './pengajuan.repository.js';
import { MemoryBerkasRepository } from './berkas.repository.js';
import { MemoryAuditRepository, MemoryRiwayatRepository, MemorySesiRepository } from './log.repository.js';

/** Satu-satunya tempat yang perlu diubah saat pindah ke MySQL (Fase 2). */
export function createMemoryRepositories(store: MemoryStore): Repositories {
  return {
    users: new MemoryUserRepository(store),
    master: new MemoryMasterRepository(store),
    pengajuan: new MemoryPengajuanRepository(store),
    berkas: new MemoryBerkasRepository(store),
    riwayat: new MemoryRiwayatRepository(store),
    audit: new MemoryAuditRepository(store),
    sesi: new MemorySesiRepository(store),
  };
}
