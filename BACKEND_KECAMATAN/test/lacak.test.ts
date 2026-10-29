import { afterEach, describe, expect, it } from 'vitest';
import { ajukan, buatApp, DATA_PENGANTAR, EMAIL, login, type TestCtx } from './helpers.js';

let ctx: TestCtx;
afterEach(async () => {
  await ctx.app.close();
});

const lacak = (body: Record<string, unknown>) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/pengajuan/lacak', payload: body });

describe('Lacak publik', () => {
  it('berhasil dengan nomor registrasi + 4 digit HP; tidak ada data pribadi', async () => {
    ctx = await buatApp();
    const p = await ajukan(ctx, await login(ctx.app, EMAIL.warga1), 'LAYANAN-007', DATA_PENGANTAR);
    const res = await lacak({ no_registrasi: p.no_registrasi.toLowerCase(), last_4_digit_hp: '0001' });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status_pengajuan).toBe('DIAJUKAN');
    expect(d.riwayat).toHaveLength(1);
    const teks = res.body;
    for (const rahasia of ['Budi', '6571019900000001', '081200000001', 'warga1@example.com', 'id_pengajuan', 'id_user', 'data_formulir']) {
      expect(teks).not.toContain(rahasia);
    }
  });

  it('HP salah dan nomor tidak ada → jawaban identik (tidak bisa dipakai menebak)', async () => {
    ctx = await buatApp();
    const p = await ajukan(ctx, await login(ctx.app, EMAIL.warga1), 'LAYANAN-007', DATA_PENGANTAR);
    const salahHp = await lacak({ no_registrasi: p.no_registrasi, last_4_digit_hp: '9999' });
    const tidakAda = await lacak({ no_registrasi: 'REQ-20260101-ZZZZ', last_4_digit_hp: '0001' });
    expect(salahHp.statusCode).toBe(404);
    expect(tidakAda.statusCode).toBe(404);
    expect(salahHp.body).toBe(tidakAda.body);
  });

  it('format input salah → 400', async () => {
    ctx = await buatApp();
    expect((await lacak({ no_registrasi: 'REQ-1', last_4_digit_hp: '0001' })).statusCode).toBe(400);
    expect((await lacak({ no_registrasi: 'REQ-20260101-ZZZZ', last_4_digit_hp: '12' })).statusCode).toBe(400);
  });

  it('rate limit: percobaan berlebihan diblokir (429)', async () => {
    ctx = await buatApp({ RATE_LIMIT_LACAK: '3' });
    const kode: number[] = [];
    for (let i = 0; i < 5; i++) kode.push((await lacak({ no_registrasi: 'REQ-20260101-ZZZZ', last_4_digit_hp: '0001' })).statusCode);
    expect(kode.slice(0, 3)).toEqual([404, 404, 404]);
    expect(kode.slice(3)).toEqual([429, 429]);
    const terakhir = await lacak({ no_registrasi: 'REQ-20260101-ZZZZ', last_4_digit_hp: '0001' });
    expect(terakhir.json().error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('rate limit login', async () => {
    ctx = await buatApp({ RATE_LIMIT_LOGIN: '2' });
    const kode: number[] = [];
    for (let i = 0; i < 3; i++) {
      kode.push((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/mock-login', payload: { email: EMAIL.warga1 } })).statusCode);
    }
    expect(kode).toEqual([200, 200, 429]);
  });
});
