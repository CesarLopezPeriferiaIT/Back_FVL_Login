/**
 * Extend Express requests with authenticated client and session data.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
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
