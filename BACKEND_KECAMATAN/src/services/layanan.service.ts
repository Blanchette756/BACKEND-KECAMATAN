import type { JenisLayanan, KontakKecamatan, Persyaratan } from '../types/layanan.js';
import type { Kelurahan } from '../types/user.js';
import { notFound } from '../utils/errors.js';
import type { ServiceDeps } from './deps.js';

export interface LayananRingkas {
  id_layanan: string;
  kode: string;
  nama_layanan: string;
  seksi: JenisLayanan['seksi'];
  deskripsi: string;
  jangka_waktu: string;
  biaya: string;
  output_dokumen: string;
  mode_penyerahan: JenisLayanan['mode_penyerahan'];
  jumlah_rangkap: number | null;
  jumlah_persyaratan: number;
  persyaratan_ringkas: string[];
}

export class LayananService {
  constructor(private readonly deps: ServiceDeps) {}

  /** Daftar layanan aktif (untuk halaman "Layanan Utama" & tabel persyaratan publik). */
  async list(): Promise<LayananRingkas[]> {
    const semua = await this.deps.repos.master.listLayanan();
    return semua
      .filter((l) => l.aktif)
      .map((l) => ({
        id_layanan: l.id_layanan,
        kode: l.kode,
        nama_layanan: l.nama_layanan,
        seksi: l.seksi,
        deskripsi: l.deskripsi,
        jangka_waktu: l.jangka_waktu,
        biaya: l.biaya,
        output_dokumen: l.output_dokumen,
        mode_penyerahan: l.mode_penyerahan,
        jumlah_rangkap: l.jumlah_rangkap,
        jumlah_persyaratan: l.persyaratan.length,
        persyaratan_ringkas: l.persyaratan.map((p) => p.nama_syarat),
      }));
  }

  /** Detail lengkap, termasuk definisi formulir untuk dirender frontend. */
  async detail(id: string): Promise<JenisLayanan> {
    const l = await this.deps.repos.master.findLayanan(id);
    if (!l || !l.aktif) throw notFound('Layanan tidak ditemukan');
    return l;
  }

  async persyaratan(id: string): Promise<{ id_layanan: string; nama_layanan: string; persyaratan: Persyaratan[] }> {
    const l = await this.detail(id);
    return { id_layanan: l.id_layanan, nama_layanan: l.nama_layanan, persyaratan: l.persyaratan };
  }

  async kelurahan(): Promise<Kelurahan[]> {
    return this.deps.repos.master.listKelurahan();
  }

  async kontak(): Promise<KontakKecamatan> {
    return this.deps.repos.master.getKontak();
  }
}
