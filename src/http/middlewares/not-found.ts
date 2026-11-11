/**
 * Return a consistent response for unmatched routes.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import { responderError } from '../http-response.js';

export const notFound: RequestHandler = (_req, res) =>
  responderError(res, 404, 'NO_ENCONTRADO', 'Ruta no encontrada.');
