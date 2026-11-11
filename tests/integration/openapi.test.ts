/**
 * Verify the published OpenAPI document and the interactive documentation.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createApiKeyService } from '../../src/domain/api-key-service.js';
import { createAuthService } from '../../src/domain/auth-service.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createTokenService } from '../../src/domain/token-service.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria } from '../helpers/in-memory.js';

const construirApp = (): Express => {
  const banco = crearBancoEnMemoria();
  const config = configDePrueba();
  const logger = createLogger('error');
  const tokens = createTokenService(config);

  return createApp({
    config,
    logger,
    tokenService: tokens,
    apiKeyService: createApiKeyService(banco.apiKeys),
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

const documentoDePrueba = async (): Promise<Record<string, unknown>> => {
  const respuesta = await request(construirApp()).get('/api-docs.json').expect(200);
  return z.record(z.string(), z.unknown()).parse(respuesta.body as unknown);
};

describe('documentacion de la API', () => {
  it('publica un documento OpenAPI valido', async () => {
    const documento = await documentoDePrueba();

    expect(documento['openapi']).toBe('3.1.0');
    expect(documento['info']).toMatchObject({ title: 'Microservicio de login' });
    expect(documento['paths']).toBeDefined();
  });

  it('describe las rutas de negocio bajo el prefijo del ambiente', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, unknown>;

    expect(Object.keys(paths)).toContain('/backend/dev/v1/auth/login');
    expect(Object.keys(paths)).toContain('/backend/dev/v1/auth/register');
    expect(Object.keys(paths)).toContain('/backend/dev/v1/auth/me');
    expect(Object.keys(paths)).toContain('/backend/dev/v1/installations/register');
    expect(Object.keys(paths)).toContain('/health');
  });

  it('declara los dos mecanismos de autenticacion', async () => {
    const documento = await documentoDePrueba();
    const components = documento['components'] as Record<string, Record<string, unknown>>;

    expect(components['securitySchemes']?.['ApiKey']).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    });
    expect(components['securitySchemes']?.['Bearer']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('documenta el formato estandar de respuesta', async () => {
    const documento = await documentoDePrueba();
    const components = documento['components'] as Record<string, Record<string, unknown>>;
    const respuesta = components['schemas']?.['Respuesta'] as Record<string, unknown>;
    const propiedades = respuesta['properties'] as Record<string, unknown>;

    expect(Object.keys(propiedades).sort()).toEqual(['code', 'data', 'error', 'message']);
  });

  it('deriva el cuerpo del registro de los validadores reales', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const peticion = paths['/backend/dev/v1/auth/register']?.['post']?.['requestBody'] as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    const esquema = peticion['content']?.['application/json']?.['schema'] as Record<
      string,
      Record<string, unknown>
    >;
    const propiedades = esquema['properties'] as Record<string, Record<string, unknown>>;

    expect(Object.keys(propiedades).sort()).toEqual(['email', 'password', 'tyc']);
    expect(propiedades['email']?.['format']).toBe('email');
    expect(propiedades['password']?.['pattern']).toBe('^(?=.*[A-Za-z])(?=.*\\d)\\S{8,72}$');
    expect(propiedades['tyc']?.['type']).toBe('boolean');
  });

  it('documenta los codigos de error con su estado HTTP', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const respuestas = paths['/backend/dev/v1/auth/login']?.['post']?.['responses'] as Record<
      string,
      unknown
    >;

    expect(respuestas['200']).toBeDefined();
    expect(respuestas['401']).toBeDefined();
    expect(respuestas['403']).toBeDefined();
    expect(respuestas['429']).toBeDefined();
  });

  it('marca el registro de instalacion como ruta publica', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const operacion = paths['/backend/dev/v1/installations/register']?.['post'];

    expect(operacion?.['security']).toEqual([]);
  });

  it('exige la API Key y el token de usuario en las rutas protegidas', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, Record<string, Record<string, unknown>>>;

    expect(paths['/backend/dev/v1/auth/login']?.['post']?.['security']).toEqual([{ ApiKey: [] }]);
    expect(paths['/backend/dev/v1/auth/me']?.['get']?.['security']).toEqual([
      { ApiKey: [], Bearer: [] },
    ]);
  });

  it('sirve la interfaz interactiva con su propia politica de seguridad', async () => {
    const respuesta = await request(construirApp()).get('/api-docs/').expect(200);

    expect(respuesta.headers['content-type']).toMatch(/text\/html/);
    expect(respuesta.text).toContain('swagger-ui');
    expect(respuesta.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('mantiene la politica estricta de la API en las rutas de negocio', async () => {
    const respuesta = await request(construirApp()).get('/health').expect(200);

    expect(respuesta.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('no expone la documentacion sin el alcance requerido', async () => {
    const documento = await documentoDePrueba();
    const paths = documento['paths'] as Record<string, Record<string, Record<string, unknown>>>;

    expect(paths['/backend/dev/v1/auth/register']?.['post']?.['security']).toEqual([
      { ApiKey: [] },
    ]);
    expect(z.string().safeParse(documento['openapi']).success).toBe(true);
  });
});
