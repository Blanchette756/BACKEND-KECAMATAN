import type { AksiWorkflow, StatusPengajuan } from '../constants/workflow.js';
import type { DataFormulir, Role, Seksi } from './common.js';

export interface PengajuanPelayanan {
  id_pengajuan: string;
  /** Kode lacak untuk warga, dibuat saat submit. Format REQ-YYYYMMDD-XXXX. */
  no_registrasi: string;
  id_user: string;
  id_layanan: string;
  /** Disalin dari layanan agar filter antrian Kasi per seksi cepat. */
  seksi: Seksi;
  data_formulir: DataFormulir;
  tgl_pengajuan: string;
  status_pengajuan: StatusPengajuan;
  /** Catatan untuk warga (alasan revisi). */
  catatan_revisi: string | null;
  /** Catatan antar-petugas (alasan dikembalikan ke admin). Tidak ditampilkan ke warga. */
  catatan_internal: string | null;
  alasan_penolakan: string | null;
  /** Nomor surat resmi, diberikan setelah Camat menandatangani. */
  nomor_surat: string | null;
  /** SIMULASI – bukan TTE BSrE yang sah secara hukum. */
  qr_code_tte: string | null;
  file_surat_selesai: string | null;
  id_verifikator: string | null;
  id_kasi: string | null;
  id_camat: string | null;
  id_penyerah: string | null;
  tgl_selesai: string | null;
  tgl_diperbarui: string;
  /** Penghitung versi untuk mencegah dua petugas memproses berkas yang sama bersamaan. */
  version: number;
}

export interface RiwayatStatus {
  id_riwayat: string;
  id_pengajuan: string;
  dari: StatusPengajuan | null;
  ke: StatusPengajuan;
  aksi: AksiWorkflow;
  oleh_id_user: string;
  oleh_role: Role;
  catatan: string | null;
  waktu: string;
}

export interface AuditLog {
  id_log: string;
  waktu: string;
  id_user: string;
  role: Role;
  aksi: 'LIHAT_PENGAJUAN' | 'LOGIN';
  target_id: string | null;
}

export interface Sesi {
  /** Hash SHA-256 dari token (token asli tidak pernah disimpan). */
  token_hash: string;
  id_user: string;
  kedaluwarsa_ms: number;
}
