import type { MasterData } from './data-loader.js';
import type { JenisLayanan, KontakKecamatan } from '../types/layanan.js';
import type { Kelurahan, User } from '../types/user.js';
import type { AuditLog, PengajuanPelayanan, RiwayatStatus, Sesi } from '../types/pengajuan.js';
import type { BerkasPengajuan } from '../types/berkas.js';

/**
 * Simulasi database di memori. Setiap Map/array mewakili satu tabel.
 *
 * PENTING: isinya hilang setiap server restart/deploy. Hanya untuk Fase 1.
 * Di Fase 2, repository diganti implementasi MySQL; service & controller tidak berubah.
 */
export class MemoryStore {
  // Data master (dari folder data/)
  readonly layanan = new Map<string, JenisLayanan>();
  readonly kelurahan = new Map<string, Kelurahan>();
  readonly users = new Map<string, User>();
  kontak: KontakKecamatan;

  // Data transaksi
  readonly pengajuan = new Map<string, PengajuanPelayanan>();
  readonly berkas = new Map<string, BerkasPengajuan>();
  readonly riwayat: RiwayatStatus[] = [];
  readonly auditLog: AuditLog[] = [];
  readonly sesi = new Map<string, Sesi>();

  /** Penghitung nomor surat per tahun (simulasi sequence database). */
  readonly nomorSuratCounter = new Map<string, number>();

  constructor(master: MasterData) {
    for (const l of master.layanan) this.layanan.set(l.id_layanan, l);
    for (const k of master.kelurahan) this.kelurahan.set(k.id_kelurahan, k);
    for (const u of master.users) this.users.set(u.id_user, u);
    this.kontak = master.kontak;
  }
}
