/**
 * Authenticate access tokens and attach their session claims.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
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
