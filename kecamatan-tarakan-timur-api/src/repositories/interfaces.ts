import type { JenisLayanan, KontakKecamatan } from '../types/layanan.js';
import type { Kelurahan, User } from '../types/user.js';
import type { AuditLog, PengajuanPelayanan, RiwayatStatus, Sesi } from '../types/pengajuan.js';
import type { BerkasPengajuan } from '../types/berkas.js';
import type { StatusPengajuan } from '../constants/workflow.js';
import type { Seksi } from '../types/common.js';

/**
 * Kontrak akses data. Service HANYA bergantung pada interface ini,
 * bukan pada MemoryStore. Untuk pindah ke MySQL (Fase 2), cukup buat
 * implementasi baru dari interface yang sama di repositories/mysql/.
 *
 * Semua method async supaya tanda tangannya sudah cocok dengan driver database.
 */

export interface Halaman<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Paging {
  page: number;
  limit: number;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

export interface MasterRepository {
  listLayanan(): Promise<JenisLayanan[]>;
  findLayanan(id: string): Promise<JenisLayanan | null>;
  listKelurahan(): Promise<Kelurahan[]>;
  getKontak(): Promise<KontakKecamatan>;
}

export interface PengajuanRepository {
  create(p: PengajuanPelayanan): Promise<void>;
  findById(id: string): Promise<PengajuanPelayanan | null>;
  findByNoRegistrasi(noRegistrasi: string): Promise<PengajuanPelayanan | null>;
  listByUser(idUser: string, paging: Paging): Promise<Halaman<PengajuanPelayanan>>;
  listByStatus(statuses: readonly StatusPengajuan[], filter: { seksi?: Seksi }, paging: Paging): Promise<Halaman<PengajuanPelayanan>>;
  listAll(): Promise<PengajuanPelayanan[]>;
  /** Simpan hanya jika versi di penyimpanan masih `expectedVersion`. false = sudah diubah orang lain. */
  updateIfVersion(p: PengajuanPelayanan, expectedVersion: number): Promise<boolean>;
  nextNomorSurat(tahun: string): Promise<number>;
}

export interface BerkasRepository {
  createMany(items: BerkasPengajuan[]): Promise<void>;
  listByPengajuan(idPengajuan: string): Promise<BerkasPengajuan[]>;
  update(item: BerkasPengajuan): Promise<void>;
  delete(idBerkas: string): Promise<void>;
}

export interface RiwayatRepository {
  add(r: RiwayatStatus): Promise<void>;
  listByPengajuan(idPengajuan: string): Promise<RiwayatStatus[]>;
  listAll(): Promise<RiwayatStatus[]>;
}

export interface AuditRepository {
  add(a: AuditLog): Promise<void>;
  listByTarget(targetId: string): Promise<AuditLog[]>;
}

export interface SesiRepository {
  create(s: Sesi): Promise<void>;
  findByHash(tokenHash: string): Promise<Sesi | null>;
  delete(tokenHash: string): Promise<void>;
  deleteExpired(nowMs: number): Promise<number>;
}

export interface Repositories {
  users: UserRepository;
  master: MasterRepository;
  pengajuan: PengajuanRepository;
  berkas: BerkasRepository;
  riwayat: RiwayatRepository;
  audit: AuditRepository;
  sesi: SesiRepository;
}
