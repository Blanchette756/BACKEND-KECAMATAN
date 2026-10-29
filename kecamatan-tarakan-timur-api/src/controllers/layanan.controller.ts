import type { Services } from '../container.js';

export class LayananController {
  constructor(private readonly s: Services) {}

  async list() {
    const data = await this.s.layanan.list();
    return { data, meta: { total: data.length } };
  }

  async detail(id: string) {
    return { data: await this.s.layanan.detail(id) };
  }

  async persyaratan(id: string) {
    return { data: await this.s.layanan.persyaratan(id) };
  }

  async kelurahan() {
    return { data: await this.s.layanan.kelurahan() };
  }

  async kontak() {
    return { data: await this.s.layanan.kontak() };
  }
}
