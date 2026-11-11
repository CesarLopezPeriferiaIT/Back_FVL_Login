/**
 * Assemble the Express application from injected services and configuration.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import express from 'express';
import type { Express } from 'express';
import type { AppConfig } from './config/env.js';
import type { AuthService } from './domain/auth-service.js';
import type { ApiKeyService } from './domain/api-key-service.js';
import type { TokenService } from './domain/token-service.js';
import type { Logger } from './shared/logger.js';
import './types/express.js';
import { securityHeaders } from './http/middlewares/security-headers.js';
import { corsPermitido } from './http/middlewares/cors.js';
import { manejadorErrores } from './http/middlewares/error-handler.js';
import { notFound } from './http/middlewares/not-found.js';
import { createRoutes } from './http/routes/index.js';
import { responderOk } from './http/http-response.js';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  authService: AuthService;
  apiKeyService: ApiKeyService;
  tokenService: TokenService;
}

export const createApp = (deps: AppDeps): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustedProxyCidrs);
  app.use(...securityHeaders());
  if (deps.config.cors.allowedOrigins.length > 0)
    app.use(corsPermitido(deps.config.cors.allowedOrigins));
  app.use(express.json());
  app.get('/', (_req, res) =>
    responderOk(res, 'Servicio disponible.', {
      servicio: 'login',
      version: deps.config.apiVersion,
      ambiente: deps.config.ambiente,
    }),
  );
  app.get('/health', (_req, res) =>
    responderOk(res, 'Servicio saludable.', {
      estado: 'ok',
      ambiente: deps.config.ambiente,
      version: deps.config.apiVersion,
    }),
  );
  app.use(`/backend/${deps.config.ambiente}/v${deps.config.apiVersion}`, createRoutes(deps));
  app.use(notFound);
  app.use(manejadorErrores(deps.logger));
  return app;
};
