/**
 * Serve the interactive API documentation and the raw OpenAPI document.
 *
 * The assets of the interface are served from the local installation of swagger-ui-dist, so the
 * page never reaches a third party CDN.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { Router } from 'express';
import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router as ExpressRouter,
} from 'express';
import swaggerUi from 'swagger-ui-express';
import type { AppConfig } from '../../config/env.js';
import { documentoOpenApi } from '../openapi.js';

/**
 * Politica de seguridad de la interfaz de documentacion.
 *
 * La API aplica una politica estricta que no admite scripts ni estilos, porque solo devuelve
 * JSON. La interfaz necesita los suyos, asi que se le concede una politica propia que sigue
 * limitando el contenido al propio origen y conserva la prohibition de ser embebida en marcos.
 */
const POLITICA_DE_DOCUMENTACION = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

const aplicarPoliticaDeDocumentacion: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader('Content-Security-Policy', POLITICA_DE_DOCUMENTACION);
  next();
};

/**
 * Crea el enrutador que publica la documentacion de la API.
 */
export const crearRutaDocumentacion = (config: AppConfig): ExpressRouter => {
  const router = Router();
  const documento = documentoOpenApi(config);

  router.get('/api-docs.json', (_req: Request, res: Response) => {
    res.json(documento);
  });

  router.use(
    '/api-docs',
    aplicarPoliticaDeDocumentacion,
    swaggerUi.serve,
    swaggerUi.setup(documento, {
      customSiteTitle: 'Microservicio de login - Fundacion Valle del Lili',
      swaggerOptions: {
        displayRequestDuration: true,
        persistAuthorization: false,
        docExpansion: 'list',
        defaultModelsExpandDepth: 2,
      },
    }),
  );

  return router;
};
