import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

/** ID internal acak (tidak berurutan), supaya tidak bisa ditebak dengan menggeser angka di URL. */
export const newId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/** Tanpa huruf/angka yang mirip (0/O, 1/I/L) agar mudah dibacakan lewat telepon. */
const ALFABET_KODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomKode(panjang: number): string {
  let out = '';
  for (let i = 0; i < panjang; i++) out += ALFABET_KODE[randomInt(ALFABET_KODE.length)];
  return out;
}

/** Tanggal YYYYMMDD menurut zona waktu tertentu (Tarakan = Asia/Makassar, WITA). */
export function tanggalRingkas(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function tahun(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(date);
}

/** Token sesi acak 256-bit. */
export const newToken = (): string => randomBytes(32).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
