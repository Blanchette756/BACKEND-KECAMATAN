import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { TypeBoxValidatorCompiler, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Container } from './container.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerSecurity } from './plugins/security.js';
import { apiRoutes } from './routes/index.js';

/**
 * Membangun instance Fastify (tanpa listen) — dipakai server.ts dan tes.
 */
export async function buildApp(container: Container): Promise<FastifyInstance> {
  const { config } = container;

  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            // Jangan pernah menulis token/cookie ke log.
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: config.trustProxy,
    // Fase 1 hanya menerima metadata berkas (JSON kecil), bukan file.
    bodyLimit: 256 * 1024,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Validator TypeBox: field tak dikenal DITOLAK (bukan dibuang diam-diam) → cegah mass assignment;
  // konversi tipe hanya untuk querystring/params, body JSON tidak pernah diubah tipenya.
  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  app.decorateRequest('authUser', null);
  registerErrorHandler(app);
  await registerSecurity(app, config);

  if (config.enableDocs) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'API Pelayanan Publik Kecamatan Tarakan Timur',
          description:
            'Fase 1 (dummy-first). Login: POST /api/v1/auth/mock-login dengan email akun dummy, lalu klik **Authorize** dan tempel token.',
          version: '0.1.0',
        },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true });
  }

  await app.register(apiRoutes, { prefix: '/api/v1', container });

  return app;
}
