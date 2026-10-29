import Type, { type Static } from 'typebox';
import { KondisiSchema, SeksiSchema } from './common.js';

/** Isian data formulir (selain berkas), dirender dinamis oleh frontend. */
export const FormFieldSchema = Type.Object(
  {
    key: Type.String({ pattern: '^[a-z][a-z0-9_]{1,40}$' }),
    label: Type.String({ minLength: 2, maxLength: 120 }),
    tipe: Type.Union([
      Type.Literal('teks'),
      Type.Literal('paragraf'),
      Type.Literal('pilihan'),
      Type.Literal('tanggal'),
      Type.Literal('angka'),
    ]),
    wajib: Type.Boolean(),
    keterangan: Type.Optional(Type.String({ maxLength: 300 })),
    /** Hanya untuk tipe "pilihan". */
    opsi: Type.Optional(
      Type.Array(
        Type.Object(
          { nilai: Type.String({ pattern: '^[A-Z0-9_]{1,40}$' }), label: Type.String({ minLength: 1, maxLength: 120 }) },
          { additionalProperties: false },
        ),
        { minItems: 2 },
      ),
    ),
    /** Untuk tipe "teks"/"paragraf". Default 200 / 1000. */
    panjang_maks: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
    /** Untuk tipe "angka". */
    min: Type.Optional(Type.Number()),
    maks: Type.Optional(Type.Number()),
    kondisi: Type.Optional(KondisiSchema),
  },
  { additionalProperties: false },
);
export type FormField = Static<typeof FormFieldSchema>;

/** Satu berkas persyaratan (DaftarPersyaratan pada ERD). */
export const PersyaratanSchema = Type.Object(
  {
    id_syarat: Type.String({ pattern: '^SYR-[0-9]{3}-[0-9]{2}$' }),
    nama_syarat: Type.String({ minLength: 2, maxLength: 200 }),
    wajib: Type.Boolean(),
    keterangan: Type.Optional(Type.String({ maxLength: 500 })),
    /** Persyaratan hanya berlaku bila kondisi terpenuhi (mis. akta cerai hanya untuk yang cerai). */
    kondisi: Type.Optional(KondisiSchema),
    /** Catatan bila dokumen fisik/asli tetap harus dibawa ke kantor. */
    catatan_fisik: Type.Optional(Type.String({ maxLength: 300 })),
  },
  { additionalProperties: false },
);
export type PersyaratanData = Static<typeof PersyaratanSchema>;
export type Persyaratan = PersyaratanData & { id_layanan: string };

export const ModePenyerahanSchema = Type.Union([Type.Literal('UNDUH'), Type.Literal('AMBIL_DI_KANTOR')]);
export type ModePenyerahan = Static<typeof ModePenyerahanSchema>;

/** JenisLayanan pada ERD, ditambah definisi formulir & persyaratannya. */
export const JenisLayananSchema = Type.Object(
  {
    id_layanan: Type.String({ pattern: '^LAYANAN-[0-9]{3}$' }),
    kode: Type.String({ pattern: '^[A-Z0-9]{2,10}$' }),
    nama_layanan: Type.String({ minLength: 3, maxLength: 150 }),
    seksi: SeksiSchema,
    no_dokumen_sp: Type.String({ maxLength: 100 }),
    tgl_efektif_sp: Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
    dasar_hukum: Type.Array(Type.String({ minLength: 3, maxLength: 400 })),
    jangka_waktu: Type.String({ maxLength: 200 }),
    biaya: Type.String({ maxLength: 100 }),
    output_dokumen: Type.String({ maxLength: 150 }),
    deskripsi: Type.String({ maxLength: 1000 }),
    mode_penyerahan: ModePenyerahanSchema,
    /** Jumlah rangkap berkas fisik. null = belum ditetapkan kecamatan. */
    jumlah_rangkap: Type.Union([Type.Integer({ minimum: 1, maximum: 10 }), Type.Null()]),
    aktif: Type.Boolean(),
    form_fields: Type.Array(FormFieldSchema),
    persyaratan: Type.Array(PersyaratanSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type JenisLayananData = Static<typeof JenisLayananSchema>;
export type JenisLayanan = Omit<JenisLayananData, 'persyaratan'> & { persyaratan: Persyaratan[] };

export const KontakKecamatanSchema = Type.Object(
  {
    nama_instansi: Type.String(),
    alamat: Type.String(),
    telepon: Type.String(),
    whatsapp: Type.String(),
    email: Type.String(),
    jam_layanan: Type.String(),
  },
  { additionalProperties: false },
);
export type KontakKecamatan = Static<typeof KontakKecamatanSchema>;
