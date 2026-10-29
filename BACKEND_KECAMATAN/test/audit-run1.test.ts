/**
 * Tes regresi untuk temuan security audit run-1 (cloudflare/security-audit-skill, profil quick).
 * Nama setiap describe = fingerprint temuan, supaya audit berikutnya mudah mencocokkan.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { POLA_EMAIL } from '../src/constants/pola.js';
import { createContainer } from '../src/container.js';
import { ajukan, bearer, buatApp, DATA_PENGANTAR, EMAIL, login, patch, type TestCtx } from './helpers.js';

let ctx: TestCtx | null = null;
afterEach(async () => {
  await ctx?.app.close();
  ctx = null;
});

const LACAK = '/api/v1/pengajuan/lacak';

describe('src/schemas/auth.schema.ts:MockLoginBodySchema.email:polynomial-regex', () => {
  it('pola email berjalan linear pada input jahat (sebelumnya kuadratik)', () => {
    const re = new RegExp(POLA_EMAIL, 'u');
    const t = performance.now();
    expect(re.test('a@' + '.'.repeat(200_000) + '@')).toBe(false);
    expect(re.test('a@' + 'a.'.repeat(100_000))).toBe(false);
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('email normal tetap diterima, yang salah tetap ditolak', () => {
    const re = new RegExp(POLA_EMAIL, 'u');
    for (const ok of ['warga1@example.com', 'a.b@sub.domain.go.id', 'x+y@mail.co']) expect(re.test(ok), ok).toBe(true);
    for (const salah of ['a@b', 'a@.com', 'a@b.', 'a@b..com', 'a b@c.com', '@c.com']) expect(re.test(salah), salah).toBe(false);
  });

  it('body besar ke mock-login & lacak ditolak 413 sebelum validasi', async () => {
    ctx = await buatApp();
    const t = performance.now();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/mock-login', payload: { email: 'a@' + '.'.repeat(20_000) + '@' } });
    expect(res.statusCode).toBe(413);
    expect(performance.now() - t).toBeLessThan(200);
    const lacak = await ctx.app.inject({ method: 'POST', url: LACAK, payload: { no_registrasi: 'x'.repeat(5000), last_4_digit_hp: '0000' } });
    expect(lacak.statusCode).toBe(413);
  });
});

describe('src/config/env.ts:loadConfig:trustProxy-boolean-rate-limit-client-ip', () => {
  it('TRUST_PROXY=true / 1 / angka ditolak, daftar IP/CIDR diterima', () => {
    for (const v of ['true', 'TRUE', '1', '2', 'abc', '10.0.0.0/33', '127.0.0.1/8/1']) {
      expect(() => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: v }), v).toThrow(ConfigError);
    }
    expect(loadConfig({ NODE_ENV: 'test' }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback');
    expect(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: ' 127.0.0.1 , 173.245.48.0/20,::1 ' }).trustProxy).toBe('127.0.0.1,173.245.48.0/20,::1');
  });

  it('X-Forwarded-For palsu di sisi kiri tidak bisa dipakai menghindari rate limit', async () => {
    // app.inject memakai remoteAddress 127.0.0.1 → dianggap proxy tepercaya.
    ctx = await buatApp({ TRUST_PROXY: '127.0.0.1', RATE_LIMIT_LACAK: '2', LACAK_MAX_GAGAL: '1000' });
    const kode: number[] = [];
    for (const k of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: LACAK,
        headers: { 'x-forwarded-for': `${k}, 198.51.100.9` }, // kiri = karangan klien, kanan = ditambahkan proxy
        payload: { no_registrasi: 'REQ-20260101-AAAA', last_4_digit_hp: '0000' },
      });
      kode.push(res.statusCode);
    }
    expect(kode).toEqual([404, 404, 429]);
  });

  it('pengunjung berbeda di balik proxy mendapat jatah rate limit masing-masing', async () => {
    ctx = await buatApp({ TRUST_PROXY: '127.0.0.1', RATE_LIMIT_LACAK: '2', LACAK_MAX_GAGAL: '1000' });
    const kode: number[] = [];
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: LACAK,
        headers: { 'x-forwarded-for': ip },
        payload: { no_registrasi: 'REQ-20260101-AAAA', last_4_digit_hp: '0000' },
      });
      kode.push(res.statusCode);
    }
    expect(kode).toEqual([404, 404, 404]);
  });
});

describe('lacak: kunci per nomor registrasi (defence in depth untuk temuan TRUST_PROXY)', () => {
  it('setelah N kali HP salah, nomor dikunci, termasuk untuk HP yang benar; terbuka lagi setelah jendela waktu', async () => {
    let sekarang = new Date('2026-10-30T01:00:00Z');
    const c = createContainer(loadConfig({ NODE_ENV: 'test', LACAK_MAX_GAGAL: '3', LACAK_KUNCI_MENIT: '15', RATE_LIMIT_LACAK: '1000', RATE_LIMIT_LOGIN: '1000' }), {
      now: () => sekarang,
    });
    const app = await buildApp(c);
    ctx = { app, c };
    const p = await ajukan(ctx, await login(app, EMAIL.warga1), 'LAYANAN-007', DATA_PENGANTAR);
    const coba = (hp: string) => app.inject({ method: 'POST', url: LACAK, payload: { no_registrasi: p.no_registrasi, last_4_digit_hp: hp } });

    expect((await coba('0001')).statusCode).toBe(200);
    for (let i = 0; i < 3; i++) expect((await coba('9999')).statusCode).toBe(404);
    const terkunci = await coba('0001');
    expect(terkunci.statusCode).toBe(429);
    expect(terkunci.json().error.code).toBe('TERLALU_BANYAK_PERCOBAAN');

    sekarang = new Date('2026-10-30T01:16:00Z');
    expect((await coba('0001')).statusCode).toBe(200);
  });

  it('nomor yang tidak ada diperlakukan sama persis (tidak bisa dipakai menebak)', async () => {
    ctx = await buatApp({ LACAK_MAX_GAGAL: '2' });
    const kode: number[] = [];
    for (let i = 0; i < 3; i++) {
      kode.push((await ctx.app.inject({ method: 'POST', url: LACAK, payload: { no_registrasi: 'REQ-20260101-ZZZZ', last_4_digit_hp: '0000' } })).statusCode);
    }
    expect(kode).toEqual([404, 404, 429]);
  });
});

describe('src/services/auth.service.ts:AuthService.mockLogin:unbounded-session-audit-retention', () => {
  it('sesi aktif per akun dibatasi; sesi tertua dicabut', async () => {
    ctx = await buatApp({ MAX_SESI_PER_USER: '5' });
    const token: string[] = [];
    for (let i = 0; i < 20; i++) token.push(await login(ctx.app, EMAIL.warga1));
    expect(ctx.c.store.sesi.size).toBe(5);
    const me = (t: string) => ctx!.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(t) });
    expect((await me(token[0] as string)).statusCode).toBe(401);
    expect((await me(token[19] as string)).statusCode).toBe(200);
  });

  it('jejak audit di memori tidak tumbuh melewati AUDIT_LOG_MAX', async () => {
    ctx = await buatApp({ AUDIT_LOG_MAX: '100' });
    for (let i = 0; i < 150; i++) await ctx.c.services.auth.mockLogin(EMAIL.admin);
    expect(ctx.c.store.auditLog.length).toBe(100);
  });
});

describe('presenter.detailPengajuan:riwayat-catatan:approval-actions-not-internal', () => {
  it('catatan persetujuan antar-petugas tidak terlihat warga; catatan revisi & tolak tetap terlihat', async () => {
    ctx = await buatApp();
    const [tW, tA, tK] = [await login(ctx.app, EMAIL.warga1), await login(ctx.app, EMAIL.admin), await login(ctx.app, EMAIL.kasi)];
    let p = await ajukan(ctx, tW, 'LAYANAN-007', DATA_PENGANTAR);
    const url = (a: string) => `/api/v1/pengajuan/${p.id_pengajuan}/${a}`;
    p = (await patch(ctx.app, tA, url('verifikasi'), { aksi: 'MINTA_REVISI', catatan: 'KTP buram, unggah ulang', version: p.version })).json().data;
    p = (
      await patch(ctx.app, tW, url('revisi'), {
        berkas: [{ id_syarat: 'SYR-007-01', nama_file: 'ktp.pdf', mime_type: 'application/pdf', ukuran_byte: 100 }],
        version: p.version,
      })
    ).json().data;
    p = (await patch(ctx.app, tA, url('verifikasi'), { aksi: 'SETUJUI', version: p.version })).json().data;
    p = (await patch(ctx.app, tK, url('paraf-kasi'), { aksi: 'KEMBALIKAN', catatan: 'NIK tidak cocok', version: p.version })).json().data;
    p = (await patch(ctx.app, tA, url('verifikasi'), { aksi: 'SETUJUI', catatan: 'Balasan untuk Kasi: sudah dicek', version: p.version })).json().data;
    p = (await patch(ctx.app, tK, url('paraf-kasi'), { aksi: 'SETUJUI', catatan: 'Untuk Camat: prioritas', version: p.version })).json().data;

    const lihat = async (t: string) => (await ctx!.app.inject({ method: 'GET', url: `/api/v1/pengajuan/${p.id_pengajuan}`, headers: bearer(t) })).json().data;
    const warga = await lihat(tW);
    const teksWarga = JSON.stringify(warga);
    for (const rahasia of ['NIK tidak cocok', 'Balasan untuk Kasi', 'Untuk Camat']) expect(teksWarga).not.toContain(rahasia);
    expect(warga.riwayat.find((r: { aksi: string }) => r.aksi === 'ADMIN_MINTA_REVISI').catatan).toBe('KTP buram, unggah ulang');

    const petugas = JSON.stringify(await lihat(tA));
    for (const catatan of ['NIK tidak cocok', 'Balasan untuk Kasi', 'Untuk Camat']) expect(petugas).toContain(catatan);
  });
});

describe('hardening run-1', () => {
  it('statistik Kasi hanya mencakup seksinya sendiri', async () => {
    ctx = await buatApp();
    await ajukan(ctx, await login(ctx.app, EMAIL.warga1), 'LAYANAN-007', DATA_PENGANTAR);
    const stat = async (email: string) =>
      (await ctx!.app.inject({ method: 'GET', url: '/api/v1/pengajuan/statistik', headers: bearer(await login(ctx!.app, email)) })).json().data;
    expect((await stat(EMAIL.kasi)).total_pengajuan).toBe(1);
    const kesra = await stat(EMAIL.kasiKesra);
    expect(kesra.total_pengajuan).toBe(0);
    expect(kesra.lingkup).toBe('KESRA');
    expect((await stat(EMAIL.camat)).lingkup).toBe('SEMUA');
  });

  it('respons aksi petugas (berisi data pribadi) juga tercatat di jejak audit', async () => {
    ctx = await buatApp();
    const p = await ajukan(ctx, await login(ctx.app, EMAIL.warga1), 'LAYANAN-007', DATA_PENGANTAR);
    await patch(ctx.app, await login(ctx.app, EMAIL.admin), `/api/v1/pengajuan/${p.id_pengajuan}/verifikasi`, { aksi: 'SETUJUI', version: 1 });
    const log = await ctx.c.repos.audit.listByTarget(p.id_pengajuan);
    expect(log.map((l) => [l.role, l.aksi])).toEqual([['ADMIN', 'LIHAT_PENGAJUAN']]);
  });

  it('nama file divalidasi setelah dirapikan; karakter bidi/zero-width ditolak', async () => {
    ctx = await buatApp();
    const tW = await login(ctx.app, EMAIL.warga1);
    const kirim = (nama: string, perihal = 'Keperluan bank') =>
      ctx!.app.inject({
        method: 'POST',
        url: '/api/v1/pengajuan',
        headers: bearer(tW),
        payload: {
          id_layanan: 'LAYANAN-007',
          data_formulir: { perihal, ditujukan_kepada: 'Bank Contoh' },
          berkas: [
            { id_syarat: 'SYR-007-01', nama_file: nama, mime_type: 'application/pdf', ukuran_byte: 100 },
            { id_syarat: 'SYR-007-02', nama_file: 'kk.pdf', mime_type: 'application/pdf', ukuran_byte: 100 },
            { id_syarat: 'SYR-007-03', nama_file: 'dok.pdf', mime_type: 'application/pdf', ukuran_byte: 100 },
          ],
        },
      });
    expect((await kirim('   .tersembunyi.pdf')).statusCode).toBe(422);
    expect((await kirim('rapor‮fdp.exe.pdf')).statusCode).toBe(422);
    expect((await kirim('ktp.pdf', 'Keperluan​ bank')).statusCode).toBe(422);
    expect((await kirim('  ktp.pdf  ')).statusCode).toBe(201);
  });

  it('production: data contoh mati secara default & /health tidak menyebut mode auth', async () => {
    const env = { NODE_ENV: 'production', ALLOW_MOCK_AUTH_IN_PRODUCTION: 'true', CORS_ORIGINS: 'https://kecamatan.example', LOG_LEVEL: 'silent' };
    expect(loadConfig(env).seedDemoPengajuan).toBe(false);
    expect(loadConfig({ NODE_ENV: 'development' }).seedDemoPengajuan).toBe(true);
    const c = createContainer(loadConfig(env));
    const app = await buildApp(c);
    ctx = { app, c };
    const health = (await app.inject({ method: 'GET', url: '/api/v1/health' })).json();
    expect(health.status).toBe('ok');
    expect(health.auth_mode).toBeUndefined();
  });

  it('NODE_ENV kosong ditandai tidak eksplisit (server memberi peringatan)', () => {
    expect(loadConfig({}).nodeEnvEksplisit).toBe(false);
    expect(loadConfig({ NODE_ENV: 'development' }).nodeEnvEksplisit).toBe(true);
  });
});
