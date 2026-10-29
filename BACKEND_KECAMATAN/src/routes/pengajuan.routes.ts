import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppConfig } from '../config/env.js';
import type { PengajuanController } from '../controllers/pengajuan.controller.js';
import { userDari, type AuthGuards } from '../plugins/auth.js';
import { createdResponses, errorResponses, okResponses, PagingQuerySchema, PengajuanIdParamSchema } from '../schemas/common.schema.js';
import {
  AjukanBodySchema,
  KeputusanBodySchema,
  LacakBodySchema,
  LacakResponseSchema,
  RevisiBodySchema,
  SerahkanBodySchema,
  VerifikasiBodySchema,
} from '../schemas/pengajuan.schema.js';
import { BODY_LIMIT_KECIL } from '../constants/pola.js';

interface Opts {
  controller: PengajuanController;
  guards: AuthGuards;
  config: AppConfig;
}

const bearer = [{ bearerAuth: [] }];

export const pengajuanRoutes: FastifyPluginAsyncTypebox<Opts> = async (app, { controller, guards, config }) => {
  // ---------------------------------------------------------------- publik
  app.post(
    '/pengajuan/lacak',
    {
      bodyLimit: BODY_LIMIT_KECIL,
      config: { rateLimit: { max: config.rateLimit.lacak, timeWindow: '1 minute' } },
      schema: {
        tags: ['Pengajuan – Publik'],
        summary: 'Lacak status tanpa login (nomor registrasi + 4 digit terakhir HP)',
        body: LacakBodySchema,
        // Skema respons membatasi field yang keluar: data pribadi tidak mungkin ikut terkirim.
        response: { 200: LacakResponseSchema, 404: errorResponses[404], 429: errorResponses[429] },
      },
    },
    async (req) => controller.lacak(req.body),
  );

  // ---------------------------------------------------------------- warga
  app.post(
    '/pengajuan',
    {
      onRequest: guards.wajibRole('WARGA'),
      schema: { tags: ['Pengajuan – Warga'], summary: 'Ajukan permohonan baru', security: bearer, body: AjukanBodySchema, response: createdResponses },
    },
    async (req, reply) => reply.status(201).send(await controller.ajukan(userDari(req), req.body)),
  );

  app.get(
    '/pengajuan/saya',
    {
      onRequest: guards.wajibRole('WARGA'),
      schema: { tags: ['Pengajuan – Warga'], summary: 'Daftar pengajuan milik saya', security: bearer, querystring: PagingQuerySchema },
    },
    async (req) => controller.saya(userDari(req), req.query),
  );

  app.patch(
    '/pengajuan/:id/revisi',
    {
      onRequest: guards.wajibRole('WARGA'),
      schema: {
        tags: ['Pengajuan – Warga'],
        summary: 'Kirim perbaikan setelah status PERLU_REVISI',
        security: bearer,
        params: PengajuanIdParamSchema,
        body: RevisiBodySchema,
        response: okResponses,
      },
    },
    async (req) => controller.revisi(userDari(req), req.params.id, req.body),
  );

  // ---------------------------------------------------------------- petugas
  app.get(
    '/pengajuan/antrian',
    {
      onRequest: guards.wajibRole('ADMIN', 'KASI', 'CAMAT'),
      schema: {
        tags: ['Pengajuan – Petugas'],
        summary: 'Antrian kerja sesuai role (Kasi otomatis difilter per seksi)',
        security: bearer,
        querystring: PagingQuerySchema,
      },
    },
    async (req) => controller.antrian(userDari(req), req.query),
  );

  app.get(
    '/pengajuan/statistik',
    {
      onRequest: guards.wajibRole('ADMIN', 'KASI', 'CAMAT'),
      schema: { tags: ['Pengajuan – Petugas'], summary: 'Ringkasan statistik & durasi tiap tahap layanan', security: bearer },
    },
    async (req) => controller.statistik(userDari(req)),
  );

  app.patch(
    '/pengajuan/:id/verifikasi',
    {
      onRequest: guards.wajibRole('ADMIN'),
      schema: {
        tags: ['Pengajuan – Petugas'],
        summary: 'Admin: setujui kelengkapan, minta revisi, atau tolak',
        security: bearer,
        params: PengajuanIdParamSchema,
        body: VerifikasiBodySchema,
        response: okResponses,
      },
    },
    async (req) => controller.verifikasi(userDari(req), req.params.id, req.body),
  );

  app.patch(
    '/pengajuan/:id/paraf-kasi',
    {
      onRequest: guards.wajibRole('KASI'),
      schema: {
        tags: ['Pengajuan – Petugas'],
        summary: 'Kasi: paraf (SETUJUI), KEMBALIKAN ke admin, atau TOLAK',
        security: bearer,
        params: PengajuanIdParamSchema,
        body: KeputusanBodySchema,
        response: okResponses,
      },
    },
    async (req) => controller.parafKasi(userDari(req), req.params.id, req.body),
  );

  app.patch(
    '/pengajuan/:id/tte-camat',
    {
      onRequest: guards.wajibRole('CAMAT'),
      schema: {
        tags: ['Pengajuan – Petugas'],
        summary: 'Camat: tanda tangan (SIMULASI TTE), KEMBALIKAN ke admin, atau TOLAK',
        security: bearer,
        params: PengajuanIdParamSchema,
        body: KeputusanBodySchema,
        response: okResponses,
      },
    },
    async (req) => controller.tteCamat(userDari(req), req.params.id, req.body),
  );

  app.patch(
    '/pengajuan/:id/serahkan',
    {
      onRequest: guards.wajibRole('ADMIN'),
      schema: {
        tags: ['Pengajuan – Petugas'],
        summary: 'Admin: catat dokumen fisik sudah diserahkan (layanan AMBIL_DI_KANTOR)',
        security: bearer,
        params: PengajuanIdParamSchema,
        body: SerahkanBodySchema,
        response: okResponses,
      },
    },
    async (req) => controller.serahkan(userDari(req), req.params.id, req.body),
  );

  // ---------------------------------------------------------------- semua role
  app.get(
    '/pengajuan/:id',
    {
      onRequest: guards.wajibLogin,
      schema: {
        tags: ['Pengajuan – Warga', 'Pengajuan – Petugas'],
        summary: 'Detail pengajuan (warga: miliknya; Kasi: seksinya; Admin/Camat: semua)',
        security: bearer,
        params: PengajuanIdParamSchema,
        response: okResponses,
      },
    },
    async (req) => controller.detail(userDari(req), req.params.id),
  );
};
