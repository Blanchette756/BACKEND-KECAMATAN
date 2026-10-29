import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createContainer, type Container } from '../src/container.js';
import { contohBerkas } from '../src/database/seed-demo.js';

export interface TestCtx {
  app: FastifyInstance;
  c: Container;
}

/** App baru + store baru untuk setiap tes, supaya tes tidak saling memengaruhi. */
export async function buatApp(env: Record<string, string> = {}): Promise<TestCtx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    SEED_DEMO_PENGAJUAN: 'false',
    RATE_LIMIT_GLOBAL: '10000',
    RATE_LIMIT_LACAK: '10000',
    RATE_LIMIT_LOGIN: '10000',
    ...env,
  });
  const c = createContainer(config);
  const app = await buildApp(c);
  await app.ready();
  return { app, c };
}

export const EMAIL = {
  warga1: 'warga1@example.com',
  warga2: 'warga2@example.com',
  admin: 'admin@example.com',
  kasi: 'kasi.tapem@example.com',
  kasiKesra: 'kasi.kesra@example.com',
  camat: 'camat@example.com',
} as const;

export async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/mock-login', payload: { email } });
  if (res.statusCode !== 200) throw new Error(`Login ${email} gagal: ${res.body}`);
  return res.json().data.token as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Ajukan pengajuan dengan berkas lengkap otomatis sesuai syarat yang berlaku. */
export async function ajukan(ctx: TestCtx, token: string, idLayanan: string, data: Record<string, unknown>) {
  const layanan = await ctx.c.services.layanan.detail(idLayanan);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/pengajuan',
    headers: bearer(token),
    payload: { id_layanan: idLayanan, data_formulir: data, berkas: contohBerkas(layanan, data) },
  });
  if (res.statusCode !== 201) throw new Error(`Ajukan gagal (${res.statusCode}): ${res.body}`);
  return res.json().data;
}

export async function patch(app: FastifyInstance, token: string, url: string, payload: unknown) {
  return app.inject({ method: 'PATCH', url, headers: bearer(token), payload: payload as Record<string, unknown> });
}

export const DATA_PENGANTAR = { perihal: 'Keperluan bank', ditujukan_kepada: 'Bank Contoh' };
export const DATA_LEGALISIR = { jenis_dokumen: 'Ijazah', jumlah_lembar: 2 };
