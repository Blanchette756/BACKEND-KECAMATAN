import Type, { type Static } from 'typebox';

/** Seksi (bidang) di kecamatan. Kasi hanya boleh memproses berkas seksinya sendiri. */
export const SeksiSchema = Type.Union([
  Type.Literal('TATA_PEMERINTAHAN'),
  Type.Literal('KESRA'),
  Type.Literal('EKONOMI'),
  Type.Literal('TRANTIB'),
]);
export type Seksi = Static<typeof SeksiSchema>;

export const RoleSchema = Type.Union([
  Type.Literal('WARGA'),
  Type.Literal('ADMIN'),
  Type.Literal('KASI'),
  Type.Literal('CAMAT'),
]);
export type Role = Static<typeof RoleSchema>;

/**
 * Kondisi tampil/wajib sebuah field atau persyaratan.
 * Contoh: { "field": "status_perkawinan", "sama_dengan": "CERAI_HIDUP" }
 *         { "field": "keperluan", "salah_satu": ["A", "B"] }
 * Isi tepat salah satu dari `sama_dengan` atau `salah_satu`.
 */
export const KondisiSchema = Type.Object(
  {
    field: Type.String({ minLength: 1 }),
    sama_dengan: Type.Optional(Type.String({ minLength: 1 })),
    salah_satu: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  },
  { additionalProperties: false },
);
export type Kondisi = Static<typeof KondisiSchema>;

/** Nilai isian formulir yang boleh dikirim warga. */
export type NilaiFormulir = string | number;
export type DataFormulir = Record<string, NilaiFormulir>;
