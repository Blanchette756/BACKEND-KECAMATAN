import Type, { type Static } from 'typebox';

export const MockLoginBodySchema = Type.Object(
  { email: Type.String({ minLength: 3, maxLength: 120, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }) },
  { additionalProperties: false },
);
export type MockLoginBody = Static<typeof MockLoginBodySchema>;

export const UserPublikSchema = Type.Object({
  id_user: Type.String(),
  nama_lengkap: Type.String(),
  email: Type.String(),
  role: Type.String(),
  seksi: Type.Union([Type.String(), Type.Null()]),
  id_kelurahan: Type.Union([Type.String(), Type.Null()]),
  nik_tersamar: Type.String(),
  no_hp_tersamar: Type.String(),
});

export const LoginResponseSchema = Type.Object({
  data: Type.Object({
    token: Type.String(),
    token_type: Type.Literal('Bearer'),
    kedaluwarsa: Type.String(),
    user: UserPublikSchema,
  }),
});

export const MeResponseSchema = Type.Object({ data: UserPublikSchema });
