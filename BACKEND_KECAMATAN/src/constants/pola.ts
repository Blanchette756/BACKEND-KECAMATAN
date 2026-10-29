/**
 * Pola regex bersama. SEMUA pola yang dipakai pada input dari luar harus berjalan
 * linear (tanpa backtracking berlapis), karena TypeBox tetap menjalankan `pattern`
 * di jalur pesan error walaupun `maxLength` sudah gagal.
 *
 * Email: bagian domain terdiri dari label tanpa titik yang dipisah titik, sehingga
 * tidak ada dua cara mencocokkan string yang sama (versi lama `[^@\s]+\.[^@\s]+`
 * ambigu dan bisa memakan waktu kuadratik — temuan audit run-1 #1).
 */
export const POLA_EMAIL = '^[^@\\s]+@[^@\\s.]+(?:\\.[^@\\s.]+)+$';

/** Batas body untuk endpoint publik kecil (login, lacak). */
export const BODY_LIMIT_KECIL = 1024;
