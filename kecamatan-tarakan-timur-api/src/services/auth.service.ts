import type { User } from '../types/user.js';
import { newId, newToken, sha256 } from '../utils/ids.js';
import { unauthorized } from '../utils/errors.js';
import type { ServiceDeps } from './deps.js';

export interface HasilLogin {
  token: string;
  kedaluwarsa: string;
  user: User;
}

/**
 * AUTH MOCK (Fase 1): login cukup dengan email akun dummy, tanpa password/OTP.
 * Tetap memakai token acak + sesi ber-kedaluwarsa, sehingga alur di frontend
 * (Authorization: Bearer <token>) sudah sama dengan versi produksi nanti.
 * Token tidak pernah disimpan mentah, hanya hash SHA-256-nya.
 */
export class AuthService {
  constructor(private readonly deps: ServiceDeps) {}

  async mockLogin(email: string): Promise<HasilLogin> {
    const { repos, config, now } = this.deps;
    const user = await repos.users.findByEmail(email);
    if (!user || !user.aktif) throw unauthorized('Email tidak terdaftar sebagai akun dummy');

    await repos.sesi.deleteExpired(now().getTime());
    const token = newToken();
    const kedaluwarsaMs = now().getTime() + config.sessionTtlMinutes * 60_000;
    await repos.sesi.create({ token_hash: sha256(token), id_user: user.id_user, kedaluwarsa_ms: kedaluwarsaMs });
    await repos.audit.add({
      id_log: newId('LOG'),
      waktu: now().toISOString(),
      id_user: user.id_user,
      role: user.role,
      aksi: 'LOGIN',
      target_id: null,
    });
    return { token, kedaluwarsa: new Date(kedaluwarsaMs).toISOString(), user };
  }

  /** Mengembalikan user pemilik token, atau null bila token tidak valid/kedaluwarsa. */
  async verifyToken(token: string): Promise<User | null> {
    const { repos, now } = this.deps;
    const hash = sha256(token);
    const sesi = await repos.sesi.findByHash(hash);
    if (!sesi) return null;
    if (sesi.kedaluwarsa_ms <= now().getTime()) {
      await repos.sesi.delete(hash);
      return null;
    }
    const user = await repos.users.findById(sesi.id_user);
    return user && user.aktif ? user : null;
  }

  async logout(token: string): Promise<void> {
    await this.deps.repos.sesi.delete(sha256(token));
  }
}
