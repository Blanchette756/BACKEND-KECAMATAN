import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import type { AuthService } from '../services/auth.service.js';
import type { Role } from '../types/common.js';
import type { User } from '../types/user.js';
import { forbidden, unauthorized } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** User yang sedang login (diisi oleh hook `wajibLogin`). */
    authUser: User | null;
  }
}

const POLA_BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

export function ambilToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const m = POLA_BEARER.exec(header.trim());
  return m?.[1] ?? null;
}

/**
 * Membuat hook autentikasi & otorisasi.
 * Dipasang di `onRequest` (tahap paling awal) sehingga permintaan tanpa login ditolak
 * SEBELUM body dibaca & divalidasi.  Pemakaian di route:  onRequest: guards.wajibRole('ADMIN')
 */
export function createAuthGuards(authService: AuthService) {
  const wajibLogin: onRequestAsyncHookHandler = async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = ambilToken(req);
    if (!token) throw unauthorized();
    const user = await authService.verifyToken(token);
    if (!user) throw unauthorized('Sesi tidak valid atau sudah berakhir, silakan login ulang');
    req.authUser = user;
  };

  const wajibRole = (...roles: Role[]): onRequestAsyncHookHandler[] => [
    wajibLogin,
    async (req: FastifyRequest) => {
      if (!req.authUser || !roles.includes(req.authUser.role)) throw forbidden();
    },
  ];

  return { wajibLogin, wajibRole };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;

/** Ambil user dari request yang sudah melewati guard. */
export function userDari(req: FastifyRequest): User {
  if (!req.authUser) throw unauthorized();
  return req.authUser;
}
