import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../utils/errors.js';

/**
 * Semua error diubah ke satu format:  { "error": { "code", "message", "details?" } }
 * Error tak terduga (bug) selalu dijawab 500 dengan pesan umum; detailnya hanya di log server.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      });
    }

    const fe = err as FastifyError;
    if (fe.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Format permintaan tidak valid',
          details: fe.validation.map((v) => ({
            lokasi: `${fe.validationContext ?? 'body'}${v.instancePath || ''}`,
            pesan: v.message ?? 'tidak valid',
          })),
        },
      });
    }

    const status = typeof fe.statusCode === 'number' ? fe.statusCode : 500;
    if (status === 429) {
      return reply.status(429).send({ error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.' } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
    }

    req.log.error({ err }, 'Kesalahan tak terduga');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } });
  });
}
