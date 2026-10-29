import { readFileSync } from 'node:fs';
import path from 'node:path';
import Type, { type Static, type TSchema } from 'typebox';
import Value from 'typebox/value';
import { JenisLayananSchema, KontakKecamatanSchema, type JenisLayanan, type KontakKecamatan } from '../types/layanan.js';
import { KelurahanSchema, UserSchema, type Kelurahan, type User } from '../types/user.js';
import type { Kondisi } from '../types/common.js';

/**
 * Pemuat data master dari folder `data/`.
 *
 * Data dummy sengaja dipisah dari kode: saat data asli dari kecamatan masuk,
 * cukup ganti file JSON-nya. Loader ini memvalidasi bentuk (skema) DAN
 * konsistensi isi (ID unik, kondisi merujuk field yang ada, dst.), lalu
 * mengumpulkan SEMUA kesalahan sekaligus agar mudah diperbaiki.
 */

const LayananFileSchema = Type.Object({ _catatan: Type.Optional(Type.String()), layanan: Type.Array(JenisLayananSchema, { minItems: 1 }) }, { additionalProperties: false });
const KelurahanFileSchema = Type.Object({ _catatan: Type.Optional(Type.String()), kelurahan: Type.Array(KelurahanSchema, { minItems: 1 }) }, { additionalProperties: false });
const UsersFileSchema = Type.Object({ _catatan: Type.Optional(Type.String()), users: Type.Array(UserSchema) }, { additionalProperties: false });
const KontakFileSchema = Type.Object({ _catatan: Type.Optional(Type.String()), kontak: KontakKecamatanSchema }, { additionalProperties: false });

export interface MasterData {
  layanan: JenisLayanan[];
  kelurahan: Kelurahan[];
  users: User[];
  kontak: KontakKecamatan;
}

export interface RawMasterData {
  layanan: unknown;
  kelurahan: unknown;
  users: unknown;
  kontak: unknown;
}

export class DataValidationError extends Error {
  constructor(public readonly masalah: string[]) {
    super(`Data master tidak valid (${masalah.length} masalah):\n` + masalah.map((m) => `  - ${m}`).join('\n'));
    this.name = 'DataValidationError';
  }
}

function readJson(dir: string, file: string, masalah: string[]): unknown {
  const full = path.join(dir, file);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    masalah.push(`${file}: tidak bisa dibaca sebagai JSON (${(err as Error).message})`);
    return undefined;
  }
}

function checkSchema<S extends TSchema>(file: string, schema: S, value: unknown, masalah: string[]): value is Static<S> {
  if (value === undefined) return false;
  if (Value.Check(schema, value)) return true;
  for (const e of Value.Errors(schema, value).slice(0, 20)) {
    masalah.push(`${file}: ${e.instancePath || '(akar)'} → ${e.message}`);
  }
  return false;
}

function duplikat(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

function cekKondisi(
  lokasi: string,
  kondisi: Kondisi | undefined,
  fieldPilihan: Map<string, Set<string>>,
  diriSendiri: string | null,
  masalah: string[],
): void {
  if (!kondisi) return;
  const adaSama = kondisi.sama_dengan !== undefined;
  const adaSalah = kondisi.salah_satu !== undefined;
  if (adaSama === adaSalah) {
    masalah.push(`${lokasi}: kondisi harus berisi tepat salah satu dari "sama_dengan" atau "salah_satu"`);
    return;
  }
  if (kondisi.field === diriSendiri) {
    masalah.push(`${lokasi}: kondisi tidak boleh merujuk dirinya sendiri`);
    return;
  }
  const opsi = fieldPilihan.get(kondisi.field);
  if (!opsi) {
    masalah.push(`${lokasi}: kondisi merujuk field "${kondisi.field}" yang tidak ada atau bukan bertipe "pilihan"`);
    return;
  }
  const nilai = adaSama ? [kondisi.sama_dengan as string] : (kondisi.salah_satu as string[]);
  for (const n of nilai) {
    if (!opsi.has(n)) masalah.push(`${lokasi}: nilai kondisi "${n}" tidak ada di opsi field "${kondisi.field}"`);
  }
}

/** Validasi data mentah (sudah di-parse) → MasterData. Melempar DataValidationError. */
export function validateMasterData(raw: RawMasterData): MasterData {
  const masalah: string[] = [];

  const fLayanan = raw.layanan;
  const fKelurahan = raw.kelurahan;
  const fUsers = raw.users;
  const fKontak = raw.kontak;
  // Cek keempat file dulu (tanpa short-circuit) agar semua kesalahan skema terkumpul.
  const okLayanan = checkSchema('layanan.json', LayananFileSchema, fLayanan, masalah);
  const okKelurahan = checkSchema('kelurahan.json', KelurahanFileSchema, fKelurahan, masalah);
  const okUsers = checkSchema('users.json', UsersFileSchema, fUsers, masalah);
  const okKontak = checkSchema('kontak.json', KontakFileSchema, fKontak, masalah);

  if (!okLayanan || !okKelurahan || !okUsers || !okKontak) throw new DataValidationError(masalah);

  const layananData = fLayanan.layanan;
  const kelurahan = fKelurahan.kelurahan;
  const users = fUsers.users;

  // ---- Layanan ----
  for (const d of duplikat(layananData.map((l) => l.id_layanan))) masalah.push(`layanan.json: id_layanan ganda "${d}"`);
  for (const d of duplikat(layananData.map((l) => l.kode))) masalah.push(`layanan.json: kode ganda "${d}"`);
  const semuaSyarat = layananData.flatMap((l) => l.persyaratan.map((p) => p.id_syarat));
  for (const d of duplikat(semuaSyarat)) masalah.push(`layanan.json: id_syarat ganda "${d}"`);

  for (const l of layananData) {
    const lok = `layanan.json [${l.id_layanan}]`;
    const nomorLayanan = l.id_layanan.slice('LAYANAN-'.length);

    for (const d of duplikat(l.form_fields.map((f) => f.key))) masalah.push(`${lok}: key form_fields ganda "${d}"`);

    const fieldPilihan = new Map<string, Set<string>>();
    for (const f of l.form_fields) {
      if (f.tipe === 'pilihan') {
        if (!f.opsi) masalah.push(`${lok} field "${f.key}": tipe "pilihan" wajib punya "opsi"`);
        else {
          for (const d of duplikat(f.opsi.map((o) => o.nilai))) masalah.push(`${lok} field "${f.key}": nilai opsi ganda "${d}"`);
          fieldPilihan.set(f.key, new Set(f.opsi.map((o) => o.nilai)));
        }
      } else if (f.opsi) {
        masalah.push(`${lok} field "${f.key}": "opsi" hanya boleh untuk tipe "pilihan"`);
      }
      if (f.min !== undefined && f.maks !== undefined && f.min > f.maks) {
        masalah.push(`${lok} field "${f.key}": min lebih besar dari maks`);
      }
    }
    for (const f of l.form_fields) cekKondisi(`${lok} field "${f.key}"`, f.kondisi, fieldPilihan, f.key, masalah);

    for (const p of l.persyaratan) {
      if (p.id_syarat.slice(4, 7) !== nomorLayanan) {
        masalah.push(`${lok}: id_syarat "${p.id_syarat}" harus diawali SYR-${nomorLayanan}-`);
      }
      cekKondisi(`${lok} syarat "${p.id_syarat}"`, p.kondisi, fieldPilihan, null, masalah);
    }
  }

  // ---- Kelurahan ----
  for (const d of duplikat(kelurahan.map((k) => k.id_kelurahan))) masalah.push(`kelurahan.json: id_kelurahan ganda "${d}"`);
  const idKelurahan = new Set(kelurahan.map((k) => k.id_kelurahan));

  // ---- Users ----
  for (const d of duplikat(users.map((u) => u.id_user))) masalah.push(`users.json: id_user ganda "${d}"`);
  for (const d of duplikat(users.map((u) => u.email.toLowerCase()))) masalah.push(`users.json: email ganda "${d}"`);
  for (const d of duplikat(users.map((u) => u.nik))) masalah.push(`users.json: NIK ganda "${d}"`);
  for (const u of users) {
    const lok = `users.json [${u.id_user}]`;
    if (u.role === 'KASI' && u.seksi === null) masalah.push(`${lok}: role KASI wajib punya "seksi"`);
    if (u.role !== 'KASI' && u.seksi !== null) masalah.push(`${lok}: "seksi" hanya untuk role KASI (isi null)`);
    if (u.role === 'WARGA' && u.id_kelurahan === null) masalah.push(`${lok}: WARGA wajib punya id_kelurahan`);
    if (u.id_kelurahan !== null && !idKelurahan.has(u.id_kelurahan)) {
      masalah.push(`${lok}: id_kelurahan "${u.id_kelurahan}" tidak ada di kelurahan.json`);
    }
  }

  if (masalah.length > 0) throw new DataValidationError(masalah);

  const layanan: JenisLayanan[] = layananData.map((l) => ({
    ...l,
    persyaratan: l.persyaratan.map((p) => ({ ...p, id_layanan: l.id_layanan })),
  }));

  return { layanan, kelurahan, users, kontak: fKontak.kontak };
}

export function readRawMasterData(dataDir: string): RawMasterData {
  const masalah: string[] = [];
  const raw = {
    layanan: readJson(dataDir, 'layanan.json', masalah),
    kelurahan: readJson(dataDir, 'kelurahan.json', masalah),
    users: readJson(dataDir, 'users.json', masalah),
    kontak: readJson(dataDir, 'kontak.json', masalah),
  };
  if (masalah.length > 0) throw new DataValidationError(masalah);
  return raw;
}

/** Baca + validasi seluruh data master dari folder. */
export function loadMasterData(dataDir: string): MasterData {
  return validateMasterData(readRawMasterData(dataDir));
}
