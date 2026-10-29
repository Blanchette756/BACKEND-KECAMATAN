# Changelog

## 0.2.0: perbaikan hasil security audit run-1

Sumber: `cloudflare/security-audit-skill`, profil `quick`, scope `src/` + `data/`,
commit `3fdacfa`. Audit tidak menemukan temuan `confirmed`; ada 4 temuan `needs_validation`.
Keempatnya divalidasi ulang dengan menjalankan kode di lingkungan Linux terisolasi, **terbukti**,
lalu diperbaiki. Setiap perbaikan punya tes regresi di `test/audit-run1.test.ts`, dengan nama
`describe` yang sama dengan fingerprint temuannya.

### Temuan yang diperbaiki

| # | Fingerprint | Hasil validasi (sebelum) | Perbaikan |
|---|---|---|---|
| 1 | `src/schemas/auth.schema.ts:MockLoginBodySchema.email:polynomial-regex` | Waktu tumbuh kuadratik: 16 rb titik 268 ms, 32 rb titik 729 ms, 200 rb titik **28 detik** (satu request bisa membekukan server untuk semua pengguna) | Pola email baru yang linear (`src/constants/pola.ts`), juga dipakai di `src/types/user.ts`. Body `/auth/mock-login` dan `/pengajuan/lacak` dibatasi 1 KiB (413) |
| 2 | `src/config/env.ts:loadConfig:trustProxy-boolean-rate-limit-client-ip` | `TRUST_PROXY=true` + X-Forwarded-For berganti: rate limit lacak tidak pernah aktif (404×4, tanpa 429). `false` di balik proxy: semua pengunjung berbagi satu jatah | `TRUST_PROXY` sekarang `false` atau daftar IP/CIDR/`loopback`/`uniquelocal`. `true` dan angka ditolak saat start. Ditambah kunci lacak per nomor registrasi (5 gagal, kunci 15 menit) sebagai lapisan kedua |
| 3 | `src/services/auth.service.ts:AuthService.mockLogin:unbounded-session-audit-retention` | 2.000 login menghasilkan 2.000 sesi + 2.000 entri audit, tanpa batas | Maksimal 5 sesi per akun (sesi tertua dicabut); jejak audit berupa ring buffer `AUDIT_LOG_MAX` (default 10.000) |
| 4 | `presenter.detailPengajuan:riwayat-catatan:approval-actions-not-internal` | Warga bisa membaca "Balasan untuk Kasi…" dan "Untuk Camat…" | Denylist diganti **allowlist**: warga hanya melihat catatan revisi dan alasan penolakan |

### Hardening dari catatan audit

- Kasi tanpa seksi ditolak di antrian dan detail (fail closed).
- Statistik untuk Kasi dibatasi ke seksinya sendiri.
- Jejak audit `LIHAT_PENGAJUAN` juga dicatat pada respons aksi petugas, tidak hanya pada GET detail.
- Nama file divalidasi setelah di-trim (nama seperti `"  .env.pdf"` tidak lagi lolos). Karakter
  pengarah bidi dan zero-width ditolak di nama file dan isian teks.
- Data contoh (`SEED_DEMO_PENGAJUAN`) default mati di production, dan pasangan nomor registrasi +
  4 digit HP tidak ditulis ke log production.
- `/health` tidak menyebut `auth_mode` di production.
- Peringatan saat start bila `NODE_ENV` tidak diisi.

### Sengaja belum diubah (dicatat untuk Fase 2)

- `nomor_surat` dialokasikan sebelum penyimpanan yang dijaga `version`, sehingga balapan bisa
  menyisakan nomor yang terlewat. Akan diselesaikan dengan transaksi database di Fase 2.
- Kode TTE simulasi memakai SHA-256 tanpa kunci. Tidak dipakai untuk verifikasi apa pun; akan
  diganti TTE BSrE.
- Penghitung rate limit ada di memori satu proses. Akurat selama aplikasi berjalan satu proses
  (Hostinger); di Fase 2 bisa dipindah ke store bersama bila perlu.
- Login masih mock (by design Fase 1).

### Langkah berikutnya

Jalankan audit run-2. Skill akan membaca hasil run-1, memvalidasi ulang bagian yang berubah, dan
fokus ke celah yang belum tercakup (misalnya `package.json`/lockfile yang di run-1 di luar scope).
