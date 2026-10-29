import type { Services } from '../container.js';
import type { Halaman } from '../repositories/interfaces.js';
import type { PagingQuery } from '../schemas/common.schema.js';
import type { AjukanBody, KeputusanBody, LacakBody, RevisiBody, SerahkanBody, VerifikasiBody } from '../schemas/pengajuan.schema.js';
import type { User } from '../types/user.js';

const paging = (q: PagingQuery) => ({ page: q.page ?? 1, limit: q.limit ?? 20 });

function denganMeta<T>(hal: Halaman<T>, ekstra: Record<string, unknown> = {}) {
  return {
    data: hal.items,
    meta: { page: hal.page, limit: hal.limit, total: hal.total, total_halaman: Math.max(1, Math.ceil(hal.total / hal.limit)), ...ekstra },
  };
}

/** Penghubung HTTP ↔ service: bentuk respons { data, meta? }. Logika bisnis ada di service. */
export class PengajuanController {
  constructor(private readonly s: Services) {}

  async ajukan(user: User, body: AjukanBody) {
    return { data: await this.s.pengajuan.ajukan(user, body) };
  }

  async saya(user: User, q: PagingQuery) {
    return denganMeta(await this.s.pengajuan.listSaya(user, paging(q)));
  }

  async antrian(user: User, q: PagingQuery) {
    const { status_antrian, ...hal } = await this.s.pengajuan.antrian(user, paging(q));
    return denganMeta(hal, { status_antrian });
  }

  async detail(user: User, id: string) {
    return { data: await this.s.pengajuan.detail(user, id) };
  }

  async lacak(body: LacakBody) {
    return { data: await this.s.pengajuan.lacak(body.no_registrasi, body.last_4_digit_hp) };
  }

  async revisi(user: User, id: string, body: RevisiBody) {
    return { data: await this.s.pengajuan.revisi(user, id, body) };
  }

  async verifikasi(user: User, id: string, body: VerifikasiBody) {
    return { data: await this.s.pengajuan.verifikasi(user, id, body) };
  }

  async parafKasi(user: User, id: string, body: KeputusanBody) {
    return { data: await this.s.pengajuan.parafKasi(user, id, body) };
  }

  async tteCamat(user: User, id: string, body: KeputusanBody) {
    return { data: await this.s.pengajuan.tteCamat(user, id, body) };
  }

  async serahkan(user: User, id: string, body: SerahkanBody) {
    return { data: await this.s.pengajuan.serahkan(user, id, body.version) };
  }

  async statistik(user: User) {
    return { data: await this.s.statistik.ringkasan(user) };
  }
}
