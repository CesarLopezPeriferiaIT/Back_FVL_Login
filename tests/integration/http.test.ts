/**
 * Exercise the HTTP API with in-memory ports and real domain services.
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
import { createTokenService } from '../../src/domain/token-service.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria, insertarApiKey, insertarUsuario } from '../helpers/in-memory.js';

const base = '/backend/dev/v1';
const clave = 'clave-de-integracion';
const password = 'ClaveSegura1';
const banco = crearBancoEnMemoria();
const config = configDePrueba();
const logger = createLogger('error');
const hasher = createPasswordHasher();
const tokens = createTokenService(config);
insertarApiKey(banco, clave, Object.values(PERMISOS));
insertarApiKey(banco, 'sin-permisos', []);
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
});

const tokenCorreo = (): string => {
  const texto = banco.estado.correos.at(-1)?.texto ?? '';
  const token = /token=([^\s]+)/.exec(texto)?.[1];
  if (!token) throw new Error('No se encontro el token del correo');
  return decodeURIComponent(token);
};

describe('API HTTP', () => {
  beforeAll(async () => {
    const passHash = await hasher.hash(password);
    for (const estado of ['A', 'C', 'I', 'D'] as const) {
      insertarUsuario(banco, { email: `${estado.toLowerCase()}@ejemplo.co`, passHash, estado });
    }
  });

  it('expone salud, formato y cabeceras seguras', async () => {
    const respuesta = await request(app).get('/').expect(200);
    expect(respuesta.body).toMatchObject({ message: 'Servicio disponible.', error: null, code: 0 });
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
    for (const nombre of [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'x-dns-prefetch-control',
      'x-permitted-cross-domain-policies',
    ])
      expect(respuesta.headers[nombre]).toBeDefined();
    expect(respuesta.headers['cache-control']).toContain('no-store');
    await request(app).get('/health').expect(200);
    const inexistente = await request(app).get('/no-existe').expect(404);
    expect(inexistente.body).toMatchObject({ code: 404, data: null });
  });

  it('solo concede CORS a origenes permitidos', async () => {
    const rechazado = await request(app).get('/').set('Origin', 'https://otro.example');
    expect(rechazado.headers['access-control-allow-origin']).toBeUndefined();
    const permitido = await request(app).get('/').set('Origin', 'https://app.pruebas.fvl.org.co');
    expect(permitido.headers['access-control-allow-origin']).toBe('https://app.pruebas.fvl.org.co');
  });

  it('registra instalaciones y acepta la clave emitida', async () => {
    const respuesta = await request(app)
      .post(`${base}/installations/register`)
      .send({ nombre: 'Movil', tipo_cliente: 'mobile' })
      .expect(201);
    const body = z
      .object({ data: z.object({ api_key: z.string() }) })
      .parse(respuesta.body as unknown);
    await request(app)
      .post(`${base}/auth/forgot-password`)
      .set('X-API-Key', body.data.api_key)
      .send({ email: 'nadie@ejemplo.co' })
      .expect(200);
  });

  it('valida registro, credenciales de cliente y cuerpo', async () => {
    const ruta = `${base}/auth/register`;
    const datos = { email: 'registro@ejemplo.co', password, tyc: true };
    await request(app).post(ruta).send(datos).expect(401);
    await request(app).post(ruta).set('X-API-Key', 'sin-permisos').send(datos).expect(403);
    for (const invalido of [
      { ...datos, email: 'invalido' },
      { ...datos, password: 'a1' },
      { ...datos, password: '12345678' },
      { ...datos, password: 'abcdefgh' },
      { email: datos.email, password },
    ])
      await request(app).post(ruta).set('X-API-Key', clave).send(invalido).expect(400);
    await request(app).post(ruta).set('X-API-Key', clave).send(datos).expect(201);
    const token = tokenCorreo();
    await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ token })
      .expect(200);
    await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ token: 'invalido' })
      .expect(400);
  });

  it('confirma enlaces por GET y rechaza tokens invalidos', async () => {
    await request(app)
      .post(`${base}/auth/register`)
      .set('X-API-Key', clave)
      .send({ email: 'confirmar@ejemplo.co', password, tyc: true })
      .expect(201);
    await request(app)
      .get(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .query({ token: tokenCorreo() })
      .expect(200);
    await request(app)
      .get(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .query({ token: 'invalido' })
      .expect(400);
  });

  it('rechaza credenciales incorrectas y cuentas no activas', async () => {
    await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co', password: 'Incorrecta1' })
      .expect(401);
    for (const estado of ['c', 'i', 'd']) {
      await request(app)
        .post(`${base}/auth/login`)
        .set('X-API-Key', clave)
        .send({ email: `${estado}@ejemplo.co`, password })
        .expect(403);
    }
  });

  it('renueva, consulta perfil, cambia contrasena y cierra sesion', async () => {
    const login = await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co', password })
      .expect(200);
    const sesion = z
      .object({ data: z.object({ token_acceso: z.string(), token_refresh: z.string() }) })
      .parse(login.body as unknown);
    const acceso = sesion.data.token_acceso;
    const refresh = sesion.data.token_refresh;
    expect(acceso).toBeTruthy();
    expect(refresh).toBeTruthy();
    const renovado = await request(app)
      .post(`${base}/auth/refresh`)
      .set('X-API-Key', clave)
      .send({ refresh_token: refresh })
      .expect(200);
    const nuevaSesion = z
      .object({ data: z.object({ token_refresh: z.string() }) })
      .parse(renovado.body as unknown);
    expect(nuevaSesion.data.token_refresh).not.toBe(refresh);
    await request(app)
      .post(`${base}/auth/refresh`)
      .set('X-API-Key', clave)
      .send({ refresh_token: refresh })
      .expect(401);
    const perfil = await request(app)
      .get(`${base}/auth/me`)
      .set('X-API-Key', clave)
      .auth(acceso, { type: 'bearer' })
      .expect(200);
    const usuario = z
      .object({ data: z.object({ usuario: z.object({ email: z.string() }).passthrough() }) })
      .parse(perfil.body as unknown).data.usuario;
    expect(usuario.email).toBe('a@ejemplo.co');
    expect(usuario).not.toHaveProperty('pass_hash');
    await request(app)
      .post(`${base}/auth/change-password`)
      .set('X-API-Key', clave)
      .send({})
      .expect(401);
    await request(app)
      .post(`${base}/auth/change-password`)
      .set('X-API-Key', clave)
      .auth(acceso, { type: 'bearer' })
      .send({ password_actual: 'Incorrecta1', nueva_password: 'NuevaClave2' })
      .expect(400);
    await request(app)
      .post(`${base}/auth/change-password`)
      .set('X-API-Key', clave)
      .auth(acceso, { type: 'bearer' })
      .send({ password_actual: password, nueva_password: 'NuevaClave2' })
      .expect(200);
    await request(app).post(`${base}/auth/logout`).set('X-API-Key', clave).expect(401);
    const salida = await request(app)
      .post(`${base}/auth/logout`)
      .set('X-API-Key', clave)
      .auth(acceso, { type: 'bearer' })
      .expect(200);
    expect(salida.headers['clear-site-data']).toBeDefined();
  });

  it('no revela cuentas y verifica enlaces de reseteo de un solo uso', async () => {
    const ruta = `${base}/auth/forgot-password`;
    const existe = await request(app)
      .post(ruta)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co' })
      .expect(200);
    const token = tokenCorreo();
    const ausente = await request(app)
      .post(ruta)
      .set('X-API-Key', clave)
      .send({ email: 'ausente@ejemplo.co' })
      .expect(200);
    const mensaje = z.object({ message: z.string() });
    expect(mensaje.parse(existe.body as unknown).message).toBe(
      mensaje.parse(ausente.body as unknown).message,
    );
    await request(app)
      .get(`${base}/auth/reset-password`)
      .set('X-API-Key', clave)
      .query({ token })
      .expect(200);
    await request(app)
      .get(`${base}/auth/reset-password`)
      .set('X-API-Key', clave)
      .query({ token: 'invalido' })
      .expect(400);
    await request(app)
      .post(`${base}/auth/reset-password`)
      .set('X-API-Key', clave)
      .send({ token, nueva_password: 'OtraClave3' })
      .expect(200);
    await request(app)
      .get(`${base}/auth/reset-password`)
      .set('X-API-Key', clave)
      .query({ token })
      .expect(400);
  });

  it('limita por correo normalizado despues de diez intentos', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post(`${base}/auth/login`)
        .set('X-API-Key', clave)
        .send({ email: 'limite@ejemplo.co', password })
        .expect(401);
    }
    const respuesta = await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: 'LIMITE@EJEMPLO.CO', password })
      .expect(429);
    expect(
      z.object({ error: z.object({ codigo: z.string() }) }).parse(respuesta.body as unknown).error
        .codigo,
    ).toBe('RATE_LIMIT_EXCEDIDO');
  });
});
