/**
 * Translate application and validation errors into safe HTTP responses.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import { responderError } from '../http-response.js';

export const manejadorErrores =
  (logger: Logger): ErrorRequestHandler =>
  (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof AppError) {
      responderError(res, error.status, error.codigo, error.message, error.detalles);
      return;
    }
    if (error instanceof ZodError) {
      responderError(
        res,
        400,
        'VALIDACION_FALLIDA',
        'La validacion fallo.',
        error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
      return;
    }
    logger.error('Error interno', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    responderError(res, 500, 'ERROR_INTERNO', 'Ocurrio un error interno.');
  };
