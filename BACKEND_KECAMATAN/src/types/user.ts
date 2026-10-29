import Type, { type Static } from 'typebox';
import { RoleSchema, SeksiSchema } from './common.js';

export const KelurahanSchema = Type.Object(
  {
    id_kelurahan: Type.String({ pattern: '^KEL-[0-9]{3}$' }),
    nama: Type.String({ minLength: 2, maxLength: 100 }),
  },
  { additionalProperties: false },
);
export type Kelurahan = Static<typeof KelurahanSchema>;

export const UserSchema = Type.Object(
  {
    id_user: Type.String({ pattern: '^USR-[A-Z0-9-]{3,30}$' }),
    id_kelurahan: Type.Union([Type.String(), Type.Null()]),
    nik: Type.String({ pattern: '^[0-9]{16}$' }),
    nama_lengkap: Type.String({ minLength: 2, maxLength: 120 }),
    email: Type.String({ pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', maxLength: 120 }),
    no_hp: Type.String({ pattern: '^08[0-9]{8,12}$' }),
    role: RoleSchema,
    /** Wajib diisi untuk KASI (bidang yang ia pegang). null untuk role lain. */
    seksi: Type.Union([SeksiSchema, Type.Null()]),
    alamat: Type.String({ maxLength: 250 }),
    aktif: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type User = Static<typeof UserSchema>;

/** Data user yang aman dikirim ke klien (tanpa NIK/HP lengkap). */
export interface UserPublik {
  id_user: string;
  nama_lengkap: string;
  email: string;
  role: User['role'];
  seksi: User['seksi'];
  id_kelurahan: string | null;
  nik_tersamar: string;
  no_hp_tersamar: string;
}
