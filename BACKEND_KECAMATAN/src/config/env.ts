import { existsSync } from 'node:fs';
import path from 'node:path';

export type NodeEnv = 'development' | 'test' | 'production';
export type AuthMode = 'mock';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  timezone: string;
  corsOrigins: string[];
  trustProxy: boolean;
  authMode: AuthMode;
  allowMockAuthInProduction: boolean;
  sessionTtlMinutes: number;
  enableDocs: boolean;
  maxFileBytes: number;
  maxFilesPerPengajuan: number;
  rateLimit: { global: number; lacak: number; login: number };
  seedDemoPengajuan: boolean;
  dataDir: string;
  logLevel: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`[config] ${message}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback: string): string {
  const v = env[key];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function int(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${key} harus bilangan bulat antara ${min}–${max}, didapat "${raw}"`);
  }
  return n;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new ConfigError(`${key} harus "true" atau "false", didapat "${raw}"`);
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Membaca & memvalidasi konfigurasi. Fungsi murni (tidak membaca file),
 * sehingga mudah dites. Melempar ConfigError bila ada yang tidak valid.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const nodeEnvRaw = str(env, 'NODE_ENV', 'development');
  if (nodeEnvRaw !== 'development' && nodeEnvRaw !== 'test' && nodeEnvRaw !== 'production') {
    throw new ConfigError(`NODE_ENV tidak dikenal: "${nodeEnvRaw}"`);
  }
  const nodeEnv: NodeEnv = nodeEnvRaw;
  const isProd = nodeEnv === 'production';

  const authModeRaw = str(env, 'AUTH_MODE', 'mock');
  if (authModeRaw !== 'mock') {
    throw new ConfigError(`AUTH_MODE "${authModeRaw}" belum didukung di Fase 1 (hanya "mock")`);
  }
  const authMode: AuthMode = authModeRaw;
  const allowMockAuthInProduction = bool(env, 'ALLOW_MOCK_AUTH_IN_PRODUCTION', false);

  // Pengaman utama: auth mock = siapa pun bisa login sebagai siapa pun.
  // Tidak boleh lolos ke production tanpa keputusan sadar.
  if (isProd && authMode === 'mock' && !allowMockAuthInProduction) {
    throw new ConfigError(
      'AUTH_MODE=mock tidak boleh dipakai di NODE_ENV=production. ' +
        'Jika ini memang server DEMO berisi data dummy, set ALLOW_MOCK_AUTH_IN_PRODUCTION=true.',
    );
  }

  const timezone = str(env, 'APP_TIMEZONE', 'Asia/Makassar');
  if (!isValidTimezone(timezone)) throw new ConfigError(`APP_TIMEZONE tidak valid: "${timezone}"`);

  const corsOrigins = str(env, 'CORS_ORIGINS', isProd ? '' : 'http://localhost:3001,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const origin of corsOrigins) {
    if (origin === '*') throw new ConfigError('CORS_ORIGINS tidak boleh "*" (sebutkan domain frontend secara eksplisit)');
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      throw new ConfigError(`CORS_ORIGINS berisi origin tidak valid: "${origin}" (format: https://domain.tld tanpa garis miring akhir)`);
    }
  }

  return {
    nodeEnv,
    port: int(env, 'PORT', 3000, 1, 65535),
    host: str(env, 'HOST', '0.0.0.0'),
    timezone,
    corsOrigins,
    trustProxy: bool(env, 'TRUST_PROXY', false),
    authMode,
    allowMockAuthInProduction,
    sessionTtlMinutes: int(env, 'SESSION_TTL_MINUTES', 480, 5, 7 * 24 * 60),
    enableDocs: bool(env, 'ENABLE_DOCS', !isProd),
    maxFileBytes: int(env, 'MAX_FILE_MB', 2, 1, 20) * 1024 * 1024,
    maxFilesPerPengajuan: int(env, 'MAX_FILES_PER_PENGAJUAN', 15, 1, 50),
    rateLimit: {
      global: int(env, 'RATE_LIMIT_GLOBAL', 120, 1, 100_000),
      lacak: int(env, 'RATE_LIMIT_LACAK', 10, 1, 10_000),
      login: int(env, 'RATE_LIMIT_LOGIN', 10, 1, 10_000),
    },
    seedDemoPengajuan: bool(env, 'SEED_DEMO_PENGAJUAN', nodeEnv !== 'test'),
    dataDir: path.resolve(str(env, 'DATA_DIR', 'data')),
    logLevel: str(env, 'LOG_LEVEL', nodeEnv === 'test' ? 'silent' : 'info'),
  };
}

/** Memuat file .env (jika ada) ke process.env. Variabel yang sudah ada tidak ditimpa. */
export function loadDotEnvFile(file = '.env'): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
