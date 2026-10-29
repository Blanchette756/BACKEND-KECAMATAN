import type { AppConfig } from './config/env.js';
import { loadMasterData, type MasterData } from './database/data-loader.js';
import { MemoryStore } from './database/memory-store.js';
import { createMemoryRepositories } from './repositories/index.js';
import type { Repositories } from './repositories/interfaces.js';
import { AuthService } from './services/auth.service.js';
import type { ServiceDeps } from './services/deps.js';
import { LayananService } from './services/layanan.service.js';
import { PengajuanService } from './services/pengajuan.service.js';
import { StatistikService } from './services/statistik.service.js';
import { WorkflowService } from './services/workflow.service.js';

export interface Services {
  auth: AuthService;
  layanan: LayananService;
  pengajuan: PengajuanService;
  workflow: WorkflowService;
  statistik: StatistikService;
}

export interface Container {
  config: AppConfig;
  repos: Repositories;
  services: Services;
  /** Hanya ada untuk implementasi in-memory (Fase 1). */
  store: MemoryStore;
}

export interface ContainerOptions {
  master?: MasterData;
  now?: () => Date;
}

/** Merakit store → repository → service. Tidak ada `new` di tempat lain. */
export function createContainer(config: AppConfig, opts: ContainerOptions = {}): Container {
  const master = opts.master ?? loadMasterData(config.dataDir);
  const store = new MemoryStore(master);
  const repos = createMemoryRepositories(store);
  const deps: ServiceDeps = { repos, config, now: opts.now ?? (() => new Date()) };

  const workflow = new WorkflowService(deps);
  const services: Services = {
    auth: new AuthService(deps),
    layanan: new LayananService(deps),
    pengajuan: new PengajuanService(deps, workflow),
    workflow,
    statistik: new StatistikService(deps),
  };
  return { config, repos, services, store };
}
