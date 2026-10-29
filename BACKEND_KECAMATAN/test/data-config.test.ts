import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { DataValidationError, readRawMasterData, validateMasterData } from '../src/database/data-loader.js';

const dataDir = path.resolve('data');

/** Salinan data asli yang bisa dimodifikasi per tes. */
function salinData() {
  return structuredClone(readRawMasterData(dataDir)) as {
    layanan: { layanan: Record<string, any>[] };
    kelurahan: { kelurahan: Record<string, any>[] };
    users: { users: Record<string, any>[] };
    kontak: unknown;
  };
}

function harusGagal(raw: unknown, pesan: string) {
  try {
    validateMasterData(raw as Parameters<typeof validateMasterData>[0]);
  } catch (e) {
    expect(e).toBeInstanceOf(DataValidationError);
    expect((e as DataValidationError).message).toContain(pesan);
    return;
  }
  throw new Error('Seharusnya validasi gagal');
}

describe('Data master (folder data/)', () => {
  it('data dummy saat ini valid', () => {
    const d = validateMasterData(readRawMasterData(dataDir));
    expect(d.layanan).toHaveLength(9);
    expect(d.layanan.reduce((n, l) => n + l.persyaratan.length, 0)).toBe(48);
  });

  it('menolak kondisi yang merujuk field tidak ada', () => {
    const raw = salinData();
    raw.layanan.layanan[1]!.persyaratan[2].kondisi.field = 'status_kawin_typo';
    harusGagal(raw, 'tidak ada atau bukan bertipe "pilihan"');
  });

  it('menolak nilai kondisi yang tidak ada di opsi', () => {
    const raw = salinData();
    raw.layanan.layanan[1]!.persyaratan[2].kondisi.sama_dengan = 'DUDA';
    harusGagal(raw, 'tidak ada di opsi');
  });

  it('menolak id_syarat ganda & id_syarat yang tidak sesuai layanannya', () => {
    const raw = salinData();
    raw.layanan.layanan[0]!.persyaratan[1].id_syarat = 'SYR-001-01';
    harusGagal(raw, 'id_syarat ganda');
    const raw2 = salinData();
    raw2.layanan.layanan[0]!.persyaratan[1].id_syarat = 'SYR-002-99';
    harusGagal(raw2, 'harus diawali SYR-001-');
  });

  it('menolak field tak dikenal / salah ketik nama kolom', () => {
    const raw = salinData();
    raw.layanan.layanan[0]!.nama_layanann = 'typo';
    harusGagal(raw, 'layanan.json');
  });

  it('menolak user KASI tanpa seksi & email ganda', () => {
    const raw = salinData();
    const kasi = raw.users.users.find((u) => u.role === 'KASI')!;
    kasi.seksi = null;
    harusGagal(raw, 'wajib punya "seksi"');
    const raw2 = salinData();
    raw2.users.users[1]!.email = raw2.users.users[0]!.email.toUpperCase();
    harusGagal(raw2, 'email ganda');
  });

  it('mengganti data (mis. menambah layanan ke-10) cukup lewat data, tanpa ubah kode', () => {
    const raw = salinData();
    const baru = structuredClone(raw.layanan.layanan[6]!);
    baru.id_layanan = 'LAYANAN-010';
    baru.kode = 'SKU';
    baru.nama_layanan = 'Surat Keterangan Usaha (contoh)';
    baru.seksi = 'EKONOMI';
    baru.persyaratan = baru.persyaratan.map((p: { id_syarat: string }, i: number) => ({ ...p, id_syarat: `SYR-010-0${i + 1}` }));
    raw.layanan.layanan.push(baru);
    expect(validateMasterData(raw as never).layanan).toHaveLength(10);
  });
});

describe('Konfigurasi', () => {
  it('auth mock DITOLAK di production tanpa izin eksplisit', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://kecamatan.example' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://kecamatan.example', ALLOW_MOCK_AUTH_IN_PRODUCTION: 'true' }),
    ).not.toThrow();
  });

  it('production: dokumentasi /docs default mati', () => {
    const c = loadConfig({ NODE_ENV: 'production', ALLOW_MOCK_AUTH_IN_PRODUCTION: 'true' });
    expect(c.enableDocs).toBe(false);
  });

  it('CORS "*" & nilai tidak valid ditolak', () => {
    expect(() => loadConfig({ CORS_ORIGINS: '*' })).toThrow(ConfigError);
    expect(() => loadConfig({ CORS_ORIGINS: 'https://a.com/' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_TIMEZONE: 'Mars/Olympus' })).toThrow(ConfigError);
  });
});
