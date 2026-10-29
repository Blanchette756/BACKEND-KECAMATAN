import { STATUS_LABEL } from '../constants/workflow.js';
import type { BerkasPengajuan } from '../types/berkas.js';
import type { JenisLayanan } from '../types/layanan.js';
import type { PengajuanPelayanan, RiwayatStatus } from '../types/pengajuan.js';
import type { User, UserPublik } from '../types/user.js';
import { maskHp, maskNik } from '../utils/mask.js';

/**
 * Mengubah data internal menjadi bentuk respons API.
 * Di sinilah keputusan "siapa boleh melihat apa" diterapkan pada level field.
 */

export function toUserPublik(u: User): UserPublik {
  return {
    id_user: u.id_user,
    nama_lengkap: u.nama_lengkap,
    email: u.email,
    role: u.role,
    seksi: u.seksi,
    id_kelurahan: u.id_kelurahan,
    nik_tersamar: maskNik(u.nik),
    no_hp_tersamar: maskHp(u.no_hp),
  };
}

export function ringkasPengajuan(p: PengajuanPelayanan, layanan: JenisLayanan | null, pemohon: User | null) {
  return {
    id_pengajuan: p.id_pengajuan,
    no_registrasi: p.no_registrasi,
    id_layanan: p.id_layanan,
    nama_layanan: layanan?.nama_layanan ?? p.id_layanan,
    status_pengajuan: p.status_pengajuan,
    label_status: STATUS_LABEL[p.status_pengajuan],
    tgl_pengajuan: p.tgl_pengajuan,
    tgl_diperbarui: p.tgl_diperbarui,
    version: p.version,
    ...(pemohon ? { pemohon: { nama_lengkap: pemohon.nama_lengkap, nik_tersamar: maskNik(pemohon.nik) } } : {}),
  };
}

const AKSI_INTERNAL = new Set(['KASI_KEMBALIKAN', 'CAMAT_KEMBALIKAN']);

export function detailPengajuan(
  p: PengajuanPelayanan,
  layanan: JenisLayanan,
  pemohon: User | null,
  berkas: BerkasPengajuan[],
  riwayat: RiwayatStatus[],
  sudutPandang: 'PEMOHON' | 'PETUGAS',
) {
  const untukPetugas = sudutPandang === 'PETUGAS';
  const syaratById = new Map(layanan.persyaratan.map((s) => [s.id_syarat, s]));
  return {
    id_pengajuan: p.id_pengajuan,
    no_registrasi: p.no_registrasi,
    id_layanan: p.id_layanan,
    nama_layanan: layanan.nama_layanan,
    seksi: p.seksi,
    mode_penyerahan: layanan.mode_penyerahan,
    status_pengajuan: p.status_pengajuan,
    label_status: STATUS_LABEL[p.status_pengajuan],
    data_formulir: p.data_formulir,
    tgl_pengajuan: p.tgl_pengajuan,
    tgl_diperbarui: p.tgl_diperbarui,
    tgl_selesai: p.tgl_selesai,
    catatan_revisi: p.catatan_revisi,
    alasan_penolakan: p.alasan_penolakan,
    nomor_surat: p.nomor_surat,
    qr_code_tte: p.qr_code_tte,
    file_surat_selesai: p.file_surat_selesai,
    version: p.version,
    ...(untukPetugas
      ? {
          catatan_internal: p.catatan_internal,
          id_verifikator: p.id_verifikator,
          id_kasi: p.id_kasi,
          id_camat: p.id_camat,
          id_penyerah: p.id_penyerah,
        }
      : {}),
    pemohon: pemohon
      ? {
          id_user: pemohon.id_user,
          nama_lengkap: pemohon.nama_lengkap,
          nik: pemohon.nik,
          no_hp: pemohon.no_hp,
          email: pemohon.email,
          alamat: pemohon.alamat,
          id_kelurahan: pemohon.id_kelurahan,
        }
      : null,
    berkas: berkas.map((b) => ({
      id_berkas: b.id_berkas,
      id_syarat: b.id_syarat,
      nama_syarat: syaratById.get(b.id_syarat)?.nama_syarat ?? b.id_syarat,
      catatan_fisik: syaratById.get(b.id_syarat)?.catatan_fisik ?? null,
      nama_file: b.nama_file,
      mime_type: b.mime_type,
      ukuran_byte: b.ukuran_byte,
      file_url: b.file_url,
      status_berkas: b.status_berkas,
      catatan_admin: b.catatan_admin,
      diunggah_pada: b.diunggah_pada,
    })),
    riwayat: riwayat
      .slice()
      .sort((a, b) => a.waktu.localeCompare(b.waktu))
      .map((r) => ({
        dari: r.dari,
        ke: r.ke,
        label: STATUS_LABEL[r.ke],
        aksi: r.aksi,
        oleh_role: r.oleh_role,
        // Catatan antar-petugas tidak ditampilkan ke pemohon.
        catatan: untukPetugas || !AKSI_INTERNAL.has(r.aksi) ? r.catatan : null,
        waktu: r.waktu,
      })),
  };
}
