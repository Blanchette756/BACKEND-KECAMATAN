import { buildApp } from './app.js';
import { ConfigError, loadConfig, loadDotEnvFile } from './config/env.js';
import { createContainer } from './container.js';
import { DataValidationError } from './database/data-loader.js';
import { seedDemoPengajuan } from './database/seed-demo.js';

async function main(): Promise<void> {
  loadDotEnvFile();
  const config = loadConfig();
  const container = createContainer(config);
  const app = await buildApp(container);

  if (config.authMode === 'mock' && config.nodeEnv === 'production') {
    app.log.warn('⚠ AUTH MOCK AKTIF DI PRODUCTION (ALLOW_MOCK_AUTH_IN_PRODUCTION=true). Hanya untuk server DEMO berisi data dummy!');
  }
  if (!config.nodeEnvEksplisit) {
    app.log.warn('⚠ NODE_ENV tidak diisi, dianggap "development". Di server, selalu isi NODE_ENV=production.');
  }

  if (config.seedDemoPengajuan) {
    const contoh = await seedDemoPengajuan(container);
    if (config.nodeEnv === 'production') {
      // Jangan tulis pasangan nomor registrasi + 4 digit HP ke log server production.
      app.log.info(`Data demo: ${contoh.length} contoh pengajuan dibuat`);
    } else {
      app.log.info({ contoh_lacak: contoh }, `Data demo: ${contoh.length} contoh pengajuan dibuat`);
    }
  }

  // Hentikan server dengan rapi saat Hostinger me-restart/deploy.
  for (const sinyal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sinyal, () => {
      app.log.info(`${sinyal} diterima, menutup server...`);
      app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  await app.listen({ port: config.port, host: config.host });
  if (config.enableDocs) app.log.info(`Dokumentasi API: http://localhost:${config.port}/docs`);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError || err instanceof DataValidationError) {
    console.error(`\n✘ Server tidak dijalankan.\n${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
