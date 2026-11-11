/**
 * Authenticate access tokens and attach their session claims.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import type { TokenService } from '../../domain/token-service.js';
import { AppError } from '../../shared/errors.js';

export const exigirBearer =
  (tokens: TokenService): RequestHandler =>
  (req, _res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '');
    if (!match?.[1]) throw new AppError('TOKEN_REQUERIDO', 'Se requiere un token de acceso.', 401);
    const claims = tokens.verificarTokenAcceso(match[1]);
    req.sesion = { uuidUsuario: claims.sub, email: claims.email, sessionId: claims.sid };
    next();
  };
