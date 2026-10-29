import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buatApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await buatApp();
});
afterEach(async () => {
  await ctx.app.close();
});

describe('Layanan (publik)', () => {
  it('menampilkan 9 layanan SP CCTI dengan jumlah berkas sesuai SP', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { id_layanan: string; jumlah_persyaratan: number }[];
    expect(data.map((l) => [l.id_layanan, l.jumlah_persyaratan])).toEqual([
      ['LAYANAN-001', 8],
      ['LAYANAN-002', 6],
      ['LAYANAN-003', 9],
      ['LAYANAN-004', 4],
      ['LAYANAN-005', 7],
      ['LAYANAN-006', 4],
      ['LAYANAN-007', 3],
      ['LAYANAN-008', 4],
      ['LAYANAN-009', 3],
    ]);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('detail layanan berisi definisi formulir & persyaratan bersyarat', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan/LAYANAN-002' });
    expect(res.statusCode).toBe(200);
    const l = res.json().data;
    expect(l.form_fields.map((f: { key: string }) => f.key)).toContain('status_perkawinan');
    const aktaCerai = l.persyaratan.find((p: { id_syarat: string }) => p.id_syarat === 'SYR-002-03');
    expect(aktaCerai.kondisi).toEqual({ field: 'status_perkawinan', sama_dengan: 'CERAI_HIDUP' });
  });

  it('endpoint persyaratan', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan/LAYANAN-009/persyaratan' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.persyaratan).toHaveLength(3);
  });

  it('404 untuk layanan yang tidak ada, 400 untuk ID berformat salah', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan/LAYANAN-999' })).statusCode).toBe(404);
    const salah = await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan/../../etc' });
    expect([400, 404]).toContain(salah.statusCode);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/layanan/abc' })).statusCode).toBe(400);
  });

  it('kelurahan & kontak tersedia', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/kelurahan' })).json().data.length).toBeGreaterThan(0);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/kontak' })).json().data.telepon).toBe('(0551) 22490');
  });
});
