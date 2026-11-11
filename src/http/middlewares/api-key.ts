/**
 * Authenticate client API keys and enforce the required scope.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import type { ApiKeyService } from '../../domain/api-key-service.js';
import type { Permiso } from '../../domain/entities.js';
import type { Logger } from '../../shared/logger.js';
import { prefijoDeClave } from '../../shared/crypto.js';
import { AppError } from '../../shared/errors.js';

export const exigirApiKey =
  (service: ApiKeyService, permiso: Permiso, logger: Logger): RequestHandler =>
  async (req, _res, next) => {
    const clave = req.get('X-API-Key');
    if (!clave) throw new AppError('API_KEY_REQUERIDA', 'Se requiere una API Key.', 401);
    const apiKey = await service.autenticar(clave);
    if (!service.tienePermiso(apiKey, permiso)) {
      logger.warn('API Key sin permiso', { prefijo: prefijoDeClave(clave) });
      throw new AppError('API_KEY_SIN_PERMISO', 'La API Key no tiene el permiso requerido.', 403);
    }
    req.apiKey = apiKey;
    next();
  };
