/**
 * Mount service information and versioned API routes.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { Router } from 'express';
import type { AppDeps } from '../../app.js';
import { responderOk } from '../http-response.js';
import { authRoutes } from './auth.routes.js';
import { installationRoutes } from './installation.routes.js';

export const createRoutes = (deps: AppDeps): Router => {
  const router = Router();
  const { ambiente, apiVersion } = deps.config;
  router.get('/', (_req, res) =>
    responderOk(res, 'Servicio disponible.', { servicio: 'login', version: apiVersion, ambiente }),
  );
  router.get('/health', (_req, res) =>
    responderOk(res, 'Servicio saludable.', { estado: 'ok', ambiente, version: apiVersion }),
  );
  router.use('/installations', installationRoutes(deps.apiKeyService));
  router.use('/auth', authRoutes(deps));
  return router;
};
