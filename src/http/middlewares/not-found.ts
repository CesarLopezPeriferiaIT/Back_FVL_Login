/**
 * Return a consistent response for unmatched routes.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import { responderError } from '../http-response.js';

export const notFound: RequestHandler = (_req, res) =>
  responderError(res, 404, 'NO_ENCONTRADO', 'Ruta no encontrada.');
