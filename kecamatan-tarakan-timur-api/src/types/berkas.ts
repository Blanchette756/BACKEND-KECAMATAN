export const MIME_DIIZINKAN = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type MimeDiizinkan = (typeof MIME_DIIZINKAN)[number];

export type StatusBerkas = 'MENUNGGU' | 'VALID' | 'PERLU_PERBAIKAN';

/**
 * Fase 1: hanya METADATA berkas yang disimpan; file_url adalah tautan dummy.
 * Fase 2: unggah sungguhan (multipart) + cek magic bytes + penyimpanan privat.
 */
export interface BerkasPengajuan {
  id_berkas: string;
  id_pengajuan: string;
  id_syarat: string;
  nama_file: string;
  mime_type: MimeDiizinkan;
  ukuran_byte: number;
  file_url: string;
  status_berkas: StatusBerkas;
  catatan_admin: string | null;
  diunggah_pada: string;
}

/** Metadata berkas yang dikirim klien saat submit/revisi. */
export interface BerkasInput {
  id_syarat: string;
  nama_file: string;
  mime_type: string;
  ukuran_byte: number;
}
