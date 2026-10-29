/** 6571019900000001 → 6571********0001 */
export function maskNik(nik: string): string {
  if (nik.length < 8) return '*'.repeat(nik.length);
  return nik.slice(0, 4) + '*'.repeat(nik.length - 8) + nik.slice(-4);
}

/** 081200000001 → 0812****0001 */
export function maskHp(hp: string): string {
  if (hp.length < 8) return '*'.repeat(hp.length);
  return hp.slice(0, 4) + '*'.repeat(hp.length - 8) + hp.slice(-4);
}
