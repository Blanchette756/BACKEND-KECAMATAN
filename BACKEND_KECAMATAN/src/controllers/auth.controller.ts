import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Services } from '../container.js';
import { ambilToken, userDari } from '../plugins/auth.js';
import type { MockLoginBody } from '../schemas/auth.schema.js';
import { toUserPublik } from '../services/presenter.js';

export class AuthController {
  constructor(private readonly s: Services) {}

  async mockLogin(body: MockLoginBody) {
    const hasil = await this.s.auth.mockLogin(body.email);
    return {
      data: { token: hasil.token, token_type: 'Bearer' as const, kedaluwarsa: hasil.kedaluwarsa, user: toUserPublik(hasil.user) },
    };
  }

  me(req: FastifyRequest) {
    return { data: toUserPublik(userDari(req)) };
  }

  async logout(req: FastifyRequest, reply: FastifyReply) {
    const token = ambilToken(req);
    if (token) await this.s.auth.logout(token);
    return reply.status(204).send();
  }
}
