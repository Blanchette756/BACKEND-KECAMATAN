/** Error bisnis yang aman ditampilkan ke klien. Error lain dianggap 500 dan pesannya disembunyikan. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const validationFailed = (message: string, details?: unknown) => new AppError(422, 'VALIDASI_GAGAL', message, details);
export const unauthorized = (message = 'Silakan login terlebih dahulu') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Anda tidak memiliki akses untuk aksi ini') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
