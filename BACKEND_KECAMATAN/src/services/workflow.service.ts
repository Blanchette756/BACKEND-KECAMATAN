import { STATUS_AKHIR, TRANSISI, type AksiWorkflow, type StatusPengajuan, type Transisi } from '../constants/workflow.js';
import { formatNomorSurat } from '../constants/penomoran.js';
import type { JenisLayanan } from '../types/layanan.js';
import type { PengajuanPelayanan } from '../types/pengajuan.js';
import type { User } from '../types/user.js';
import { conflict, forbidden, notFound, validationFailed } from '../utils/errors.js';
import { newId, sha256, tahun } from '../utils/ids.js';
import type { ServiceDeps } from './deps.js';

/**
 * State machine pengajuan. Semua perubahan status WAJIB lewat `jalankan()`:
 *  1. aksi harus ada di tabel TRANSISI,
 *  2. role pelaku harus sesuai,
 *  3. status saat ini harus termasuk `dari`,
 *  4. Kasi hanya boleh memproses seksinya sendiri,
 *  5. versi harus cocok (cegah dua petugas memproses bersamaan),
 *  6. setiap perubahan dicatat di riwayat_status.
 */
export class WorkflowService {
  constructor(private readonly deps: ServiceDeps) {}

  cariTransisi(aksi: AksiWorkflow): Transisi {
    const t = TRANSISI.find((x) => x.aksi === aksi);
    if (!t) throw new Error(`Aksi workflow tidak terdaftar: ${aksi}`);
    return t;
  }

  /** Cek (tanpa menyimpan) apakah user boleh menjalankan aksi pada pengajuan ini. */
  periksa(user: User, p: PengajuanPelayanan, aksi: AksiWorkflow, catatan: string | null, expectedVersion: number): Transisi {
    const t = this.cariTransisi(aksi);
    if (user.role !== t.role) throw forbidden(`Aksi ini hanya untuk ${t.role}`);
    if (user.role === 'KASI' && user.seksi !== p.seksi) throw notFound('Pengajuan tidak ditemukan');
    if (user.role === 'WARGA' && user.id_user !== p.id_user) throw notFound('Pengajuan tidak ditemukan');
    if (p.version !== expectedVersion) {
      throw conflict('VERSI_KEDALUWARSA', 'Data pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.', {
        version_terkini: p.version,
      });
    }
    if (!t.dari.includes(p.status_pengajuan)) {
      throw conflict(
        'TRANSISI_TIDAK_VALID',
        STATUS_AKHIR.includes(p.status_pengajuan)
          ? `Pengajuan sudah berstatus ${p.status_pengajuan} dan tidak dapat diproses lagi`
          : `Aksi ${aksi} tidak dapat dilakukan saat status ${p.status_pengajuan}`,
        { status_saat_ini: p.status_pengajuan },
      );
    }
    if (t.wajibCatatan && (catatan === null || catatan.trim().length < 5)) {
      throw validationFailed('Catatan/alasan wajib diisi (minimal 5 karakter)');
    }
    return t;
  }

  /**
   * Jalankan transisi & simpan. `p` boleh sudah dimodifikasi pemanggil (mis. catatan berkas),
   * asalkan `periksa()` sudah lolos. Mengembalikan pengajuan versi terbaru.
   */
  async jalankan(
    user: User,
    p: PengajuanPelayanan,
    layanan: JenisLayanan,
    aksi: AksiWorkflow,
    catatan: string | null,
    expectedVersion: number,
  ): Promise<PengajuanPelayanan> {
    const { repos, config, now } = this.deps;
    const t = this.periksa(user, p, aksi, catatan, expectedVersion);
    const waktu = now();
    const iso = waktu.toISOString();
    const dari = p.status_pengajuan;
    const catatanBersih = catatan?.trim() || null;

    let ke: StatusPengajuan;
    if (t.ke === 'AUTO_SELESAI') ke = layanan.mode_penyerahan === 'AMBIL_DI_KANTOR' ? 'SIAP_DIAMBIL' : 'SELESAI';
    else ke = t.ke;

    const next: PengajuanPelayanan = { ...p, status_pengajuan: ke, tgl_diperbarui: iso };

    switch (aksi) {
      case 'KIRIM_REVISI':
        next.catatan_revisi = null;
        break;
      case 'ADMIN_SETUJUI':
        next.id_verifikator = user.id_user;
        next.catatan_internal = null;
        break;
      case 'ADMIN_MINTA_REVISI':
        next.id_verifikator = user.id_user;
        next.catatan_revisi = catatanBersih;
        break;
      case 'KASI_PARAF':
        next.id_kasi = user.id_user;
        break;
      case 'KASI_KEMBALIKAN':
      case 'CAMAT_KEMBALIKAN':
        next.catatan_internal = catatanBersih;
        break;
      case 'CAMAT_TTE': {
        next.id_camat = user.id_user;
        const th = tahun(waktu, config.timezone);
        const urut = await repos.pengajuan.nextNomorSurat(th);
        next.nomor_surat = formatNomorSurat(layanan.kode, urut, th);
        // SIMULASI: bukan tanda tangan elektronik tersertifikasi BSrE.
        next.qr_code_tte = `SIMULASI-TTE-${sha256(`${p.no_registrasi}|${next.nomor_surat}`).slice(0, 16).toUpperCase()}`;
        if (ke === 'SELESAI') {
          next.file_surat_selesai = `dummy://surat/${p.id_pengajuan}.pdf`;
          next.tgl_selesai = iso;
        }
        break;
      }
      case 'SERAHKAN':
        next.id_penyerah = user.id_user;
        next.tgl_selesai = iso;
        break;
      case 'ADMIN_TOLAK':
      case 'KASI_TOLAK':
      case 'CAMAT_TOLAK':
        next.alasan_penolakan = catatanBersih;
        if (user.role === 'ADMIN') next.id_verifikator = user.id_user;
        if (user.role === 'KASI') next.id_kasi = user.id_user;
        if (user.role === 'CAMAT') next.id_camat = user.id_user;
        break;
      case 'AJUKAN':
        break;
    }

    const ok = await repos.pengajuan.updateIfVersion(next, expectedVersion);
    if (!ok) {
      throw conflict('VERSI_KEDALUWARSA', 'Data pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.');
    }
    await repos.riwayat.add({
      id_riwayat: newId('RWT'),
      id_pengajuan: p.id_pengajuan,
      dari,
      ke,
      aksi,
      oleh_id_user: user.id_user,
      oleh_role: user.role,
      catatan: catatanBersih,
      waktu: iso,
    });
    const tersimpan = await repos.pengajuan.findById(p.id_pengajuan);
    if (!tersimpan) throw new Error('Pengajuan hilang setelah disimpan');
    return tersimpan;
  }
}
