import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { Container } from '../container.js';
import { AuthController } from '../controllers/auth.controller.js';
import { LayananController } from '../controllers/layanan.controller.js';
import { PengajuanController } from '../controllers/pengajuan.controller.js';
import { createAuthGuards } from '../plugins/auth.js';
import { authRoutes } from './auth.routes.js';
import { layananRoutes } from './layanan.routes.js';
import { pengajuanRoutes } from './pengajuan.routes.js';

/** Semua endpoint di bawah prefix /api/v1 */
export const apiRoutes: FastifyPluginAsyncTypebox<{ container: Container }> = async (app, { container }) => {
  const { services, config } = container;
  const guards = createAuthGuards(services.auth);

  app.get('/health', { schema: { tags: ['Sistem'], summary: 'Cek server hidup' } }, async () => ({
    status: 'ok',
    // Detail mode auth hanya ditampilkan di luar production.
    ...(config.nodeEnv === 'production' ? {} : { auth_mode: config.authMode }),
    waktu: new Date().toISOString(),
  }));

  await app.register(authRoutes, { controller: new AuthController(services), guards, config });
  await app.register(layananRoutes, { controller: new LayananController(services) });
  await app.register(pengajuanRoutes, { controller: new PengajuanController(services), guards, config });
};
