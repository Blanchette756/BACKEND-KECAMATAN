import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Lapisan keamanan HTTP:
 * - Helmet: header keamanan standar (HSTS, nosniff, frameguard, CSP, dst.)
 * - CORS: hanya origin frontend yang terdaftar; token lewat header (bukan cookie) → kebal CSRF
 * - Rate limit: global per IP + batas lebih ketat di endpoint login & lacak (lihat route config)
 * - Cache-Control: respons berisi data pribadi tidak boleh disimpan cache browser/proxy
 *
 * Catatan Hostinger: tidak ada Redis, jadi rate limit memakai memori proses.
 * Ini akurat karena aplikasi berjalan sebagai satu proses.
 */
export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  const isProd = config.nodeEnv === 'production';
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Halaman /docs (Swagger UI) memerlukan style inline & gambar data:
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Di lokal (http://localhost) jangan paksa https, agar /docs tetap bisa dibuka.
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    // HSTS hanya bermakna di domain ber-HTTPS (production).
    hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Permintaan tanpa Origin (curl, server-to-server, aplikasi mobile) tidak dibatasi CORS.
      if (!origin) return cb(null, true);
      cb(null, config.corsOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.global,
    timeWindow: '1 minute',
    // Respons 429 diformat oleh error handler.
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const url = req.url;
    const publik = /^\/api\/v1\/(layanan|kelurahan|kontak)(\/|\?|$)/.test(url);
    if (!reply.hasHeader('cache-control')) {
      reply.header('cache-control', publik && reply.statusCode < 400 ? 'public, max-age=300' : 'no-store');
    }
    return payload;
  });
}
