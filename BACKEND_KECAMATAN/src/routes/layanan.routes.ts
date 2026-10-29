import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { LayananController } from '../controllers/layanan.controller.js';
import { errorResponses, DataSchema, LayananIdParamSchema } from '../schemas/common.schema.js';

interface Opts {
  controller: LayananController;
}

/** Endpoint publik (tanpa login): informasi layanan & persyaratan. */
export const layananRoutes: FastifyPluginAsyncTypebox<Opts> = async (app, { controller }) => {
  app.get('/layanan', { schema: { tags: ['Layanan'], summary: 'Daftar layanan kecamatan' } }, async () => controller.list());

  app.get(
    '/layanan/:id',
    { schema: { tags: ['Layanan'], summary: 'Detail layanan + definisi formulir + persyaratan', params: LayananIdParamSchema, response: { 200: DataSchema, 404: errorResponses[404] } } },
    async (req) => controller.detail(req.params.id),
  );

  app.get(
    '/layanan/:id/persyaratan',
    { schema: { tags: ['Layanan'], summary: 'Daftar persyaratan berkas sebuah layanan', params: LayananIdParamSchema, response: { 200: DataSchema, 404: errorResponses[404] } } },
    async (req) => controller.persyaratan(req.params.id),
  );

  app.get('/kelurahan', { schema: { tags: ['Layanan'], summary: 'Daftar kelurahan di Kecamatan Tarakan Timur' } }, async () => controller.kelurahan());

  app.get('/kontak', { schema: { tags: ['Layanan'], summary: 'Kontak pengaduan kecamatan' } }, async () => controller.kontak());
};
