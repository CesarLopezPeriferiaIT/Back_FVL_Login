/**
 * Restrict cross-origin access to explicitly allowed origins.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import cors from 'cors';
import type { RequestHandler } from 'express';

export const corsPermitido = (origins: string[]): RequestHandler =>
  cors({
    origin: (origin, callback) => callback(null, origin !== undefined && origins.includes(origin)),
    credentials: false,
  });
