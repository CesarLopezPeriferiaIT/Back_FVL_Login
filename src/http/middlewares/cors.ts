/**
 * Restrict cross-origin access to explicitly allowed origins.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import cors from 'cors';
import type { RequestHandler } from 'express';

export const corsPermitido = (origins: string[]): RequestHandler =>
  cors({
    origin: (origin, callback) => callback(null, origin !== undefined && origins.includes(origin)),
    credentials: false,
  });
