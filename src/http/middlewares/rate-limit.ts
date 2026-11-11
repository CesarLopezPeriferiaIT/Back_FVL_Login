/**
 * Limit login and registration attempts by identifier and client IP.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { normalizarEmail } from '../../shared/email.js';
import { responderError } from '../http-response.js';

export const crearLimitadores = (
  config: AppConfig,
): { identificador: RequestHandler; loginIp: RequestHandler; registroIp: RequestHandler } => {
  const base = {
    windowMs: config.rateLimit.windowMinutes * 60_000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response): void =>
      responderError(res, 429, 'RATE_LIMIT_EXCEDIDO', 'Demasiadas solicitudes.'),
  };
  const ip = (req: Request): string => ipKeyGenerator(req.ip ?? '');
  return {
    identificador: rateLimit({
      ...base,
      limit: config.rateLimit.loginPerIdentifier,
      keyGenerator: (req) => {
        const body: unknown = req.body;
        if (
          typeof body === 'object' &&
          body !== null &&
          'email' in body &&
          typeof body.email === 'string'
        )
          return normalizarEmail(body.email);
        return ip(req);
      },
    }),
    loginIp: rateLimit({ ...base, limit: config.rateLimit.loginPerIp, keyGenerator: ip }),
    registroIp: rateLimit({ ...base, limit: config.rateLimit.registerPerIp, keyGenerator: ip }),
  };
};
