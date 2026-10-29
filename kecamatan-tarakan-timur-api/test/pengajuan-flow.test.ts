import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POLA_NO_REGISTRASI } from '../src/constants/penomoran.js';
import { ajukan, bearer, buatApp, DATA_LEGALISIR, DATA_PENGANTAR, EMAIL, login, patch, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tWarga: string, tAdmin: string, tKasi: string, tCamat: string;

beforeEach(async () => {
  ctx = await buatApp();
  [tWarga, tAdmin, tKasi, tCamat] = await Promise.all([
    login(ctx.app, EMAIL.warga1),
    login(ctx.app, EMAIL.admin),
    login(ctx.app, EMAIL.kasi),
    login(ctx.app, EMAIL.camat),
  ]);
});
afterEach(async () => {
  await ctx.app.close();
});

const url = (id: string, aksi: string) => `/api/v1/pengajuan/${id}/${aksi}`;

describe('Pengajuan: submit', () => {
  it('membuat pengajuan dengan nomor registrasi REQ-YYYYMMDD-XXXX', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    expect(p.no_registrasi).toMatch(new RegExp(POLA_NO_REGISTRASI));
    expect(p.status_pengajuan).toBe('DIAJUKAN');
    expect(p.version).toBe(1);
    expect(p.berkas).toHaveLength(3);
    expect(p.riwayat).toHaveLength(1);
  });

  it('menolak bila berkas wajib kurang (422) dan menyebut berkas yang kurang', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tWarga),
      payload: { id_layanan: 'LAYANAN-007', data_formulir: DATA_PENGANTAR, berkas: [] },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.stringify(res.json().error.details)).toContain('SYR-007-01');
  });

  it('syarat bersyarat: akta cerai hanya diminta untuk CERAI_HIDUP', async () => {
    const belum = await ajukan(ctx, tWarga, 'LAYANAN-002', {
      nama_calon_pasangan: 'X',
      tanggal_rencana_nikah: '2026-12-01',
      status_perkawinan: 'BELUM_KAWIN',
    });
    const ids = belum.berkas.map((b: { id_syarat: string }) => b.id_syarat);
    expect(ids).toContain('SYR-002-05');
    expect(ids).not.toContain('SYR-002-03');

    // Mengirim akta cerai padahal statusnya BELUM_KAWIN → ditolak
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tWarga),
      payload: {
        id_layanan: 'LAYANAN-002',
        data_formulir: { nama_calon_pasangan: 'X', tanggal_rencana_nikah: '2026-12-01', status_perkawinan: 'BELUM_KAWIN' },
        berkas: ['SYR-002-01', 'SYR-002-02', 'SYR-002-03', 'SYR-002-05', 'SYR-002-06'].map((id) => ({
          id_syarat: id,
          nama_file: `${id}.pdf`,
          mime_type: 'application/pdf',
          ukuran_byte: 1000,
        })),
      },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.stringify(res.json().error.details)).toContain('tidak berlaku');
  });

  it('validasi isian formulir: pilihan, tanggal, angka, field asing', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tWarga),
      payload: {
        id_layanan: 'LAYANAN-003',
        data_formulir: { nama_pewaris: 'A', tanggal_meninggal: '2026-02-31', jumlah_ahli_waris: 0, field_asing: 'x' },
        berkas: [],
      },
    });
    expect(res.statusCode).toBe(422);
    const detail = JSON.stringify(res.json().error.details);
    expect(detail).toContain('tanggal_meninggal');
    expect(detail).toContain('jumlah_ahli_waris');
    expect(detail).toContain('field_asing');
  });

  it('validasi berkas: tipe, ekstensi, ukuran, nama file berbahaya', async () => {
    const berkas = [
      { id_syarat: 'SYR-007-01', nama_file: 'ktp.exe', mime_type: 'application/x-msdownload', ukuran_byte: 100 },
      { id_syarat: 'SYR-007-02', nama_file: 'kk.png', mime_type: 'application/pdf', ukuran_byte: 100 },
      { id_syarat: 'SYR-007-03', nama_file: '../../etc/passwd.pdf', mime_type: 'application/pdf', ukuran_byte: 50 * 1024 * 1024 },
    ];
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pengajuan',
      headers: bearer(tWarga),
      payload: { id_layanan: 'LAYANAN-007', data_formulir: DATA_PENGANTAR, berkas },
    });
    expect(res.statusCode).toBe(422);
    const d = JSON.stringify(res.json().error.details);
    expect(d).toContain('PDF, JPG, atau PNG');
    expect(d).toContain('tidak cocok');
    expect(d).toContain('maksimal 2 MB');
    expect(d).toContain('nama file tidak valid');
  });
});

describe('Pengajuan: alur lengkap state machine', () => {
  it('UNDUH: DIAJUKAN → revisi → DIAJUKAN → paraf → TTE → SELESAI', async () => {
    let p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    const ktp = p.berkas.find((b: { id_syarat: string }) => b.id_syarat === 'SYR-007-01');

    // Admin minta revisi KTP
    let res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), {
      aksi: 'MINTA_REVISI',
      catatan: 'KTP buram, mohon unggah ulang',
      berkas: [{ id_berkas: ktp.id_berkas, status: 'PERLU_PERBAIKAN', catatan: 'Buram' }],
      version: p.version,
    });
    expect(res.statusCode).toBe(200);
    p = res.json().data;
    expect(p.status_pengajuan).toBe('PERLU_REVISI');
    expect(p.catatan_revisi).toContain('KTP buram');

    // Warga kirim revisi TANPA mengganti KTP → ditolak
    res = await patch(ctx.app, tWarga, url(p.id_pengajuan, 'revisi'), { berkas: [], version: p.version });
    expect(res.statusCode).toBe(422);

    // Warga ganti KTP → kembali DIAJUKAN
    res = await patch(ctx.app, tWarga, url(p.id_pengajuan, 'revisi'), {
      berkas: [{ id_syarat: 'SYR-007-01', nama_file: 'ktp-baru.jpg', mime_type: 'image/jpeg', ukuran_byte: 2000 }],
      version: p.version,
    });
    expect(res.statusCode).toBe(200);
    p = res.json().data;
    expect(p.status_pengajuan).toBe('DIAJUKAN');
    expect(p.berkas).toHaveLength(3);
    expect(p.berkas.find((b: { id_syarat: string }) => b.id_syarat === 'SYR-007-01').nama_file).toBe('ktp-baru.jpg');

    // Admin setujui → Kasi paraf → Camat TTE
    res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: p.version });
    p = res.json().data;
    expect(p.status_pengajuan).toBe('MENUNGGU_PARAF_KASI');
    expect(p.berkas.every((b: { status_berkas: string }) => b.status_berkas === 'VALID')).toBe(true);

    res = await patch(ctx.app, tKasi, url(p.id_pengajuan, 'paraf-kasi'), { aksi: 'SETUJUI', version: p.version });
    p = res.json().data;
    expect(p.status_pengajuan).toBe('MENUNGGU_TTE_CAMAT');

    res = await patch(ctx.app, tCamat, url(p.id_pengajuan, 'tte-camat'), { aksi: 'SETUJUI', version: p.version });
    p = res.json().data;
    expect(p.status_pengajuan).toBe('SELESAI');
    expect(p.nomor_surat).toMatch(/^DUMMY\/SP\/0001\/CTT\/\d{4}$/);
    expect(p.qr_code_tte).toMatch(/^SIMULASI-TTE-/);
    expect(p.file_surat_selesai).toMatch(/^dummy:\/\/surat\//);
    expect(p.tgl_selesai).not.toBeNull();
    expect(p.riwayat.map((r: { ke: string }) => r.ke)).toEqual([
      'DIAJUKAN',
      'PERLU_REVISI',
      'DIAJUKAN',
      'MENUNGGU_PARAF_KASI',
      'MENUNGGU_TTE_CAMAT',
      'SELESAI',
    ]);

    // Status akhir: tidak bisa diproses lagi
    res = await patch(ctx.app, tCamat, url(p.id_pengajuan, 'tte-camat'), { aksi: 'SETUJUI', version: p.version });
    expect(res.statusCode).toBe(409);
  });

  it('AMBIL_DI_KANTOR (legalisir): TTE → SIAP_DIAMBIL → serahkan → SELESAI', async () => {
    let p = await ajukan(ctx, tWarga, 'LAYANAN-009', DATA_LEGALISIR);
    p = (await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: p.version })).json().data;
    p = (await patch(ctx.app, tKasi, url(p.id_pengajuan, 'paraf-kasi'), { aksi: 'SETUJUI', version: p.version })).json().data;
    p = (await patch(ctx.app, tCamat, url(p.id_pengajuan, 'tte-camat'), { aksi: 'SETUJUI', version: p.version })).json().data;
    expect(p.status_pengajuan).toBe('SIAP_DIAMBIL');
    expect(p.file_surat_selesai).toBeNull();

    const res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'serahkan'), { version: p.version });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status_pengajuan).toBe('SELESAI');
  });

  it('serahkan ditolak untuk layanan yang diunduh daring', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    const res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'serahkan'), { version: p.version });
    expect(res.statusCode).toBe(400);
  });

  it('Kasi & Camat dapat MENGEMBALIKAN ke admin; catatannya tidak terlihat oleh warga', async () => {
    let p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    p = (await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: p.version })).json().data;
    const res = await patch(ctx.app, tKasi, url(p.id_pengajuan, 'paraf-kasi'), {
      aksi: 'KEMBALIKAN',
      catatan: 'Draf surat salah ketik nama',
      version: p.version,
    });
    p = res.json().data;
    expect(p.status_pengajuan).toBe('DIKEMBALIKAN_KE_ADMIN');
    expect(p.catatan_internal).toBe('Draf surat salah ketik nama');

    const versiWarga = (await ctx.app.inject({ method: 'GET', url: `/api/v1/pengajuan/${p.id_pengajuan}`, headers: bearer(tWarga) })).json().data;
    expect(versiWarga.catatan_internal).toBeUndefined();
    expect(JSON.stringify(versiWarga)).not.toContain('salah ketik');

    // Admin memproses ulang
    p = (await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: p.version })).json().data;
    expect(p.status_pengajuan).toBe('MENUNGGU_PARAF_KASI');
  });

  it('penolakan wajib disertai alasan', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    let res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'TOLAK', version: p.version });
    expect(res.statusCode).toBe(422);
    res = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'TOLAK', catatan: 'Bukan wilayah Tarakan Timur', version: p.version });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status_pengajuan).toBe('DITOLAK');
    expect(res.json().data.alasan_penolakan).toBe('Bukan wilayah Tarakan Timur');
  });

  it('melompati tahap ditolak (Camat TTE saat masih DIAJUKAN → 409)', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    const res = await patch(ctx.app, tCamat, url(p.id_pengajuan, 'tte-camat'), { aksi: 'SETUJUI', version: p.version });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TRANSISI_TIDAK_VALID');
  });

  it('versi kedaluwarsa ditolak (cegah dua petugas memproses bersamaan)', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    const pertama = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: 1 });
    expect(pertama.statusCode).toBe(200);
    const kedua = await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'TOLAK', catatan: 'tolak saja', version: 1 });
    expect(kedua.statusCode).toBe(409);
    expect(kedua.json().error.code).toBe('VERSI_KEDALUWARSA');
  });

  it('antrian per role & statistik', async () => {
    const p = await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    let antrian = (await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/antrian', headers: bearer(tAdmin) })).json();
    expect(antrian.data.map((x: { id_pengajuan: string }) => x.id_pengajuan)).toContain(p.id_pengajuan);
    expect(antrian.data[0].pemohon.nik_tersamar).toMatch(/^\d{4}\*+\d{4}$/);

    antrian = (await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/antrian', headers: bearer(tKasi) })).json();
    expect(antrian.meta.total).toBe(0);

    await patch(ctx.app, tAdmin, url(p.id_pengajuan, 'verifikasi'), { aksi: 'SETUJUI', version: 1 });
    antrian = (await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/antrian', headers: bearer(tKasi) })).json();
    expect(antrian.meta.total).toBe(1);

    const stat = (await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/statistik', headers: bearer(tCamat) })).json().data;
    expect(stat.total_pengajuan).toBe(1);
    expect(stat.per_status.MENUNGGU_PARAF_KASI).toBe(1);
    expect(stat.durasi.verifikasi_admin.sampel).toBe(1);
  });

  it('daftar pengajuan saya + paginasi', async () => {
    for (let i = 0; i < 3; i++) await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/pengajuan/saya?page=2&limit=2', headers: bearer(tWarga) });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toMatchObject({ page: 2, limit: 2, total: 3, total_halaman: 2 });
    expect(res.json().data).toHaveLength(1);
  });

  it('batas pengajuan aktif per warga (anti-spam)', async () => {
    for (let i = 0; i < 10; i++) await ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR);
    await expect(ajukan(ctx, tWarga, 'LAYANAN-007', DATA_PENGANTAR)).rejects.toThrow(/409/);
  });
});
