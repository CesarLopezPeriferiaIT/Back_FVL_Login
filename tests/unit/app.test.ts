/**
 * Verify the application factory wires routes, CORS and the service information correctly.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/env.js';
import { createApiKeyService } from '../../src/domain/api-key-service.js';
import { createPinService } from '../../src/domain/pin-service.js';
import { createAuthService } from '../../src/domain/auth-service.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createTokenService } from '../../src/domain/token-service.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria } from '../helpers/in-memory.js';

const cuerpoServicio = z.object({
  message: z.string(),
  error: z.unknown(),
  code: z.number(),
  data: z.object({ servicio: z.string(), ambiente: z.string(), version: z.number() }),
});

const cuerpoSalud = z.object({
  message: z.string(),
  error: z.unknown(),
  code: z.number(),
  data: z.object({ estado: z.string(), ambiente: z.string(), version: z.number() }),
});

const construirApp = (config: AppConfig): Express => {
  const banco = crearBancoEnMemoria();
  const logger = createLogger('error');
  const tokens = createTokenService(config);

  return createApp({
    config,
    logger,
    tokenService: tokens,
    apiKeyService: createApiKeyService(banco.apiKeys),
    pinService: createPinService({ pines: banco.pines, hasher: createPasswordHasher() }),
    authService: createAuthService({
      usuarios: banco.usuarios,
      sesiones: banco.sesiones,
      hasher: createPasswordHasher(),
      tokens,
      correo: createMailService(banco.correo),
      config,
      logger,
    }),
  });
};

describe('fabrica de la aplicacion', () => {
  it('expone la informacion del servicio en la raiz', async () => {
    const respuesta = await request(construirApp(configDePrueba())).get('/').expect(200);
    const cuerpo = cuerpoServicio.parse(respuesta.body as unknown);

    expect(cuerpo.code).toBe(0);
    expect(cuerpo.error).toBeNull();
    expect(cuerpo.data.servicio).toBe('login');
    expect(cuerpo.data.ambiente).toBe('dev');
    expect(cuerpo.data.version).toBe(1);
  });

  it('expone el estado de salud bajo el prefijo versionado', async () => {
    const respuesta = await request(construirApp(configDePrueba()))
      .get('/backend/dev/v1/health')
      .expect(200);
    const cuerpo = cuerpoSalud.parse(respuesta.body as unknown);

    expect(cuerpo.data.estado).toBe('ok');
    expect(cuerpo.data.ambiente).toBe('dev');
  });

  it('expone tambien la informacion del servicio bajo el prefijo versionado', async () => {
    const respuesta = await request(construirApp(configDePrueba()))
      .get('/backend/dev/v1/')
      .expect(200);
    const cuerpo = cuerpoServicio.parse(respuesta.body as unknown);

    expect(cuerpo.data.servicio).toBe('login');
  });

  it('no habilita CORS cuando la lista de origenes esta vacia', async () => {
    const config = configDePrueba();
    const app = construirApp({ ...config, cors: { allowedOrigins: [] } });

    const respuesta = await request(app).get('/health').set('Origin', 'https://no-permitido.co');

    expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('no expone la cabecera que identifica la tecnologia del servidor', async () => {
    const respuesta = await request(construirApp(configDePrueba())).get('/health').expect(200);

    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });
});
