/**
 * Cek data master tanpa menjalankan server:  npm run validate-data
 * Jalankan setiap kali file di folder data/ diubah (mis. saat data asli kecamatan masuk).
 */
import { loadConfig, loadDotEnvFile } from '../config/env.js';
import { DataValidationError, loadMasterData } from '../database/data-loader.js';

loadDotEnvFile();
const { dataDir } = loadConfig({ ...process.env, NODE_ENV: 'development' });

try {
  const data = loadMasterData(dataDir);
  console.log(`✔ Data master valid (${dataDir})`);
  console.log(`  - ${data.layanan.length} layanan, ${data.layanan.reduce((n, l) => n + l.persyaratan.length, 0)} persyaratan`);
  console.log(`  - ${data.kelurahan.length} kelurahan`);
  console.log(`  - ${data.users.length} akun`);
  for (const l of data.layanan) {
    console.log(`    ${l.id_layanan}  ${l.nama_layanan.padEnd(42)} ${l.persyaratan.length} berkas  [${l.mode_penyerahan}]`);
  }
} catch (err) {
  if (err instanceof DataValidationError) {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
