import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ajukan, bearer, buatApp, DATA_PENGANTAR, EMAIL, login, patch, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await buatApp();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('Autentikasi', () => {
  it('tanpa token → 401', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/saya' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/pengajuan', payload: {} })).statusCode).toBe(401);
  });

  it('token palsu / format salah → 401', async () => {
    for (const h of ['Bearer abc', 'Bearer ' + 'x'.repeat(43), 'Basic dXNlcjpwYXNz', 'mock-USR-W-001']) {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: h } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('email tidak terdaftar → 401', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/mock-login', payload: { email: 'orang@lain.com' } });
    expect(res.statusCode).toBe(401);
  });

  it('logout mencabut token; /me tidak membocorkan NIK & HP lengkap', async () => {
    const token = await login(ctx.app, EMAIL.warga1);
    const me = (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(token) })).json().data;
    expect(me.nik_tersamar).toBe('6571********0001');
    expect(JSON.stringify(me)).not.toContain('6571019900000001');
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(token) })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(token) })).statusCode).toBe(401);
  });

  it('sesi kedaluwarsa → 401', async () => {
    let sekarang = new Date('2026-10-29T08:00:00Z');
    const { buildApp } = await import('../src/app.js');
    const { createContainer } = await import('../src/container.js');
    const { loadConfig } = await import('../src/config/env.js');
    const c = createContainer(loadConfig({ NODE_ENV: 'test', SESSION_TTL_MINUTES: '10' }), { now: () => sekarang });
    const app = await buildApp(c);
    const token = await login(app, EMAIL.warga1);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(token) })).statusCode).toBe(200);
    sekarang = new Date('2026-10-29T08:11:00Z');
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(token) })).statusCode).toBe(401);
    await app.close();
  });
});

describe('Otorisasi & IDOR', () => {
  it('warga B tidak bisa melihat atau merevisi pengajuan warga A (404, bukan 403)', async () => {
    const tA = await login(ctx.app, EMAIL.warga1);
    const tB = await login(ctx.app, EMAIL.warga2);
    const p = await ajukan(ctx, tA, 'LAYANAN-007', DATA_PENGANTAR);

    const lihat = await ctx.app.inject({ method: 'GET', url: `/api/v1/pengajuan/${p.id_pengajuan}`, headers: bearer(tB) });
    expect(lihat.statusCode).toBe(404);

    const revisi = await patch(ctx.app, tB, `/api/v1/pengajuan/${p.id_pengajuan}/revisi`, { berkas: [], version: 1 });
    expect(revisi.statusCode).toBe(404);

    const daftarB = (await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/saya', headers: bearer(tB) })).json();
    expect(daftarB.meta.total).toBe(0);
  });

  it('warga tidak bisa memanggil endpoint petugas (403)', async () => {
    const tA = await login(ctx.app, EMAIL.warga1);
    const p = await ajukan(ctx, tA, 'LAYANAN-007', DATA_PENGANTAR);
    for (const aksi of ['verifikasi', 'paraf-kasi', 'tte-camat', 'serahkan']) {
      const res = await patch(ctx.app, tA, `/api/v1/pengajuan/${p.id_pengajuan}/${aksi}`, { aksi: 'SETUJUI', version: 1 });
      expect(res.statusCode, aksi).toBe(403);
    }
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/antrian', headers: bearer(tA) })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/statistik', headers: bearer(tA) })).statusCode).toBe(403);
  });

  it('petugas tidak bisa mengajukan atas nama warga; admin tidak bisa memaraf', async () => {
    const tAdmin = await login(ctx.app, EMAIL.admin);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tAdmin),
      payload: { id_layanan: 'LAYANAN-007', data_formulir: DATA_PENGANTAR, berkas: [] },
    });
    expect(res.statusCode).toBe(403);

    const tW = await login(ctx.app, EMAIL.warga1);
    const p = await ajukan(ctx, tW, 'LAYANAN-007', DATA_PENGANTAR);
    expect((await patch(ctx.app, tAdmin, `/api/v1/pengajuan/${p.id_pengajuan}/paraf-kasi`, { aksi: 'SETUJUI', version: 1 })).statusCode).toBe(403);
  });

  it('Kasi seksi lain (Kesra) tidak bisa melihat/memaraf berkas Tata Pemerintahan', async () => {
    const tW = await login(ctx.app, EMAIL.warga1);
    const tAdmin = await login(ctx.app, EMAIL.admin);
    const tKesra = await login(ctx.app, EMAIL.kasiKesra);
    let p = await ajukan(ctx, tW, 'LAYANAN-007', DATA_PENGANTAR);
    p = (await patch(ctx.app, tAdmin, `/api/v1/pengajuan/${p.id_pengajuan}/verifikasi`, { aksi: 'SETUJUI', version: 1 })).json().data;

    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/pengajuan/${p.id_pengajuan}`, headers: bearer(tKesra) })).statusCode).toBe(404);
    expect((await patch(ctx.app, tKesra, `/api/v1/pengajuan/${p.id_pengajuan}/paraf-kasi`, { aksi: 'SETUJUI', version: p.version })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/antrian', headers: bearer(tKesra) })).json().meta.total).toBe(0);
  });

  it('petugas yang membuka detail tercatat di audit log', async () => {
    const tW = await login(ctx.app, EMAIL.warga1);
    const tCamat = await login(ctx.app, EMAIL.camat);
    const p = await ajukan(ctx, tW, 'LAYANAN-007', DATA_PENGANTAR);
    await ctx.app.inject({ method: 'GET', url: `/api/v1/pengajuan/${p.id_pengajuan}`, headers: bearer(tCamat) });
    const log = await ctx.c.repos.audit.listByTarget(p.id_pengajuan);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ aksi: 'LIHAT_PENGAJUAN', role: 'CAMAT' });
  });

  it('field tak dikenal di body ditolak (mencegah mass assignment)', async () => {
    const tW = await login(ctx.app, EMAIL.warga1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tW),
      payload: { id_layanan: 'LAYANAN-007', data_formulir: DATA_PENGANTAR, berkas: [], status_pengajuan: 'SELESAI' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Header keamanan', () => {
  it('respons berisi header helmet & no-store untuk data pribadi', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/saya' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CORS hanya untuk origin terdaftar', async () => {
    const ok = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan', headers: { origin: 'http://localhost:3001' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    const jahat = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan', headers: { origin: 'https://situs-jahat.example' } });
    expect(jahat.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('error tak terduga tidak membocorkan detail internal', async () => {
    ctx.c.services.layanan.list = async () => {
      throw new Error('rahasia: koneksi db gagal di 10.0.0.5');
    };
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('rahasia');
  });
});
