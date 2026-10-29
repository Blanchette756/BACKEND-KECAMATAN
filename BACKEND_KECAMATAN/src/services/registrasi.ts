import { PANJANG_KODE_ACAK, PREFIX_REGISTRASI } from '../constants/penomoran.js';
import type { PengajuanRepository } from '../repositories/interfaces.js';
import { randomKode, tanggalRingkas } from '../utils/ids.js';

/**
 * Membuat nomor registrasi REQ-YYYYMMDD-XXXX.
 * XXXX acak (bukan berurutan), sehingga nomor orang lain tidak bisa ditebak
 * hanya dengan menambah 1. Dipadukan dengan 4 digit HP + rate limit pada endpoint lacak.
 */
export async function generateNoRegistrasi(repo: PengajuanRepository, now: Date, timeZone: string): Promise<string> {
  const tanggal = tanggalRingkas(now, timeZone);
  for (let percobaan = 0; percobaan < 20; percobaan++) {
    const kandidat = `${PREFIX_REGISTRASI}-${tanggal}-${randomKode(PANJANG_KODE_ACAK)}`;
    if (!(await repo.findByNoRegistrasi(kandidat))) return kandidat;
  }
  throw new Error('Gagal membuat nomor registrasi unik setelah 20 percobaan');
}
