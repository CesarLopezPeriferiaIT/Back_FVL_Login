/**
 * Compose protected authentication endpoints and their middleware.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AppDeps } from '../../app.js';
import { PERMISOS } from '../../domain/entities.js';
import type { Permiso } from '../../domain/entities.js';
import { crearAuthController } from '../controllers/auth.controller.js';
import { exigirApiKey } from '../middlewares/api-key.js';
import { exigirBearer } from '../middlewares/bearer.js';
import { crearLimitadores } from '../middlewares/rate-limit.js';

export const authRoutes = (deps: AppDeps): Router => {
  const router = Router();
  const c = crearAuthController(deps.authService);
  const key = (permiso: Permiso): RequestHandler =>
    exigirApiKey(deps.apiKeyService, permiso, deps.logger);
  const bearer = exigirBearer(deps.tokenService);
  const limits = crearLimitadores(deps.config);
  router.post('/register', key(PERMISOS.authRegister), limits.registroIp, c['registro']!);
  router.post('/login', key(PERMISOS.authLogin), limits.identificador, limits.loginIp, c['login']!);
  router.post('/confirm-email', key(PERMISOS.authConfirmEmail), c['confirmar']!);
  router.get('/confirm-email', key(PERMISOS.authConfirmEmail), c['confirmar']!);
  router.post('/logout', key(PERMISOS.authLogout), bearer, c['logout']!);
  router.post('/refresh', key(PERMISOS.authRefresh), c['refresh']!);
  router.post('/forgot-password', key(PERMISOS.authPasswordReset), c['forgot']!);
  router.get('/reset-password', key(PERMISOS.authPasswordReset), c['verificarReset']!);
  router.post('/reset-password', key(PERMISOS.authPasswordReset), c['reset']!);
  router.post('/change-password', key(PERMISOS.authPasswordReset), bearer, c['cambiar']!);
  router.get('/me', key(PERMISOS.authMe), bearer, c['perfil']!);
  return router;
};
