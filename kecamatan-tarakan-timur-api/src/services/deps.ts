import type { AppConfig } from '../config/env.js';
import type { Repositories } from '../repositories/interfaces.js';

export interface ServiceDeps {
  repos: Repositories;
  config: AppConfig;
  /** Sumber waktu; bisa diganti di tes. */
  now: () => Date;
}
