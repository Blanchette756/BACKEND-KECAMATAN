import { timingSafeEqual } from 'node:crypto';
import { ANTRIAN_PER_ROLE, STATUS_AKHIR, STATUS_LABEL, type AksiWorkflow } from '../constants/workflow.js';
import { MAKS_PENGAJUAN_AKTIF_PER_WARGA } from '../constants/penomoran.js';
import type { Paging } from '../repositories/interfaces.js';
import type { BerkasInput, BerkasPengajuan, MimeDiizinkan } from '../types/berkas.js';
import type { JenisLayanan } from '../types/layanan.js';
import type { PengajuanPelayanan } from '../types/pengajuan.js';
import type { User } from '../types/user.js';
import { AppError, badRequest, conflict, forbidden, notFound, validationFailed } from '../utils/errors.js';
import { newId } from '../utils/ids.js';
import { AttemptLimiter } from '../utils/attempt-limiter.js';
import type { ServiceDeps } from './deps.js';
import { rapikanNamaFile, syaratBerlaku, validasiBerkas, validasiFormulir, validasiSatuBerkas } from './form-validator.js';
import { detailPengajuan, ringkasPengajuan } from './presenter.js';
import { generateNoRegistrasi } from './registrasi.js';
import type { WorkflowService } from './workflow.service.js';

export interface InputPengajuan {
  id_layanan: string;
  data_formulir: Record<string, unknown>;
  berkas: BerkasInput[];
}

export interface InputRevisi {
  data_formulir?: Record<string, unknown>;
  berkas: BerkasInput[];
  version: number;
}

export interface InputVerifikasi {
  aksi: 'SETUJUI' | 'MINTA_REVISI' | 'TOLAK';
  catatan?: string;
  berkas?: { id_berkas: string; status: 'VALID' | 'PERLU_PERBAIKAN'; catatan?: string }[];
  version: number;
}

export interface InputKeputusan {
  aksi: 'SETUJUI' | 'KEMBALIKAN' | 'TOLAK';
  catatan?: string;
  version: number;
}

const PESAN_LACAK_GAGAL = 'Nomor registrasi atau 4 digit nomor HP tidak cocok';

export class PengajuanService {
  /** Kunci lacak per nomor registrasi setelah beberapa percobaan HP salah. */
  private readonly lacakLimiter: AttemptLimiter;

  constructor(
    private readonly deps: ServiceDeps,
    private readonly workflow: WorkflowService,
  ) {
    const { maxGagal, menit } = deps.config.lacakLockout;
    this.lacakLimiter = new AttemptLimiter(maxGagal, menit * 60_000);
  }

  // ------------------------------------------------------------------ helpers

  private async layananAtauGagal(id: string): Promise<JenisLayanan> {
    const l = await this.deps.repos.master.findLayanan(id);
    if (!l) throw new Error(`Layanan ${id} tidak ditemukan (data master berubah?)`);
    return l;
  }

  /** Ambil pengajuan dan pastikan user berhak melihatnya. 404 (bukan 403) agar keberadaan data tidak bocor. */
  private async ambilDenganAkses(user: User, id: string): Promise<PengajuanPelayanan> {
    const p = await this.deps.repos.pengajuan.findById(id);
    if (!p || !this.bolehLihat(user, p)) throw notFound('Pengajuan tidak ditemukan');
    return p;
  }

  private bolehLihat(user: User, p: PengajuanPelayanan): boolean {
    switch (user.role) {
      case 'WARGA':
        return p.id_user === user.id_user;
      case 'KASI':
        return user.seksi !== null && p.seksi === user.seksi;
      case 'ADMIN':
      case 'CAMAT':
        return true;
    }
  }

  private buatBerkas(idPengajuan: string, input: BerkasInput[], iso: string): BerkasPengajuan[] {
    return input.map((b) => {
      const id_berkas = newId('BRK');
      return {
        id_berkas,
        id_pengajuan: idPengajuan,
        id_syarat: b.id_syarat,
        nama_file: rapikanNamaFile(b.nama_file),
        mime_type: b.mime_type as MimeDiizinkan,
        ukuran_byte: b.ukuran_byte,
        // Fase 1: tautan dummy. Fase 2: path privat di storage, diakses lewat endpoint ber-otorisasi.
        file_url: `dummy://berkas/${id_berkas}`,
        status_berkas: 'MENUNGGU',
        catatan_admin: null,
        diunggah_pada: iso,
      };
    });
  }

  private aturanBerkas() {
    return { maxFileBytes: this.deps.config.maxFileBytes, maxFilesPerPengajuan: this.deps.config.maxFilesPerPengajuan };
  }

  async detailUntuk(user: User, p: PengajuanPelayanan) {
    const { repos } = this.deps;
    const [layanan, pemohon, berkas, riwayat] = await Promise.all([
      this.layananAtauGagal(p.id_layanan),
      repos.users.findById(p.id_user),
      repos.berkas.listByPengajuan(p.id_pengajuan),
      repos.riwayat.listByPengajuan(p.id_pengajuan),
    ]);
    if (user.role !== 'WARGA') {
      // Jejak audit setiap kali petugas menerima data pribadi pemohon
      // (detail maupun respons aksi verifikasi/paraf/TTE/serahkan).
      await repos.audit.add({
        id_log: newId('LOG'),
        waktu: this.deps.now().toISOString(),
        id_user: user.id_user,
        role: user.role,
        aksi: 'LIHAT_PENGAJUAN',
        target_id: p.id_pengajuan,
      });
    }
    return detailPengajuan(p, layanan, pemohon, berkas, riwayat, user.role === 'WARGA' ? 'PEMOHON' : 'PETUGAS');
  }

  // ------------------------------------------------------------------ warga

  async ajukan(user: User, input: InputPengajuan) {
    const { repos, config, now } = this.deps;
    if (user.role !== 'WARGA') throw forbidden('Hanya warga yang dapat mengajukan permohonan');

    const layanan = await repos.master.findLayanan(input.id_layanan);
    if (!layanan || !layanan.aktif) throw notFound('Layanan tidak ditemukan');

    const { bersih, masalah } = validasiFormulir(layanan, input.data_formulir);
    masalah.push(...validasiBerkas(layanan, bersih, input.berkas, this.aturanBerkas(), true));
    if (masalah.length > 0) throw validationFailed('Data pengajuan belum lengkap atau tidak valid', masalah);

    const milikSaya = await repos.pengajuan.listByUser(user.id_user, { page: 1, limit: 1000 });
    const aktif = milikSaya.items.filter((p) => !STATUS_AKHIR.includes(p.status_pengajuan)).length;
    if (aktif >= MAKS_PENGAJUAN_AKTIF_PER_WARGA) {
      throw conflict('BATAS_PENGAJUAN', `Anda masih memiliki ${aktif} pengajuan yang sedang diproses. Tunggu hingga selesai sebelum mengajukan lagi.`);
    }

    const waktu = now();
    const iso = waktu.toISOString();
    const p: PengajuanPelayanan = {
      id_pengajuan: newId('PGJ'),
      no_registrasi: await generateNoRegistrasi(repos.pengajuan, waktu, config.timezone),
      id_user: user.id_user,
      id_layanan: layanan.id_layanan,
      seksi: layanan.seksi,
      data_formulir: bersih,
      tgl_pengajuan: iso,
      status_pengajuan: 'DIAJUKAN',
      catatan_revisi: null,
      catatan_internal: null,
      alasan_penolakan: null,
      nomor_surat: null,
      qr_code_tte: null,
      file_surat_selesai: null,
      id_verifikator: null,
      id_kasi: null,
      id_camat: null,
      id_penyerah: null,
      tgl_selesai: null,
      tgl_diperbarui: iso,
      version: 1,
    };
    await repos.pengajuan.create(p);
    await repos.berkas.createMany(this.buatBerkas(p.id_pengajuan, input.berkas, iso));
    await repos.riwayat.add({
      id_riwayat: newId('RWT'),
      id_pengajuan: p.id_pengajuan,
      dari: null,
      ke: 'DIAJUKAN',
      aksi: 'AJUKAN',
      oleh_id_user: user.id_user,
      oleh_role: user.role,
      catatan: null,
      waktu: iso,
    });
    return this.detailUntuk(user, p);
  }

  async listSaya(user: User, paging: Paging) {
    const { repos } = this.deps;
    const hal = await repos.pengajuan.listByUser(user.id_user, paging);
    const layanan = new Map((await repos.master.listLayanan()).map((l) => [l.id_layanan, l]));
    return { ...hal, items: hal.items.map((p) => ringkasPengajuan(p, layanan.get(p.id_layanan) ?? null, null)) };
  }

  async revisi(user: User, id: string, input: InputRevisi) {
    const { repos, now } = this.deps;
    const p = await this.ambilDenganAkses(user, id);
    const layanan = await this.layananAtauGagal(p.id_layanan);
    this.workflow.periksa(user, p, 'KIRIM_REVISI', null, input.version);

    // 1) Isian formulir: jika dikirim, menggantikan seluruh isian lama.
    let dataBaru = p.data_formulir;
    const masalah: string[] = [];
    if (input.data_formulir !== undefined) {
      const hasil = validasiFormulir(layanan, input.data_formulir);
      masalah.push(...hasil.masalah);
      dataBaru = hasil.bersih;
    }

    // 2) Berkas pengganti: validasi tiap berkas & pastikan berlaku.
    const berlaku = new Set(syaratBerlaku(layanan, dataBaru).map((s) => s.id_syarat));
    const idDiganti = new Set<string>();
    input.berkas.forEach((b, i) => {
      const lok = `berkas[${i}] (${b.id_syarat})`;
      if (!layanan.persyaratan.some((s) => s.id_syarat === b.id_syarat)) masalah.push(`${lok}: persyaratan tidak dikenal untuk layanan ini`);
      else if (!berlaku.has(b.id_syarat)) masalah.push(`${lok}: persyaratan ini tidak berlaku untuk isian formulir Anda`);
      if (idDiganti.has(b.id_syarat)) masalah.push(`${lok}: persyaratan yang sama dikirim lebih dari sekali`);
      idDiganti.add(b.id_syarat);
      masalah.push(...validasiSatuBerkas(b, lok, this.aturanBerkas()));
    });

    // 3) Gabungkan dengan berkas lama, lalu cek kelengkapan akhir.
    const lama = await repos.berkas.listByPengajuan(p.id_pengajuan);
    const tetap = lama.filter((b) => !idDiganti.has(b.id_syarat) && berlaku.has(b.id_syarat));
    for (const b of tetap) {
      if (b.status_berkas === 'PERLU_PERBAIKAN') {
        const nama = layanan.persyaratan.find((s) => s.id_syarat === b.id_syarat)?.nama_syarat ?? b.id_syarat;
        masalah.push(`berkas: "${nama}" (${b.id_syarat}) ditandai perlu diperbaiki, unggah ulang berkasnya`);
      }
    }
    const adaSetelah = new Set([...tetap.map((b) => b.id_syarat), ...idDiganti]);
    for (const s of syaratBerlaku(layanan, dataBaru)) {
      if (s.wajib && !adaSetelah.has(s.id_syarat)) masalah.push(`berkas: "${s.nama_syarat}" (${s.id_syarat}) wajib dilampirkan`);
    }
    if (adaSetelah.size > this.deps.config.maxFilesPerPengajuan) masalah.push('berkas: jumlah berkas melebihi batas');
    if (masalah.length > 0) throw validationFailed('Perbaikan belum lengkap atau tidak valid', masalah);

    // 4) Simpan perubahan status dulu (dijaga versi), baru ganti berkas.
    const iso = now().toISOString();
    const diperbarui = await this.workflow.jalankan(user, { ...p, data_formulir: dataBaru }, layanan, 'KIRIM_REVISI', null, input.version);
    for (const b of lama) {
      if (!tetap.includes(b)) await repos.berkas.delete(b.id_berkas);
    }
    await repos.berkas.createMany(this.buatBerkas(p.id_pengajuan, input.berkas, iso));
    return this.detailUntuk(user, diperbarui);
  }

  // ------------------------------------------------------------------ umum

  async detail(user: User, id: string) {
    const p = await this.ambilDenganAkses(user, id);
    return this.detailUntuk(user, p); // detailUntuk mencatat audit untuk petugas
  }

  /** Lacak publik tanpa login. Tidak mengembalikan data pribadi apa pun. */
  async lacak(noRegistrasi: string, last4: string) {
    const { repos, now } = this.deps;
    const nomor = noRegistrasi.trim().toUpperCase();
    const nowMs = now().getTime();
    // Dicek SEBELUM mencari data, jadi perilakunya sama untuk nomor yang ada maupun tidak (tanpa oracle).
    if (this.lacakLimiter.terkunci(nomor, nowMs)) {
      throw new AppError(
        429,
        'TERLALU_BANYAK_PERCOBAAN',
        `Terlalu banyak percobaan untuk nomor ini. Coba lagi dalam ${this.deps.config.lacakLockout.menit} menit, atau login untuk melihat status.`,
      );
    }
    const p = await repos.pengajuan.findByNoRegistrasi(nomor);
    const pemohon = p ? await repos.users.findById(p.id_user) : null;
    const cocok =
      p !== null &&
      pemohon !== null &&
      timingSafeEqual(Buffer.from(pemohon.no_hp.slice(-4).padStart(4, '#')), Buffer.from(last4.padStart(4, '#').slice(-4)));
    // Pesan & status sama untuk "tidak ada" dan "HP salah", agar tidak bisa dipakai menebak.
    if (!p || !cocok) {
      this.lacakLimiter.catatGagal(nomor, nowMs);
      throw new AppError(404, 'NOT_FOUND', PESAN_LACAK_GAGAL);
    }
    this.lacakLimiter.reset(nomor);

    const layanan = await this.layananAtauGagal(p.id_layanan);
    const riwayat = (await repos.riwayat.listByPengajuan(p.id_pengajuan)).sort((a, b) => a.waktu.localeCompare(b.waktu));
    const pesan: Record<string, string> = {
      PERLU_REVISI: 'Ada berkas yang perlu diperbaiki. Silakan login untuk melihat catatan petugas.',
      SIAP_DIAMBIL: 'Dokumen siap diambil di kantor kecamatan. Bawa dokumen asli dan KTP.',
      SELESAI: layanan.mode_penyerahan === 'UNDUH' ? 'Surat dapat diunduh setelah login.' : 'Dokumen telah diserahkan.',
      DITOLAK: 'Pengajuan ditolak. Silakan login untuk melihat alasannya.',
    };
    return {
      no_registrasi: p.no_registrasi,
      nama_layanan: layanan.nama_layanan,
      status_pengajuan: p.status_pengajuan,
      label_status: STATUS_LABEL[p.status_pengajuan],
      pesan: pesan[p.status_pengajuan] ?? null,
      tgl_pengajuan: p.tgl_pengajuan,
      tgl_diperbarui: p.tgl_diperbarui,
      riwayat: riwayat.map((r) => ({ status: r.ke, label: STATUS_LABEL[r.ke], waktu: r.waktu })),
    };
  }

  // ------------------------------------------------------------------ petugas

  async antrian(user: User, paging: Paging) {
    const { repos } = this.deps;
    if (user.role === 'WARGA') throw forbidden();
    // Kasi tanpa seksi ditolak (fail closed), jangan sampai filter kosong = melihat semua.
    if (user.role === 'KASI' && user.seksi === null) throw forbidden('Akun Kasi belum memiliki seksi');
    const statuses = ANTRIAN_PER_ROLE[user.role];
    const filter = user.role === 'KASI' && user.seksi !== null ? { seksi: user.seksi } : {};
    const hal = await repos.pengajuan.listByStatus(statuses, filter, paging);
    const layanan = new Map((await repos.master.listLayanan()).map((l) => [l.id_layanan, l]));
    const items = await Promise.all(
      hal.items.map(async (p) => ringkasPengajuan(p, layanan.get(p.id_layanan) ?? null, await repos.users.findById(p.id_user))),
    );
    return { ...hal, status_antrian: statuses, items };
  }

  async verifikasi(user: User, id: string, input: InputVerifikasi) {
    const { repos } = this.deps;
    const p = await this.ambilDenganAkses(user, id);
    const layanan = await this.layananAtauGagal(p.id_layanan);
    const aksi: AksiWorkflow =
      input.aksi === 'SETUJUI' ? 'ADMIN_SETUJUI' : input.aksi === 'MINTA_REVISI' ? 'ADMIN_MINTA_REVISI' : 'ADMIN_TOLAK';
    const catatan = input.catatan ?? null;
    this.workflow.periksa(user, p, aksi, catatan, input.version);

    const berkas = await repos.berkas.listByPengajuan(p.id_pengajuan);
    const byId = new Map(berkas.map((b) => [b.id_berkas, b]));
    const penilaian = input.berkas ?? [];
    const masalah: string[] = [];
    const dinilai = new Set<string>();
    for (const n of penilaian) {
      if (!byId.has(n.id_berkas)) masalah.push(`berkas ${n.id_berkas}: bukan bagian dari pengajuan ini`);
      if (dinilai.has(n.id_berkas)) masalah.push(`berkas ${n.id_berkas}: dinilai lebih dari sekali`);
      dinilai.add(n.id_berkas);
      if (n.status === 'PERLU_PERBAIKAN' && !n.catatan?.trim()) masalah.push(`berkas ${n.id_berkas}: beri catatan apa yang perlu diperbaiki`);
    }
    const adaPerbaikan = penilaian.some((n) => n.status === 'PERLU_PERBAIKAN');
    if (input.aksi === 'SETUJUI' && adaPerbaikan) masalah.push('Tidak bisa SETUJUI jika ada berkas yang ditandai PERLU_PERBAIKAN; gunakan MINTA_REVISI');
    if (masalah.length > 0) throw validationFailed('Data verifikasi tidak valid', masalah);

    // Simpan status dulu (dijaga versi), lalu catatan per berkas.
    const hasil = await this.workflow.jalankan(user, p, layanan, aksi, catatan, input.version);
    const nilaiById = new Map(penilaian.map((n) => [n.id_berkas, n]));
    for (const b of berkas) {
      const n = nilaiById.get(b.id_berkas);
      if (n) await repos.berkas.update({ ...b, status_berkas: n.status, catatan_admin: n.catatan?.trim() || null });
      else if (input.aksi === 'SETUJUI') await repos.berkas.update({ ...b, status_berkas: 'VALID', catatan_admin: null });
    }
    return this.detailUntuk(user, hasil);
  }

  private async keputusan(user: User, id: string, input: InputKeputusan, aksiMap: Record<InputKeputusan['aksi'], AksiWorkflow>) {
    const p = await this.ambilDenganAkses(user, id);
    const layanan = await this.layananAtauGagal(p.id_layanan);
    const hasil = await this.workflow.jalankan(user, p, layanan, aksiMap[input.aksi], input.catatan ?? null, input.version);
    return this.detailUntuk(user, hasil);
  }

  async parafKasi(user: User, id: string, input: InputKeputusan) {
    return this.keputusan(user, id, input, { SETUJUI: 'KASI_PARAF', KEMBALIKAN: 'KASI_KEMBALIKAN', TOLAK: 'KASI_TOLAK' });
  }

  async tteCamat(user: User, id: string, input: InputKeputusan) {
    return this.keputusan(user, id, input, { SETUJUI: 'CAMAT_TTE', KEMBALIKAN: 'CAMAT_KEMBALIKAN', TOLAK: 'CAMAT_TOLAK' });
  }

  async serahkan(user: User, id: string, version: number) {
    const p = await this.ambilDenganAkses(user, id);
    const layanan = await this.layananAtauGagal(p.id_layanan);
    if (layanan.mode_penyerahan !== 'AMBIL_DI_KANTOR') throw badRequest('Layanan ini diunduh daring, tidak melalui penyerahan di kantor');
    const hasil = await this.workflow.jalankan(user, p, layanan, 'SERAHKAN', null, version);
    return this.detailUntuk(user, hasil);
  }
}
