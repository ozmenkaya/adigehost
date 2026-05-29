/**
 * Standart API hata sınıfı. İş mantığı içinde fırlatılır,
 * merkezi errorHandler middleware'i tarafından yakalanır.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, 'BAD_REQUEST', details);
  }
  static unauthorized(msg = 'Yetkisiz erişim') {
    return new ApiError(401, msg, 'UNAUTHORIZED');
  }
  static forbidden(msg = 'Bu işlem için yetkiniz yok') {
    return new ApiError(403, msg, 'FORBIDDEN');
  }
  static notFound(msg = 'Kayıt bulunamadı') {
    return new ApiError(404, msg, 'NOT_FOUND');
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, 'CONFLICT');
  }
  static tooMany(msg = 'Çok fazla istek') {
    return new ApiError(429, msg, 'RATE_LIMITED');
  }
  static internal(msg = 'Sunucu hatası') {
    return new ApiError(500, msg, 'INTERNAL');
  }
}
