/**
 * Verify the PIN access endpoints over HTTP.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createApiKeyService } from '../../src/domain/api-key-service.js';
import { createAuthService } from '../../src/domain/auth-service.js';
import { PERMISOS } from '../../src/domain/entities.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createPinService } from '../../src/domain/pin-service.js';
import { createTokenService } from '../../src/domain/token-service.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria, insertarApiKey, insertarUsuario } from '../helpers/in-memory.js';

const base = '/backend/dev/v1';
const clave = 'clave-de-integracion-pin';
const claveSinPermisos = 'clave-sin-alcance-pin';
const password = 'ClaveSegura1';
const pin = '482915';

const banco = crearBancoEnMemoria();
const config = configDePrueba();
const logger = createLogger('error');
const tokens = createTokenService(config);
const hasher = createPasswordHasher();
insertarApiKey(banco, clave, Object.values(PERMISOS));
insertarApiKey(banco, claveSinPermisos, [PERMISOS.authMe]);

const app = createApp({
  config,
  logger,
  tokenService: tokens,
  apiKeyService: createApiKeyService(banco.apiKeys),
  authService: createAuthService({
    usuarios: banco.usuarios,
    sesiones: banco.sesiones,
    hasher,
    tokens,
    correo: createMailService(banco.correo),
    config,
    logger,
  }),
  pinService: createPinService({ pines: banco.pines, hasher: createPasswordHasher() }),
});

const cuerpoError = z.object({
  error: z.object({ codigo: z.string() }),
  code: z.number(),
});

const iniciarSesion = async (email: string): Promise<string> => {
  const respuesta = await request(app)
    .post(`${base}/auth/login`)
    .set('X-API-Key', clave)
    .send({ email, password })
    .expect(200);
  const datos = z
    .object({ data: z.object({ token_acceso: z.string() }) })
    .parse(respuesta.body as unknown);
  return datos.data.token_acceso;
};

describe('API de pin de acceso', () => {
  beforeAll(async () => {
    const passHash = await hasher.hash(password);
    insertarUsuario(banco, { email: 'pin@ejemplo.co', passHash, estado: 'A' });
  });

  it('configura el pin de la cuenta', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .post(`${base}/auth/pin/configurar`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .send({ pin, dispositivo: 'equipo-de-prueba' })
      .expect(201);

    expect(respuesta.body).toMatchObject({ code: 0, data: { pin_configurado: true } });
  });

  it('informa en el perfil si la cuenta tiene pin configurado', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .get(`${base}/auth/me`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .expect(200);

    const datos = z
      .object({ data: z.object({ pin_configurado: z.boolean() }) })
      .parse(respuesta.body as unknown);
    expect(datos.data.pin_configurado).toBe(true);
  });

  it('verifica el pin correcto', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .post(`${base}/auth/pin/verificar`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .send({ pin })
      .expect(200);

    expect(respuesta.body).toMatchObject({ code: 0, data: { verificado: true } });
  });

  it('rechaza un pin incorrecto', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .post(`${base}/auth/pin/verificar`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .send({ pin: '000000' })
      .expect(401);

    const cuerpo = cuerpoError.parse(respuesta.body as unknown);
    expect(cuerpo.error.codigo).toBe('PIN_INVALIDO');
  });

  it('rechaza un pin con formato invalido', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .post(`${base}/auth/pin/configurar`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .send({ pin: 'abcde', dispositivo: 'equipo-de-prueba' })
      .expect(400);

    const cuerpo = cuerpoError.parse(respuesta.body as unknown);
    expect(cuerpo.error.codigo).toBe('VALIDACION_FALLIDA');
  });

  it('exige el token de acceso del usuario', async () => {
    await request(app)
      .post(`${base}/auth/pin/configurar`)
      .set('X-API-Key', clave)
      .send({ pin, dispositivo: 'equipo-de-prueba' })
      .expect(401);
  });

  it('exige el alcance de la API Key', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    const respuesta = await request(app)
      .post(`${base}/auth/pin/configurar`)
      .set('X-API-Key', claveSinPermisos)
      .set('Authorization', `Bearer ${acceso}`)
      .send({ pin, dispositivo: 'equipo-de-prueba' })
      .expect(403);

    const cuerpo = cuerpoError.parse(respuesta.body as unknown);
    expect(cuerpo.error.codigo).toBe('API_KEY_SIN_PERMISO');
  });

  it('revoca el pin y el perfil deja de informarlo', async () => {
    const acceso = await iniciarSesion('pin@ejemplo.co');

    await request(app)
      .post(`${base}/auth/pin/revocar`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .expect(200);

    const perfil = await request(app)
      .get(`${base}/auth/me`)
      .set('X-API-Key', clave)
      .set('Authorization', `Bearer ${acceso}`)
      .expect(200);

    const datos = z
      .object({ data: z.object({ pin_configurado: z.boolean() }) })
      .parse(perfil.body as unknown);
    expect(datos.data.pin_configurado).toBe(false);
  });
});
