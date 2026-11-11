/**
 * Extend Express requests with authenticated client and session data.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { ApiKey } from '../domain/entities.js';

declare global {
  // Express requiere este espacio de nombres para ampliar el tipo Request.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      sesion?: { uuidUsuario: string; email: string; sessionId: string };
    }
  }
}

export {};
