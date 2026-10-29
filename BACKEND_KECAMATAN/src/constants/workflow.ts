import type { Role } from '../types/common.js';

/**
 * Status pengajuan. Alur mengikuti SP CCTI Kecamatan Tarakan Timur:
 * Petugas pelayanan memeriksa berkas → Kasi Tata Pemerintahan paraf → Camat tanda tangan
 * → petugas memberi nomor & menyerahkan surat.
 */
export const STATUS = [
  'DIAJUKAN', // menunggu verifikasi Admin Pelayanan
  'PERLU_REVISI', // Admin meminta warga memperbaiki berkas/isian
  'DIKEMBALIKAN_KE_ADMIN', // Kasi/Camat mengembalikan ke Admin untuk diperbaiki
  'MENUNGGU_PARAF_KASI',
  'MENUNGGU_TTE_CAMAT',
  'SIAP_DIAMBIL', // khusus layanan yang dokumen fisiknya diambil di kantor (legalisasi/legalisir)
  'SELESAI',
  'DITOLAK',
] as const;
export type StatusPengajuan = (typeof STATUS)[number];

export const STATUS_LABEL: Record<StatusPengajuan, string> = {
  DIAJUKAN: 'Diajukan – menunggu verifikasi petugas',
  PERLU_REVISI: 'Berkas perlu diperbaiki',
  DIKEMBALIKAN_KE_ADMIN: 'Sedang diperiksa ulang petugas',
  MENUNGGU_PARAF_KASI: 'Menunggu paraf Kepala Seksi',
  MENUNGGU_TTE_CAMAT: 'Menunggu tanda tangan Camat',
  SIAP_DIAMBIL: 'Selesai – siap diambil di kantor kecamatan',
  SELESAI: 'Selesai',
  DITOLAK: 'Pengajuan ditolak',
};

export const STATUS_AKHIR: readonly StatusPengajuan[] = ['SELESAI', 'DITOLAK'];

export type AksiWorkflow =
  | 'AJUKAN'
  | 'KIRIM_REVISI'
  | 'ADMIN_SETUJUI'
  | 'ADMIN_MINTA_REVISI'
  | 'ADMIN_TOLAK'
  | 'KASI_PARAF'
  | 'KASI_KEMBALIKAN'
  | 'KASI_TOLAK'
  | 'CAMAT_TTE'
  | 'CAMAT_KEMBALIKAN'
  | 'CAMAT_TOLAK'
  | 'SERAHKAN';

export interface Transisi {
  aksi: AksiWorkflow;
  role: Role;
  dari: readonly StatusPengajuan[];
  /** 'AUTO' = ditentukan oleh mode penyerahan layanan (SELESAI atau SIAP_DIAMBIL). */
  ke: StatusPengajuan | 'AUTO_SELESAI';
  wajibCatatan: boolean;
}

/**
 * Tabel transisi: SATU-SATUNYA sumber kebenaran alur kerja.
 * Transisi yang tidak tercantum di sini otomatis ditolak oleh WorkflowService.
 */
export const TRANSISI: readonly Transisi[] = [
  { aksi: 'KIRIM_REVISI', role: 'WARGA', dari: ['PERLU_REVISI'], ke: 'DIAJUKAN', wajibCatatan: false },

  { aksi: 'ADMIN_SETUJUI', role: 'ADMIN', dari: ['DIAJUKAN', 'DIKEMBALIKAN_KE_ADMIN'], ke: 'MENUNGGU_PARAF_KASI', wajibCatatan: false },
  { aksi: 'ADMIN_MINTA_REVISI', role: 'ADMIN', dari: ['DIAJUKAN', 'DIKEMBALIKAN_KE_ADMIN'], ke: 'PERLU_REVISI', wajibCatatan: true },
  { aksi: 'ADMIN_TOLAK', role: 'ADMIN', dari: ['DIAJUKAN', 'DIKEMBALIKAN_KE_ADMIN'], ke: 'DITOLAK', wajibCatatan: true },

  { aksi: 'KASI_PARAF', role: 'KASI', dari: ['MENUNGGU_PARAF_KASI'], ke: 'MENUNGGU_TTE_CAMAT', wajibCatatan: false },
  { aksi: 'KASI_KEMBALIKAN', role: 'KASI', dari: ['MENUNGGU_PARAF_KASI'], ke: 'DIKEMBALIKAN_KE_ADMIN', wajibCatatan: true },
  { aksi: 'KASI_TOLAK', role: 'KASI', dari: ['MENUNGGU_PARAF_KASI'], ke: 'DITOLAK', wajibCatatan: true },

  { aksi: 'CAMAT_TTE', role: 'CAMAT', dari: ['MENUNGGU_TTE_CAMAT'], ke: 'AUTO_SELESAI', wajibCatatan: false },
  { aksi: 'CAMAT_KEMBALIKAN', role: 'CAMAT', dari: ['MENUNGGU_TTE_CAMAT'], ke: 'DIKEMBALIKAN_KE_ADMIN', wajibCatatan: true },
  { aksi: 'CAMAT_TOLAK', role: 'CAMAT', dari: ['MENUNGGU_TTE_CAMAT'], ke: 'DITOLAK', wajibCatatan: true },

  { aksi: 'SERAHKAN', role: 'ADMIN', dari: ['SIAP_DIAMBIL'], ke: 'SELESAI', wajibCatatan: false },
];

/** Status yang muncul di antrian kerja tiap role. */
export const ANTRIAN_PER_ROLE: Record<Exclude<Role, 'WARGA'>, readonly StatusPengajuan[]> = {
  ADMIN: ['DIAJUKAN', 'DIKEMBALIKAN_KE_ADMIN', 'SIAP_DIAMBIL'],
  KASI: ['MENUNGGU_PARAF_KASI'],
  CAMAT: ['MENUNGGU_TTE_CAMAT'],
};
