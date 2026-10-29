import type { Container } from '../container.js';
import type { BerkasInput } from '../types/berkas.js';
import type { JenisLayanan } from '../types/layanan.js';
import type { User } from '../types/user.js';
import { syaratBerlaku } from '../services/form-validator.js';

/** Buat metadata berkas contoh untuk semua syarat wajib yang berlaku. */
export function contohBerkas(layanan: JenisLayanan, data: Record<string, unknown>): BerkasInput[] {
  return syaratBerlaku(layanan, data)
    .filter((s) => s.wajib)
    .map((s) => ({
      id_syarat: s.id_syarat,
      nama_file: `${s.id_syarat.toLowerCase()}.pdf`,
      mime_type: 'application/pdf',
      ukuran_byte: 150_000,
    }));
}

export interface ContohLacak {
  no_registrasi: string;
  last_4_digit_hp: string;
  status: string;
  layanan: string;
}

/**
 * Mengisi contoh pengajuan di berbagai status, LEWAT service yang sama dengan API,
 * sehingga semua data contoh pasti lolos validasi & state machine.
 */
export async function seedDemoPengajuan(c: Container): Promise<ContohLacak[]> {
  const { repos, services } = c;
  const ambil = async (email: string): Promise<User> => {
    const u = await repos.users.findByEmail(email);
    if (!u) throw new Error(`Akun dummy ${email} tidak ada di data/users.json`);
    return u;
  };
  const [w1, w2, w3, admin, kasi, camat] = await Promise.all([
    ambil('warga1@example.com'),
    ambil('warga2@example.com'),
    ambil('warga3@example.com'),
    ambil('admin@example.com'),
    ambil('kasi.tapem@example.com'),
    ambil('camat@example.com'),
  ]);

  const ajukan = async (warga: User, idLayanan: string, data: Record<string, unknown>) => {
    const layanan = await services.layanan.detail(idLayanan);
    return services.pengajuan.ajukan(warga, { id_layanan: idLayanan, data_formulir: data, berkas: contohBerkas(layanan, data) });
  };

  const hasil: ContohLacak[] = [];
  const catat = async (warga: User, id: string) => {
    const d = await services.pengajuan.detail(warga, id);
    hasil.push({ no_registrasi: d.no_registrasi, last_4_digit_hp: warga.no_hp.slice(-4), status: d.status_pengajuan, layanan: d.nama_layanan });
  };

  // 1. Baru diajukan
  const a = await ajukan(w1, 'LAYANAN-002', { nama_calon_pasangan: 'Calon Dummy', tanggal_rencana_nikah: '2026-12-12', status_perkawinan: 'BELUM_KAWIN' });
  await catat(w1, a.id_pengajuan);

  // 2. Selesai penuh (unduh)
  let b = await ajukan(w1, 'LAYANAN-007', { perihal: 'Pengantar keperluan administrasi bank', ditujukan_kepada: 'Bank Contoh Cabang Tarakan' });
  b = await services.pengajuan.verifikasi(admin, b.id_pengajuan, { aksi: 'SETUJUI', version: b.version });
  b = await services.pengajuan.parafKasi(kasi, b.id_pengajuan, { aksi: 'SETUJUI', version: b.version });
  b = await services.pengajuan.tteCamat(camat, b.id_pengajuan, { aksi: 'SETUJUI', version: b.version });
  await catat(w1, b.id_pengajuan);

  // 3. Perlu revisi
  let c3 = await ajukan(w2, 'LAYANAN-001', { nama_kapal: 'KM Contoh Jaya', ukuran_kapal: '5 GT', cara_perolehan: 'PEMBELIAN' });
  const foto = c3.berkas.find((x) => x.id_syarat === 'SYR-001-06');
  c3 = await services.pengajuan.verifikasi(admin, c3.id_pengajuan, {
    aksi: 'MINTA_REVISI',
    catatan: 'Foto kapal kurang jelas, mohon unggah foto berwarna tampak samping.',
    berkas: foto ? [{ id_berkas: foto.id_berkas, status: 'PERLU_PERBAIKAN', catatan: 'Foto buram' }] : [],
    version: c3.version,
  });
  await catat(w2, c3.id_pengajuan);

  // 4. Siap diambil (legalisir)
  let d = await ajukan(w2, 'LAYANAN-009', { jenis_dokumen: 'Ijazah SMA', jumlah_lembar: 3 });
  d = await services.pengajuan.verifikasi(admin, d.id_pengajuan, { aksi: 'SETUJUI', version: d.version });
  d = await services.pengajuan.parafKasi(kasi, d.id_pengajuan, { aksi: 'SETUJUI', version: d.version });
  d = await services.pengajuan.tteCamat(camat, d.id_pengajuan, { aksi: 'SETUJUI', version: d.version });
  await catat(w2, d.id_pengajuan);

  // 5. Menunggu paraf Kasi
  let e = await ajukan(w3, 'LAYANAN-005', { keperluan: 'KEHILANGAN_ALAS_HAK_TANAH', uraian_keperluan: 'Surat segel tanah hilang saat banjir.' });
  e = await services.pengajuan.verifikasi(admin, e.id_pengajuan, { aksi: 'SETUJUI', version: e.version });
  await catat(w3, e.id_pengajuan);

  // 6. Menunggu TTE Camat
  let f = await ajukan(w3, 'LAYANAN-006', { perihal: 'Rekomendasi pengajuan bantuan usaha', ditujukan_kepada: 'Dinas Contoh Kota Tarakan' });
  f = await services.pengajuan.verifikasi(admin, f.id_pengajuan, { aksi: 'SETUJUI', version: f.version });
  f = await services.pengajuan.parafKasi(kasi, f.id_pengajuan, { aksi: 'SETUJUI', version: f.version });
  await catat(w3, f.id_pengajuan);

  // 7. Ditolak
  let g = await ajukan(w3, 'LAYANAN-003', { nama_pewaris: 'Pewaris Dummy', tanggal_meninggal: '2025-08-17', jumlah_ahli_waris: 3 });
  g = await services.pengajuan.verifikasi(admin, g.id_pengajuan, { aksi: 'TOLAK', catatan: 'Surat Keterangan Ahli Waris dari kelurahan belum ada.', version: g.version });
  await catat(w3, g.id_pengajuan);

  return hasil;
}
