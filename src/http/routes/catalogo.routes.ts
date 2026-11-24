/**
 * Compose the geographic catalog endpoints, protected only by the client API key.
 *
 * @author Jose Calpa <jose20calpa93@gmail.com>
 * @version 1.0.0
 */
import { Router } from 'express';
import type { AppDeps } from '../../app.js';
import { PERMISOS } from '../../domain/entities.js';
import { crearCatalogoController } from '../controllers/catalogo.controller.js';
import { exigirApiKey } from '../middlewares/api-key.js';

export const catalogoRoutes = (deps: AppDeps): Router => {
  const router = Router();
  const c = crearCatalogoController(deps.catalogoRepository);
  const key = exigirApiKey(deps.apiKeyService, PERMISOS.catalogRead, deps.logger);
  router.get('/get-roles', key, c['roles']!);
  router.get('/get-departments', key, c['departamentos']!);
  router.get('/get-municipalities', key, c['municipios']!);
  return router;
};
