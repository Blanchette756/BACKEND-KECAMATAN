---

## 1. Menjalankan di komputer (Windows / PowerShell)

```powershell
cd C:\KECAMATAN\kecamatan-tarakan-timur-api
npm install
copy .env.example .env      # opsional, nilai default sudah bisa dipakai
npm run dev
```

Buka:
- **http://localhost:3000/docs** → dokumentasi API interaktif (Swagger), bisa langsung dicoba
- **http://localhost:3000/api/v1/layanan** → daftar 9 layanan

Saat start, server otomatis membuat **7 contoh pengajuan** di berbagai status. Nomor registrasinya
tercetak di log (`contoh_lacak`), bisa dipakai untuk mencoba fitur lacak.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Mode pengembangan, auto-reload saat file diubah |
| `npm test` | Menjalankan semua tes otomatis (65 tes) |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm run validate-data` | Cek isi folder `data/` (jalankan setiap kali data diubah) |
| `npm run check` | Ketiganya sekaligus, jalankan sebelum commit |
| `npm run build` lalu `npm start` | Versi production (untuk Hostinger) |
| `npm run audit:deps` | Cek kerentanan dependensi |

---

## 2. Akun dummy

Login: `POST /api/v1/auth/mock-login` dengan body `{ "email": "..." }`, tanpa password.
Responsnya berisi `token`; kirim di header `Authorization: Bearer <token>`.
Di Swagger: jalankan login, salin token, klik tombol **Authorize**.

| Email | Role | Keterangan |
|---|---|---|
| `warga1@example.com` | WARGA | 4 digit HP: `0001` |
| `warga2@example.com` | WARGA | 4 digit HP: `0002` |
| `warga3@example.com` | WARGA | 4 digit HP: `0003` |
| `admin@example.com` | ADMIN | Petugas pelayanan |
| `kasi.tapem@example.com` | KASI | Seksi Tata Pemerintahan (semua 9 layanan) |
| `kasi.kesra@example.com` | KASI | Seksi Kesra, untuk menguji bahwa Kasi tidak bisa melihat seksi lain |
| `camat@example.com` | CAMAT | |

Semua nama, NIK, email, dan nomor HP di atas **fiktif**.

---

## 3. Endpoint

Semua endpoint diawali `/api/v1`. Format sukses `{ "data": ..., "meta"?: ... }`, format error
`{ "error": { "code", "message", "details"? } }`.

| Method | Path | Akses | Fungsi |
|---|---|---|---|
| GET | `/health` | publik | Cek server |
| GET | `/layanan` | publik | Daftar 9 layanan |
| GET | `/layanan/:id` | publik | Detail + definisi formulir + persyaratan |
| GET | `/layanan/:id/persyaratan` | publik | Persyaratan berkas |
| GET | `/kelurahan` | publik | Daftar kelurahan |
| GET | `/kontak` | publik | Kontak pengaduan |
| POST | `/pengajuan/lacak` | publik | Lacak: `{ no_registrasi, last_4_digit_hp }` |
| POST | `/auth/mock-login` | publik | Login dummy |
| GET | `/auth/me` | login | Profil sendiri |
| POST | `/auth/logout` | login | Cabut token |
| POST | `/pengajuan` | WARGA | Ajukan permohonan baru |
| GET | `/pengajuan/saya` | WARGA | Pengajuan milik sendiri (`?page=&limit=`) |
| PATCH | `/pengajuan/:id/revisi` | WARGA | Kirim perbaikan saat `PERLU_REVISI` |
| GET | `/pengajuan/:id` | login | Detail (warga: miliknya; Kasi: seksinya; Admin/Camat: semua) |
| GET | `/pengajuan/antrian` | ADMIN/KASI/CAMAT | Antrian kerja sesuai role |
| GET | `/pengajuan/statistik` | ADMIN/KASI/CAMAT | Jumlah per status & durasi tiap tahap |
| PATCH | `/pengajuan/:id/verifikasi` | ADMIN | `SETUJUI` / `MINTA_REVISI` / `TOLAK` |
| PATCH | `/pengajuan/:id/paraf-kasi` | KASI | `SETUJUI` / `KEMBALIKAN` / `TOLAK` |
| PATCH | `/pengajuan/:id/tte-camat` | CAMAT | `SETUJUI` / `KEMBALIKAN` / `TOLAK` |
| PATCH | `/pengajuan/:id/serahkan` | ADMIN | Dokumen fisik sudah diserahkan (legalisasi/legalisir) |

Setiap aksi PATCH wajib menyertakan `version` (nilai terakhir dari respons detail). Jika dua petugas
memproses berkas yang sama bersamaan, yang kedua mendapat `409 VERSI_KEDALUWARSA`.

### Contoh mengajukan permohonan

```json
POST /api/v1/pengajuan
{
  "id_layanan": "LAYANAN-002",
  "data_formulir": {
    "nama_calon_pasangan": "Nama Calon",
    "tanggal_rencana_nikah": "2026-12-12",
    "status_perkawinan": "BELUM_KAWIN"
  },
  "berkas": [
    { "id_syarat": "SYR-002-01", "nama_file": "ktp.pdf", "mime_type": "application/pdf", "ukuran_byte": 150000 },
    { "id_syarat": "SYR-002-02", "nama_file": "kk.pdf",  "mime_type": "application/pdf", "ukuran_byte": 150000 },
    { "id_syarat": "SYR-002-05", "nama_file": "pernyataan.pdf", "mime_type": "application/pdf", "ukuran_byte": 90000 },
    { "id_syarat": "SYR-002-06", "nama_file": "n1.jpg",  "mime_type": "image/jpeg", "ukuran_byte": 300000 }
  ]
}
```

Karena `status_perkawinan` = `BELUM_KAWIN`, akta cerai (`SYR-002-03`) dan keterangan kematian
(`SYR-002-04`) tidak diminta. Aturan ini dibaca dari `data/layanan.json`, bukan ditulis di kode.

---

## 4. Alur status (state machine)

```
                      ┌──────────── KIRIM_REVISI (warga) ─────────────┐
                      ▼                                               │
WARGA ──AJUKAN──▶ DIAJUKAN ──MINTA_REVISI (admin)──▶ PERLU_REVISI ────┘
                      │
                      │ SETUJUI (admin)
                      ▼
            MENUNGGU_PARAF_KASI ──KEMBALIKAN──▶ DIKEMBALIKAN_KE_ADMIN ──(admin proses ulang)
                      │ SETUJUI (kasi)
                      ▼
            MENUNGGU_TTE_CAMAT  ──KEMBALIKAN──▶ DIKEMBALIKAN_KE_ADMIN
                      │ SETUJUI (camat)
                      ├── layanan UNDUH ─────────────▶ SELESAI
                      └── layanan AMBIL_DI_KANTOR ───▶ SIAP_DIAMBIL ──SERAHKAN (admin)──▶ SELESAI

Admin, Kasi, dan Camat masing-masing juga bisa TOLAK ──▶ DITOLAK (wajib dengan alasan)
```

Satu-satunya sumber aturan ini adalah tabel `TRANSISI` di `src/constants/workflow.ts`.
Transisi yang tidak tercantum di tabel itu otomatis ditolak.

---

## 5. Mengganti data dummy dengan data asli

Semua data master ada di folder **`data/`** dan **tidak perlu menyentuh kode TypeScript**:

| File | Isi |
|---|---|
| `data/layanan.json` | 9 layanan: persyaratan, isian formulir, dasar hukum, mode penyerahan, jumlah rangkap |
| `data/kelurahan.json` | Daftar kelurahan |
| `data/kontak.json` | Alamat, telepon, WA, email, jam layanan |
| `data/users.json` | Akun dummy (khusus pengembangan, **jangan** diisi data warga asli) |

Langkah:
1. Ubah file JSON yang perlu.
2. Jalankan `npm run validate-data`. Jika ada salah ketik, misalnya kondisi merujuk field yang tidak
   ada, ID ganda, atau nama kolom salah, semua masalah ditampilkan sekaligus beserta lokasinya.
3. Jalankan `npm test`, lalu restart server.

Server **menolak start** jika data tidak valid, jadi data yang rusak tidak akan pernah sampai ke pengguna.

**Persyaratan bersyarat.** Tambahkan `kondisi` pada syarat:
```json
{ "id_syarat": "SYR-002-03", "nama_syarat": "Fotokopi Akta Cerai", "wajib": true,
  "kondisi": { "field": "status_perkawinan", "sama_dengan": "CERAI_HIDUP" } }
```
`field` harus berupa isian bertipe `pilihan` di `form_fields` layanan yang sama.
Untuk beberapa nilai, pakai `"salah_satu": ["A", "B"]`.

**Menambah layanan ke-10** (misalnya layanan Seksi Ekonomi): salin satu blok layanan, ganti
`id_layanan` (`LAYANAN-010`), `kode`, `seksi`, dan awalan `id_syarat` (`SYR-010-xx`).

**Format nomor surat** resmi diubah di `src/constants/penomoran.ts`. Saat ini masih diawali `DUMMY/`.

---

## 6. Keamanan yang sudah diterapkan

- **Mock auth tidak bisa lolos ke production.** Server menolak start jika `NODE_ENV=production`
  dan auth masih mock, kecuali diizinkan eksplisit dengan `ALLOW_MOCK_AUTH_IN_PRODUCTION=true`
  untuk server demo.
- **Autentikasi dicek paling awal** (hook `onRequest`), sebelum body dibaca.
- **Token sesi** acak 256-bit dengan masa berlaku. Yang disimpan hanya hash SHA-256-nya.
  Maksimal 5 sesi aktif per akun (`MAX_SESI_PER_USER`); login ke-6 mencabut sesi tertua.
- **Otorisasi per objek (anti-IDOR).** Warga hanya bisa membuka pengajuannya sendiri, dan Kasi
  hanya seksinya. Data milik orang lain dijawab 404, bukan 403, supaya keberadaannya tidak bocor.
  ID pengajuan berupa UUID acak.
- **Lacak publik:**
  - Kode registrasi acak (bukan berurutan).
  - Wajib 4 digit HP, dibandingkan dengan perbandingan *constant-time*.
  - Pesan error identik untuk "tidak ada" dan "HP salah".
  - Rate limit 10/menit per IP, **dan** kunci per nomor registrasi: setelah 5 kali HP salah,
    nomor itu dikunci 15 menit walau penyerang memakai banyak IP (`LACAK_MAX_GAGAL`, `LACAK_KUNCI_MENIT`).
  - Body dibatasi 1 KiB.
  - Respons dibatasi skema, sehingga data pribadi tidak mungkin ikut terkirim.
- **Validasi ketat.** Field tak dikenal ditolak (cegah *mass assignment*). Tipe, panjang, opsi,
  dan tanggal diperiksa. Berkas hanya PDF/JPG/PNG, dengan ekstensi yang harus cocok, batas ukuran,
  dan penolakan nama file berbahaya seperti `../`, nama berawalan titik, serta karakter tersembunyi
  (pengarah bidi dan zero-width) di nama file maupun isian teks.
- **Regex aman.** Semua pola untuk input dari luar berjalan linear (lihat `src/constants/pola.ts`).
- **State machine terpusat**, dengan *optimistic locking* (`version`) dan riwayat setiap perubahan status.
- **Jejak audit.** Setiap respons yang memberi petugas data pribadi pemohon tercatat (detail maupun
  hasil aksi). Fase 1 menyimpan maksimal 10.000 entri terbaru (`AUDIT_LOG_MAX`).
- **Data pribadi disamarkan** di daftar dan profil (`6571********0001`).
- **Catatan antar-petugas tidak pernah ditampilkan ke warga.** Warga hanya melihat catatan revisi dan
  alasan penolakan (allowlist di `src/services/presenter.ts`). Catatan pada SETUJUI/paraf/TTE/KEMBALIKAN
  hanya untuk petugas.
- **Kasi hanya melihat seksinya sendiri**, termasuk di antrian dan statistik.
- **Header HTTP:**
  - Helmet: CSP, nosniff, frameguard, dan HSTS (khusus production).
  - CORS hanya untuk origin terdaftar (`*` ditolak).
  - `Cache-Control: no-store` untuk data pribadi.
- **Rate limit** global (120/menit/IP), login (10/menit), dan lacak (10/menit). Anti-spam:
  maksimal 10 pengajuan aktif per warga. IP pengunjung hanya dibaca dari proxy yang terdaftar di
  `TRUST_PROXY` (nilai `true` ditolak, karena membuat IP bisa dipalsukan).
- **Error rapi.** Error tak terduga dijawab 500 dengan pesan umum; detailnya hanya di log server.
  Token disensor dari log.
- **Dokumentasi `/docs`** dan **data contoh** otomatis mati di production. `/health` tidak menyebut
  mode auth di production.
- **Dependensi:** `npm audit` = 0 kerentanan saat repositori dibuat.
- **Diaudit** dengan `cloudflare/security-audit-skill` (run-1). Temuan dan perbaikannya ada di `CHANGELOG.md`.

---

## 7. Deploy ke Hostinger (Node.js Web App)

- Versi Node: **24.x**
- Build command: `npm run build`
- Start/entry: `npm start` (file `dist/server.js`)
- Ikutkan folder `data/` saat deploy.
- Environment variables minimal:
  ```
  NODE_ENV=production
  CORS_ORIGINS=https://domain-frontend-kalian
  TRUST_PROXY=loopback
  ALLOW_MOCK_AUTH_IN_PRODUCTION=true   # HANYA selama masih server demo berisi data dummy
  ```
- **Memastikan `TRUST_PROXY` benar** (sekali saja, setelah deploy):
  1. Deploy dengan `TRUST_PROXY=loopback`.
  2. Buka `https://api.domain-kalian/api/v1/health` dari HP (jaringan seluler).
  3. Lihat log aplikasi di hPanel. Nilai `remoteAddress` pada baris `incoming request` harus berisi
     **IP HP kamu**, bukan 127.0.0.1.
  4. Kalau isinya IP lain (misalnya IP internal Hostinger seperti `10.x.x.x`), tambahkan rentangnya:
     `TRUST_PROXY=loopback,uniquelocal`. Kalau memakai Cloudflare, tambahkan juga rentang IP Cloudflare
     dari https://www.cloudflare.com/ips/ (dipisah koma).
  5. Jangan pernah mengisi `true`: server akan menolak start.
- Hostinger menjalankan `domain.tld` dan `www.domain.tld` sebagai **dua proses terpisah**. Dengan store
  in-memory, keduanya akan punya data berbeda. Taruh API di **subdomain sendiri** (misalnya
  `api.domain`) dan jangan diakses lewat dua host.
- Hostinger tidak mendukung WebSocket masuk. Frontend memantau status dengan *polling* berkala.

---

## 8. Struktur folder

```
data/                  Data master JSON (bisa diganti tanpa ubah kode)
src/
├── server.ts          Entry point (PORT dari env, default 3000)
├── app.ts             Rakit Fastify: keamanan, Swagger, route
├── container.ts       Rakit store → repository → service
├── config/env.ts      Baca & validasi environment variable
├── constants/         Tabel state machine, format penomoran
├── types/             Tipe & skema data (User, Layanan, Pengajuan, Berkas)
├── database/          memory-store, pemuat & validator data/, seed contoh
├── repositories/      Akses data (interface + implementasi in-memory)
├── services/          Logika bisnis, validasi formulir, state machine, statistik
├── controllers/       Penghubung HTTP ↔ service
├── routes/            Definisi endpoint + skema request/response
├── schemas/           Skema TypeBox untuk validasi request
├── plugins/           Keamanan, autentikasi, penanganan error
├── scripts/           validate-data
└── utils/             Error, ID acak, masking
test/                  65 tes otomatis (alur, otorisasi/IDOR, lacak, data, konfigurasi, regresi audit)
```

---

## 9. Perlu dikonfirmasi ke kecamatan

1. **Jumlah rangkap** berkas tiap layanan (belum ada di SP; saat ini `null`).
2. **"dan/atau"** pada SP Ahli Waris: apakah KK Pewaris dan KK Ahli Waris wajib? (saat ini opsional)
3. **Mode penyerahan:** apakah Legalisasi SK Ahli Waris & SK Tukang juga harus diambil fisik di kantor?
   (saat ini `UNDUH`; ubah ke `AMBIL_DI_KANTOR` di `data/layanan.json` bila ya)
4. **Nomor WhatsApp** yang benar (SP Surat Pengantar mencantumkan nomor berbeda).
5. **Jam layanan** dan **format nomor surat** resmi.
6. **Daftar kelurahan** resmi.
7. Apakah dokumen pendukung bersifat wajib untuk Surat Keterangan, Rekomendasi, Pengantar, dan Legalisasi.
