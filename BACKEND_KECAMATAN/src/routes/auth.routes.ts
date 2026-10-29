import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppConfig } from '../config/env.js';
import type { AuthController } from '../controllers/auth.controller.js';
import type { AuthGuards } from '../plugins/auth.js';
import { LoginResponseSchema, MeResponseSchema, MockLoginBodySchema } from '../schemas/auth.schema.js';
import { errorResponses } from '../schemas/common.schema.js';
import { BODY_LIMIT_KECIL } from '../constants/pola.js';

interface Opts {
  controller: AuthController;
  guards: AuthGuards;
  config: AppConfig;
}

export const authRoutes: FastifyPluginAsyncTypebox<Opts> = async (app, { controller, guards, config }) => {
  app.post(
    '/auth/mock-login',
    {
      bodyLimit: BODY_LIMIT_KECIL,
      config: { rateLimit: { max: config.rateLimit.login, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Login MOCK dengan email akun dummy (khusus Fase 1, tanpa password)',
        body: MockLoginBodySchema,
        response: { 200: LoginResponseSchema, 401: errorResponses[401], 429: errorResponses[429] },
      },
    },
    async (req) => controller.mockLogin(req.body),
  );

  app.get(
    '/auth/me',
    {
      onRequest: guards.wajibLogin,
      schema: { tags: ['Auth'], summary: 'Profil user yang sedang login', security: [{ bearerAuth: [] }], response: { 200: MeResponseSchema, 401: errorResponses[401] } },
    },
    async (req) => controller.me(req),
  );

  app.post(
    '/auth/logout',
    { onRequest: guards.wajibLogin, schema: { tags: ['Auth'], summary: 'Akhiri sesi', security: [{ bearerAuth: [] }] } },
    async (req, reply) => controller.logout(req, reply),
  );
};
