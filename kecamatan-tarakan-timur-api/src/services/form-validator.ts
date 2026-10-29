import path from 'node:path';
import type { DataFormulir, Kondisi } from '../types/common.js';
import type { FormField, JenisLayanan, Persyaratan } from '../types/layanan.js';
import { MIME_DIIZINKAN, type BerkasInput, type MimeDiizinkan } from '../types/berkas.js';

/**
 * Validasi isian formulir & berkas berdasarkan definisi layanan di data/layanan.json.
 * Semua aturan (wajib, kondisi, opsi, batas panjang) dibaca dari data, bukan di-hardcode,
 * sehingga mengganti data layanan otomatis mengganti aturan validasinya.
 */

const PANJANG_MAKS_DEFAULT = { teks: 200, paragraf: 1000 } as const;
const EKSTENSI_PER_MIME: Record<MimeDiizinkan, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
// Karakter kontrol (kecuali tab & baris baru untuk paragraf) tidak diizinkan.
// eslint-disable-next-line no-control-regex
const KARAKTER_KONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const NAMA_FILE_TERLARANG = /[\u0000-\u001F\u007F<>:"/\\|?*]/;

export function kondisiTerpenuhi(kondisi: Kondisi | undefined, data: Record<string, unknown>): boolean {
  if (!kondisi) return true;
  const nilai = data[kondisi.field];
  if (typeof nilai !== 'string') return false;
  if (kondisi.sama_dengan !== undefined) return nilai === kondisi.sama_dengan;
  return (kondisi.salah_satu ?? []).includes(nilai);
}

export function fieldBerlaku(layanan: JenisLayanan, data: Record<string, unknown>): FormField[] {
  return layanan.form_fields.filter((f) => kondisiTerpenuhi(f.kondisi, data));
}

export function syaratBerlaku(layanan: JenisLayanan, data: Record<string, unknown>): Persyaratan[] {
  return layanan.persyaratan.filter((p) => kondisiTerpenuhi(p.kondisi, data));
}

function tanggalValid(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface HasilValidasiFormulir {
  bersih: DataFormulir;
  masalah: string[];
}

/** Validasi data_formulir. Mengembalikan data yang sudah dirapikan (trim) + daftar masalah. */
export function validasiFormulir(layanan: JenisLayanan, input: Record<string, unknown>): HasilValidasiFormulir {
  const masalah: string[] = [];
  const bersih: DataFormulir = {};
  const keyDikenal = new Set(layanan.form_fields.map((f) => f.key));

  for (const key of Object.keys(input)) {
    if (!keyDikenal.has(key)) masalah.push(`data_formulir.${key}: field tidak dikenal untuk layanan ini`);
  }

  for (const f of layanan.form_fields) {
    const raw = input[f.key];
    const kosong = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    const berlaku = kondisiTerpenuhi(f.kondisi, input);
    const lok = `data_formulir.${f.key}`;

    if (!berlaku) {
      if (!kosong) masalah.push(`${lok}: field ini tidak berlaku untuk pilihan yang Anda isi`);
      continue;
    }
    if (kosong) {
      if (f.wajib) masalah.push(`${lok}: "${f.label}" wajib diisi`);
      continue;
    }

    switch (f.tipe) {
      case 'teks':
      case 'paragraf': {
        if (typeof raw !== 'string') {
          masalah.push(`${lok}: harus berupa teks`);
          break;
        }
        const v = raw.trim();
        const maks = f.panjang_maks ?? PANJANG_MAKS_DEFAULT[f.tipe];
        if (v.length > maks) masalah.push(`${lok}: maksimal ${maks} karakter`);
        else if (KARAKTER_KONTROL.test(v) || (f.tipe === 'teks' && /[\r\n]/.test(v))) masalah.push(`${lok}: berisi karakter yang tidak diizinkan`);
        else bersih[f.key] = v;
        break;
      }
      case 'pilihan': {
        const opsi = (f.opsi ?? []).map((o) => o.nilai);
        if (typeof raw !== 'string' || !opsi.includes(raw)) masalah.push(`${lok}: pilih salah satu dari ${opsi.join(', ')}`);
        else bersih[f.key] = raw;
        break;
      }
      case 'tanggal': {
        if (typeof raw !== 'string' || !tanggalValid(raw)) masalah.push(`${lok}: format tanggal harus YYYY-MM-DD`);
        else bersih[f.key] = raw;
        break;
      }
      case 'angka': {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          masalah.push(`${lok}: harus berupa angka`);
          break;
        }
        if (f.min !== undefined && raw < f.min) masalah.push(`${lok}: minimal ${f.min}`);
        else if (f.maks !== undefined && raw > f.maks) masalah.push(`${lok}: maksimal ${f.maks}`);
        else bersih[f.key] = raw;
        break;
      }
    }
  }
  return { bersih, masalah };
}

export interface AturanBerkas {
  maxFileBytes: number;
  maxFilesPerPengajuan: number;
}

/** Validasi satu metadata berkas (tipe, ukuran, nama file). */
export function validasiSatuBerkas(b: BerkasInput, lok: string, aturan: AturanBerkas): string[] {
  const masalah: string[] = [];
  if (!(MIME_DIIZINKAN as readonly string[]).includes(b.mime_type)) {
    masalah.push(`${lok}: tipe file harus PDF, JPG, atau PNG`);
  } else {
    const ext = path.extname(b.nama_file).toLowerCase();
    if (!EKSTENSI_PER_MIME[b.mime_type as MimeDiizinkan].includes(ext)) {
      masalah.push(`${lok}: ekstensi "${ext || '(tanpa ekstensi)'}" tidak cocok dengan tipe ${b.mime_type}`);
    }
  }
  if (!Number.isInteger(b.ukuran_byte) || b.ukuran_byte <= 0) masalah.push(`${lok}: ukuran file tidak valid`);
  else if (b.ukuran_byte > aturan.maxFileBytes) {
    masalah.push(`${lok}: ukuran file maksimal ${Math.round(aturan.maxFileBytes / 1024 / 1024)} MB`);
  }
  if (NAMA_FILE_TERLARANG.test(b.nama_file) || b.nama_file.startsWith('.') || b.nama_file.length > 150) {
    masalah.push(`${lok}: nama file tidak valid`);
  }
  return masalah;
}

/**
 * Validasi daftar berkas terhadap persyaratan layanan.
 * `lengkap = true` (saat submit) → semua syarat wajib yang berlaku harus ada.
 */
export function validasiBerkas(
  layanan: JenisLayanan,
  dataFormulir: Record<string, unknown>,
  berkas: BerkasInput[],
  aturan: AturanBerkas,
  lengkap: boolean,
): string[] {
  const masalah: string[] = [];
  const berlaku = new Map(syaratBerlaku(layanan, dataFormulir).map((p) => [p.id_syarat, p]));
  const semua = new Set(layanan.persyaratan.map((p) => p.id_syarat));
  const terlihat = new Set<string>();

  if (berkas.length > aturan.maxFilesPerPengajuan) {
    masalah.push(`berkas: maksimal ${aturan.maxFilesPerPengajuan} berkas per pengajuan`);
  }

  berkas.forEach((b, i) => {
    const lok = `berkas[${i}] (${b.id_syarat})`;
    if (!semua.has(b.id_syarat)) masalah.push(`${lok}: persyaratan tidak dikenal untuk layanan ini`);
    else if (!berlaku.has(b.id_syarat)) masalah.push(`${lok}: persyaratan ini tidak berlaku untuk isian formulir Anda`);
    if (terlihat.has(b.id_syarat)) masalah.push(`${lok}: persyaratan yang sama diunggah lebih dari sekali`);
    terlihat.add(b.id_syarat);
    masalah.push(...validasiSatuBerkas(b, lok, aturan));
  });

  if (lengkap) {
    for (const p of berlaku.values()) {
      if (p.wajib && !terlihat.has(p.id_syarat)) masalah.push(`berkas: "${p.nama_syarat}" (${p.id_syarat}) wajib dilampirkan`);
    }
  }
  return masalah;
}

/** Nama file dirapikan sebelum disimpan (hanya nama dasar, tanpa folder). */
export function rapikanNamaFile(nama: string): string {
  return path.basename(nama.trim());
}
