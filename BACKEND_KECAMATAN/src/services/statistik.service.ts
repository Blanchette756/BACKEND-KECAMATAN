import { STATUS, type StatusPengajuan } from '../constants/workflow.js';
import type { RiwayatStatus } from '../types/pengajuan.js';
import type { ServiceDeps } from './deps.js';
import type { User } from '../types/user.js';

interface Durasi {
  sampel: number;
  rata_rata_menit: number | null;
  median_menit: number | null;
}

function ringkas(nilaiMenit: number[]): Durasi {
  if (nilaiMenit.length === 0) return { sampel: 0, rata_rata_menit: null, median_menit: null };
  const urut = [...nilaiMenit].sort((a, b) => a - b);
  const tengah = Math.floor(urut.length / 2);
  const median = urut.length % 2 ? (urut[tengah] as number) : ((urut[tengah - 1] as number) + (urut[tengah] as number)) / 2;
  const rata = urut.reduce((s, n) => s + n, 0) / urut.length;
  return { sampel: urut.length, rata_rata_menit: Math.round(rata * 10) / 10, median_menit: Math.round(median * 10) / 10 };
}

const menitAntara = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

/**
 * Statistik layanan, dihitung langsung dari riwayat_status.
 * Dipakai untuk mengukur indikator capaian di proposal
 * (mis. waktu verifikasi admin < 5 menit, waktu persetujuan berkurang 30%).
 */
export class StatistikService {
  constructor(private readonly deps: ServiceDeps) {}

  async ringkasan(user: User) {
    const { repos } = this.deps;
    const [semuaRaw, riwayatRaw, layananRaw] = await Promise.all([
      repos.pengajuan.listAll(),
      repos.riwayat.listAll(),
      repos.master.listLayanan(),
    ]);
    // Kasi hanya melihat statistik seksinya sendiri; Admin & Camat melihat seluruh kecamatan.
    const lingkup = user.role === 'KASI' ? user.seksi : null;
    const semua = lingkup === null ? semuaRaw : semuaRaw.filter((p) => p.seksi === lingkup);
    const idDalamLingkup = new Set(semua.map((p) => p.id_pengajuan));
    const riwayat = riwayatRaw.filter((r) => idDalamLingkup.has(r.id_pengajuan));
    const layanan = lingkup === null ? layananRaw : layananRaw.filter((l) => l.seksi === lingkup);

    const perStatus = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<StatusPengajuan, number>;
    for (const p of semua) perStatus[p.status_pengajuan]++;

    const perLayanan = layanan.map((l) => ({
      id_layanan: l.id_layanan,
      nama_layanan: l.nama_layanan,
      jumlah: semua.filter((p) => p.id_layanan === l.id_layanan).length,
    }));

    // Durasi tiap tahap: waktu dari masuk status X sampai keluar dari status X.
    const tahap: Record<'verifikasi_admin' | 'paraf_kasi' | 'tte_camat' | 'total_hingga_terbit', number[]> = {
      verifikasi_admin: [],
      paraf_kasi: [],
      tte_camat: [],
      total_hingga_terbit: [],
    };
    const perPengajuan = new Map<string, RiwayatStatus[]>();
    for (const r of riwayat) {
      const list = perPengajuan.get(r.id_pengajuan) ?? [];
      list.push(r);
      perPengajuan.set(r.id_pengajuan, list);
    }
    for (const list of perPengajuan.values()) {
      list.sort((a, b) => a.waktu.localeCompare(b.waktu));
      for (let i = 1; i < list.length; i++) {
        const sebelum = list[i - 1] as RiwayatStatus;
        const kini = list[i] as RiwayatStatus;
        const menit = menitAntara(sebelum.waktu, kini.waktu);
        if (kini.dari === 'DIAJUKAN' || kini.dari === 'DIKEMBALIKAN_KE_ADMIN') tahap.verifikasi_admin.push(menit);
        if (kini.dari === 'MENUNGGU_PARAF_KASI') tahap.paraf_kasi.push(menit);
        if (kini.dari === 'MENUNGGU_TTE_CAMAT') tahap.tte_camat.push(menit);
      }
      const awal = list[0];
      const terbit = list.find((r) => r.aksi === 'CAMAT_TTE');
      if (awal && terbit) tahap.total_hingga_terbit.push(menitAntara(awal.waktu, terbit.waktu));
    }

    return {
      lingkup: lingkup ?? 'SEMUA',
      total_pengajuan: semua.length,
      per_status: perStatus,
      per_layanan: perLayanan,
      durasi: {
        verifikasi_admin: ringkas(tahap.verifikasi_admin),
        paraf_kasi: ringkas(tahap.paraf_kasi),
        tte_camat: ringkas(tahap.tte_camat),
        total_hingga_terbit: ringkas(tahap.total_hingga_terbit),
      },
      catatan: 'Durasi dihitung dari riwayat perubahan status. Pada data dummy, angka ini belum bermakna.',
    };
  }
}
