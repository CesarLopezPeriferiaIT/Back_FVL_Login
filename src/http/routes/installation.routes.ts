/**
 * Expose public client installation registration.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { Router } from 'express';
import type { ApiKeyService } from '../../domain/api-key-service.js';
import { registrarInstalacion } from '../controllers/installation.controller.js';

export const installationRoutes = (service: ApiKeyService): Router => {
  const router = Router();
  router.post('/register', registrarInstalacion(service));
  return router;
};
