import type { MemoryStore } from '../database/memory-store.js';
import type { User } from '../types/user.js';
import type { UserRepository } from './interfaces.js';

export class MemoryUserRepository implements UserRepository {
  constructor(private readonly store: MemoryStore) {}

  async findById(id: string): Promise<User | null> {
    const u = this.store.users.get(id);
    return u ? structuredClone(u) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const target = email.trim().toLowerCase();
    for (const u of this.store.users.values()) {
      if (u.email.toLowerCase() === target) return structuredClone(u);
    }
    return null;
  }
}
