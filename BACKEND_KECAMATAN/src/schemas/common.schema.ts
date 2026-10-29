import Type, { type Static } from 'typebox';

export const ErrorSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.String(),
      message: Type.String(),
      details: Type.Optional(Type.Unknown()),
    }),
  },
);

export const PagingQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
  },
  { additionalProperties: false },
);
export type PagingQuery = Static<typeof PagingQuerySchema>;

export const LayananIdParamSchema = Type.Object({ id: Type.String({ pattern: '^LAYANAN-[0-9]{3}$' }) });
export type LayananIdParam = Static<typeof LayananIdParamSchema>;

export const PengajuanIdParamSchema = Type.Object({
  id: Type.String({ pattern: '^PGJ-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
});
export type PengajuanIdParam = Static<typeof PengajuanIdParamSchema>;

/** Skema respons error standar untuk dokumentasi Swagger. */
export const errorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  422: ErrorSchema,
  429: ErrorSchema,
} as const;

/** Bentuk sukses umum: { data, meta? }. Isi `data` dibentuk oleh presenter di service. */
export const DataSchema = Type.Object({ data: Type.Unknown(), meta: Type.Optional(Type.Unknown()) });

export const okResponses = { 200: DataSchema, ...errorResponses } as const;
export const createdResponses = { 201: DataSchema, ...errorResponses } as const;
