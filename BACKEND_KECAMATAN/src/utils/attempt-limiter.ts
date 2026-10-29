/**
 * Penghitung percobaan gagal per kunci (mis. per nomor registrasi) dengan jendela waktu.
 * Melengkapi rate limit per-IP: walaupun penyerang memakai banyak IP, satu nomor
 * registrasi tetap hanya bisa dicoba `maxGagal` kali per jendela (audit run-1 #2, defence in depth).
 *
 * Jumlah kunci yang dilacak dibatasi `kapasitas` agar memori tidak tumbuh tanpa batas.
 */
export class AttemptLimiter {
  private readonly data = new Map<string, { gagal: number; sampai: number }>();

  constructor(
    private readonly maxGagal: number,
    private readonly jendelaMs: number,
    private readonly kapasitas = 10_000,
  ) {}

  terkunci(kunci: string, nowMs: number): boolean {
    const d = this.data.get(kunci);
    if (!d) return false;
    if (d.sampai <= nowMs) {
      this.data.delete(kunci);
      return false;
    }
    return d.gagal >= this.maxGagal;
  }

  catatGagal(kunci: string, nowMs: number): void {
    const d = this.data.get(kunci);
    if (d && d.sampai > nowMs) {
      d.gagal += 1;
      return;
    }
    if (this.data.size >= this.kapasitas) this.bersihkan(nowMs);
    if (this.data.size >= this.kapasitas) {
      // Buang entri tertua (Map menjaga urutan sisip).
      const tertua = this.data.keys().next().value;
      if (tertua !== undefined) this.data.delete(tertua);
    }
    this.data.set(kunci, { gagal: 1, sampai: nowMs + this.jendelaMs });
  }

  reset(kunci: string): void {
    this.data.delete(kunci);
  }

  get ukuran(): number {
    return this.data.size;
  }

  private bersihkan(nowMs: number): void {
    for (const [k, d] of this.data) if (d.sampai <= nowMs) this.data.delete(k);
  }
}
