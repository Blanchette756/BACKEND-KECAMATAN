import Type, { type Static } from 'typebox';

const VersionSchema = Type.Integer({ minimum: 1, description: 'Nilai `version` terakhir yang dilihat klien (cegah update bersamaan)' });
const CatatanSchema = Type.String({ maxLength: 1000 });

export const DataFormulirSchema = Type.Record(Type.String({ maxLength: 50 }), Type.Union([Type.String({ maxLength: 5000 }), Type.Number()]), {
  maxProperties: 50,
  description: 'Isian formulir sesuai `form_fields` layanan',
});

export const BerkasInputSchema = Type.Object(
  {
    id_syarat: Type.String({ pattern: '^SYR-[0-9]{3}-[0-9]{2}$' }),
    nama_file: Type.String({ minLength: 1, maxLength: 150 }),
    mime_type: Type.String({ maxLength: 100, description: 'application/pdf, image/jpeg, atau image/png' }),
    ukuran_byte: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const AjukanBodySchema = Type.Object(
  {
    id_layanan: Type.String({ pattern: '^LAYANAN-[0-9]{3}$' }),
    data_formulir: DataFormulirSchema,
    berkas: Type.Array(BerkasInputSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);
export type AjukanBody = Static<typeof AjukanBodySchema>;

export const RevisiBodySchema = Type.Object(
  {
    data_formulir: Type.Optional(DataFormulirSchema),
    berkas: Type.Array(BerkasInputSchema, { maxItems: 50 }),
    version: VersionSchema,
  },
  { additionalProperties: false },
);
export type RevisiBody = Static<typeof RevisiBodySchema>;

export const LacakBodySchema = Type.Object(
  {
    no_registrasi: Type.String({ pattern: '^[A-Za-z]{3}-[0-9]{8}-[A-Za-z0-9]{4}$', description: 'Contoh: REQ-20261029-K7Q2' }),
    last_4_digit_hp: Type.String({ pattern: '^[0-9]{4}$' }),
  },
  { additionalProperties: false },
);
export type LacakBody = Static<typeof LacakBodySchema>;

export const LacakResponseSchema = Type.Object({
  data: Type.Object({
    no_registrasi: Type.String(),
    nama_layanan: Type.String(),
    status_pengajuan: Type.String(),
    label_status: Type.String(),
    pesan: Type.Union([Type.String(), Type.Null()]),
    tgl_pengajuan: Type.String(),
    tgl_diperbarui: Type.String(),
    riwayat: Type.Array(Type.Object({ status: Type.String(), label: Type.String(), waktu: Type.String() })),
  }),
});

export const VerifikasiBodySchema = Type.Object(
  {
    aksi: Type.Union([Type.Literal('SETUJUI'), Type.Literal('MINTA_REVISI'), Type.Literal('TOLAK')]),
    catatan: Type.Optional(CatatanSchema),
    berkas: Type.Optional(
      Type.Array(
        Type.Object(
          {
            id_berkas: Type.String({ maxLength: 60 }),
            status: Type.Union([Type.Literal('VALID'), Type.Literal('PERLU_PERBAIKAN')]),
            catatan: Type.Optional(Type.String({ maxLength: 500 })),
          },
          { additionalProperties: false },
        ),
        { maxItems: 50 },
      ),
    ),
    version: VersionSchema,
  },
  { additionalProperties: false },
);
export type VerifikasiBody = Static<typeof VerifikasiBodySchema>;

export const KeputusanBodySchema = Type.Object(
  {
    aksi: Type.Union([Type.Literal('SETUJUI'), Type.Literal('KEMBALIKAN'), Type.Literal('TOLAK')]),
    catatan: Type.Optional(CatatanSchema),
    version: VersionSchema,
  },
  { additionalProperties: false },
);
export type KeputusanBody = Static<typeof KeputusanBodySchema>;

export const SerahkanBodySchema = Type.Object({ version: VersionSchema }, { additionalProperties: false });
export type SerahkanBody = Static<typeof SerahkanBodySchema>;
