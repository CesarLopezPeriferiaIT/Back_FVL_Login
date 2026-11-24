/**
 * Exercise the HTTP API with in-memory ports and real domain services.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createApiKeyService } from '../../src/domain/api-key-service.js';
import { createAuthService } from '../../src/domain/auth-service.js';
import { createCodigoConfirmacionService } from '../../src/domain/codigo-confirmacion-service.js';
import { PERMISOS } from '../../src/domain/entities.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createTokenService } from '../../src/domain/token-service.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import {
  crearBancoEnMemoria,
  insertarApiKey,
  insertarUsuario,
  crearServicioCodigoAccesoDePrueba,
} from '../helpers/in-memory.js';

const base = '/backend/dev/v1';
const clave = 'clave-de-integracion';
const ubicacion = { codigo_departamento: '76', codigo_municipio: '76001', codigo_rol: 1 };
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
  catalogoRepository: banco.catalogos,
  apiKeyService: createApiKeyService(banco.apiKeys),
  authService: createAuthService({
    usuarios: banco.usuarios,
    sesiones: banco.sesiones,
    codigos: createCodigoConfirmacionService({
      codigos: banco.codigos,
      usuarios: banco.usuarios,
      hasher,
      config,
      logger,
    }),
    codigosAcceso: crearServicioCodigoAccesoDePrueba({ banco, hasher, config, logger }),
    tokens,
    correo: createMailService(banco.correo),
    config,
    logger,
  }),
});

const codigoCorreo = (): string => {
  const texto = banco.estado.correos.at(-1)?.texto ?? '';
  const codigo = /^\d{6}$/m.exec(texto)?.[0];
  if (!codigo) throw new Error('No se encontro el codigo del correo');
  return codigo;
};

describe('API HTTP', () => {
  beforeAll(async () => {
    for (const estado of ['A', 'C', 'I', 'D'] as const) {
      insertarUsuario(banco, { email: `${estado.toLowerCase()}@ejemplo.co`, estado });
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
    // Cuerpo vacio: la clave emitida pasa el control de API key y la peticion cae en la validacion.
    await request(app)
      .post(`${base}/auth/refresh`)
      .set('X-API-Key', body.data.api_key)
      .send({})
      .expect(400);
  });

  it('valida registro, credenciales de cliente y cuerpo', async () => {
    const ruta = `${base}/auth/register`;
    const datos = { email: 'registro@ejemplo.co', tyc: true, ...ubicacion };
    await request(app).post(ruta).send(datos).expect(401);
    await request(app).post(ruta).set('X-API-Key', 'sin-permisos').send(datos).expect(403);
    for (const invalido of [
      { ...datos, email: 'invalido' },
      { ...datos, codigo_rol: undefined },
      { ...datos, codigo_municipio: '05001' },
      { ...datos, codigo_departamento: '7' },
    ])
      await request(app).post(ruta).set('X-API-Key', clave).send(invalido).expect(400);
    await request(app).post(ruta).set('X-API-Key', clave).send(datos).expect(201);
    expect(codigoCorreo()).toMatch(/^\d{6}$/);
    expect(banco.estado.usuarios.find((usuario) => usuario.email === datos.email)?.estado).toBe(
      'C',
    );
  });

  it('deja la cuenta por confirmar y envia un codigo', async () => {
    await request(app)
      .post(`${base}/auth/register`)
      .set('X-API-Key', clave)
      .send({ email: 'confirmar@ejemplo.co', tyc: true, ...ubicacion })
      .expect(201);
    expect(codigoCorreo()).toMatch(/^\d{6}$/);
    expect(
      banco.estado.usuarios.find((usuario) => usuario.email === 'confirmar@ejemplo.co')?.estado,
    ).toBe('C');
  });

  it('confirma por codigo y rechaza una segunda confirmacion', async () => {
    const email = 'otp@ejemplo.co';
    await request(app)
      .post(`${base}/auth/register`)
      .set('X-API-Key', clave)
      .send({ email, tyc: true, ...ubicacion })
      .expect(201);
    const codigo = codigoCorreo();
    const respuesta = await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email, codigo })
      .expect(200);
    expect(respuesta.body).toMatchObject({ message: 'Correo confirmado.' });
    expect(banco.estado.usuarios.find((usuario) => usuario.email === email)?.estado).toBe('A');
    const repetida = await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email, codigo })
      .expect(409);
    expect(repetida.body).toMatchObject({ error: { codigo: 'CUENTA_YA_CONFIRMADA' } });
  });

  it('rechaza el codigo incorrecto y vencido', async () => {
    const email = 'otp-vencido@ejemplo.co';
    await request(app)
      .post(`${base}/auth/register`)
      .set('X-API-Key', clave)
      .send({ email, tyc: true, ...ubicacion })
      .expect(201);
    const codigo = codigoCorreo();
    const incorrecto = codigo === '000000' ? '000001' : '000000';
    const respuesta = await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email, codigo: incorrecto })
      .expect(400);
    expect(respuesta.body).toMatchObject({ error: { codigo: 'CODIGO_CONFIRMACION_INVALIDO' } });
    const usuario = banco.estado.usuarios.find((item) => item.email === email);
    const registro = banco.estado.codigos.find((item) => item.uuidUsuario === usuario?.uuid);
    if (!registro) throw new Error('Codigo no encontrado');
    registro.expiraEn = new Date(0);
    const vencido = await request(app)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email, codigo })
      .expect(400);
    expect(vencido.body).toMatchObject({ error: { codigo: 'CODIGO_CONFIRMACION_VENCIDO' } });
    expect(usuario?.estado).toBe('C');
    expect(registro.usadoEn).toBeNull();
  });

  it('solicita codigo de acceso', async () => {
    const respuesta = await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co' })
      .expect(200);
    expect(respuesta.body as unknown).toMatchObject({ data: { correo_enviado: true } });
    expect(codigoCorreo()).toMatch(/^\d{6}$/);
  });

  it('oculta el fallo de entrega y la ausencia de cuenta', async () => {
    const email = 'fallo-login@ejemplo.co';
    insertarUsuario(banco, { email, estado: 'A' });
    const envio = vi.spyOn(banco.correo, 'enviar').mockRejectedValue(new Error('SMTP'));
    try {
      const registrado = await request(app)
        .post(`${base}/auth/login`)
        .set('X-API-Key', clave)
        .send({ email });
      const inexistente = await request(app)
        .post(`${base}/auth/login`)
        .set('X-API-Key', clave)
        .send({ email: 'inexistente-login@ejemplo.co' });
      expect(registrado.status).toBe(200);
      expect(inexistente.status).toBe(registrado.status);
      expect(inexistente.body as unknown).toEqual(registrado.body as unknown);
      expect(registrado.body as unknown).toEqual({
        message:
          'Si la cuenta esta registrada y activa, te enviamos un codigo de acceso a tu correo electronico.',
        error: null,
        code: 0,
        data: { correo_enviado: true },
      });
      expect(envio).toHaveBeenCalledTimes(1);
    } finally {
      envio.mockRestore();
    }
  });

  it('rechaza codigo incorrecto y cuentas no activas', async () => {
    const codigo = codigoCorreo();
    const incorrecto = codigo === '000000' ? '000001' : '000000';
    const respuesta = await request(app)
      .post(`${base}/auth/login/code`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co', codigo: incorrecto })
      .expect(401);
    expect(respuesta.body as unknown).toMatchObject({
      error: { codigo: 'CODIGO_ACCESO_INVALIDO' },
    });
    for (const [estado, codigoError] of [
      ['c', 'CUENTA_POR_CONFIRMAR'],
      ['i', 'CUENTA_INACTIVA'],
      ['d', 'CUENTA_DESACTIVADA'],
    ]) {
      const error = await request(app)
        .post(`${base}/auth/login`)
        .set('X-API-Key', clave)
        .send({ email: `${estado}@ejemplo.co` })
        .expect(403);
      expect(error.body as unknown).toMatchObject({ error: { codigo: codigoError } });
    }
  });

  it('renueva, consulta perfil y cierra sesion', async () => {
    await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co' })
      .expect(200);
    const login = await request(app)
      .post(`${base}/auth/login/code`)
      .set('X-API-Key', clave)
      .send({ email: 'a@ejemplo.co', codigo: codigoCorreo() })
      .expect(200);
    expect(login.body as unknown).toMatchObject({
      data: { usuario: { email: 'a@ejemplo.co' }, token_type: 'Bearer' },
    });
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
    await request(app).post(`${base}/auth/logout`).set('X-API-Key', clave).expect(401);
    const salida = await request(app)
      .post(`${base}/auth/logout`)
      .set('X-API-Key', clave)
      .auth(acceso, { type: 'bearer' })
      .expect(200);
    expect(salida.headers['clear-site-data']).toBeDefined();
  });

  it('sirve los catalogos solo con API Key, sin token de usuario', async () => {
    const roles = `${base}/catalog/get-roles`;
    await request(app).get(roles).expect(401);
    const listaRoles = await request(app).get(roles).set('X-API-Key', clave).expect(200);
    expect(
      z
        .object({
          data: z.object({
            roles: z.array(
              z.object({ codigo: z.number(), nombre: z.string(), area_servicio: z.string() }),
            ),
          }),
        })
        .parse(listaRoles.body as unknown).data.roles[0],
    ).toEqual({ codigo: 1, area_servicio: 'Urgencias', nombre: 'Medico General' });
    const departamentos = `${base}/catalog/get-departments`;
    const municipios = `${base}/catalog/get-municipalities`;
    await request(app).get(departamentos).expect(401);
    await request(app).get(departamentos).set('X-API-Key', 'sin-permisos').expect(403);
    const lista = await request(app).get(departamentos).set('X-API-Key', clave).expect(200);
    expect(
      z
        .object({ data: z.object({ departamentos: z.array(z.object({ codigo: z.string() })) }) })
        .parse(lista.body as unknown).data.departamentos,
    ).toHaveLength(2);
    const todos = await request(app).get(municipios).set('X-API-Key', clave).expect(200);
    const esquema = z.object({
      data: z.object({
        municipios: z.array(z.object({ codigo: z.string(), codigo_departamento: z.string() })),
      }),
    });
    expect(esquema.parse(todos.body as unknown).data.municipios).toHaveLength(3);
    const valle = await request(app)
      .get(municipios)
      .query({ department: '76' })
      .set('X-API-Key', clave)
      .expect(200);
    expect(esquema.parse(valle.body as unknown).data.municipios.map((m) => m.codigo)).toEqual([
      '76001',
      '76109',
    ]);
    await request(app)
      .get(municipios)
      .query({ department: '7' })
      .set('X-API-Key', clave)
      .expect(400);
  });

  it('limita las confirmaciones por correo normalizado', async () => {
    const configLimite = {
      ...config,
      rateLimit: { ...config.rateLimit, confirmPerIdentifier: 1, confirmPerIp: 30 },
    };
    const bancoLimite = crearBancoEnMemoria();
    insertarApiKey(bancoLimite, clave, Object.values(PERMISOS));
    const authService = createAuthService({
      usuarios: bancoLimite.usuarios,
      sesiones: bancoLimite.sesiones,
      codigosAcceso: crearServicioCodigoAccesoDePrueba({
        banco: bancoLimite,
        hasher,
        config: configLimite,
        logger,
      }),
      tokens,
      correo: createMailService(bancoLimite.correo),
      codigos: createCodigoConfirmacionService({
        codigos: bancoLimite.codigos,
        usuarios: bancoLimite.usuarios,
        hasher,
        config: configLimite,
        logger,
      }),
      config: configLimite,
      logger,
    });
    const appLimite = createApp({
      config: configLimite,
      logger,
      authService,
      tokenService: tokens,
      apiKeyService: createApiKeyService(bancoLimite.apiKeys),
      catalogoRepository: bancoLimite.catalogos,
    });
    await request(appLimite)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email: 'limite@ejemplo.co', codigo: '123456' })
      .expect(404);
    const respuesta = await request(appLimite)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email: 'LIMITE@EJEMPLO.CO', codigo: '123456' })
      .expect(429);
    expect(respuesta.body).toMatchObject({ error: { codigo: 'RATE_LIMIT_EXCEDIDO' } });
  });

  it('limita confirmaciones por IP con correos distintos', async () => {
    const configLimite = {
      ...config,
      rateLimit: { ...config.rateLimit, confirmPerIdentifier: 10, confirmPerIp: 1 },
    };
    const bancoLimite = crearBancoEnMemoria();
    insertarApiKey(bancoLimite, clave, Object.values(PERMISOS));
    const authService = createAuthService({
      usuarios: bancoLimite.usuarios,
      sesiones: bancoLimite.sesiones,
      codigosAcceso: crearServicioCodigoAccesoDePrueba({
        banco: bancoLimite,
        hasher,
        config: configLimite,
        logger,
      }),
      tokens,
      correo: createMailService(bancoLimite.correo),
      codigos: createCodigoConfirmacionService({
        codigos: bancoLimite.codigos,
        usuarios: bancoLimite.usuarios,
        hasher,
        config: configLimite,
        logger,
      }),
      config: configLimite,
      logger,
    });
    const appLimite = createApp({
      config: configLimite,
      logger,
      authService,
      tokenService: tokens,
      apiKeyService: createApiKeyService(bancoLimite.apiKeys),
      catalogoRepository: bancoLimite.catalogos,
    });
    await request(appLimite)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email: 'uno@ejemplo.co', codigo: '123456' })
      .expect(404);
    const respuesta = await request(appLimite)
      .post(`${base}/auth/confirm-email`)
      .set('X-API-Key', clave)
      .send({ email: 'dos@ejemplo.co', codigo: '123456' })
      .expect(429);
    expect(respuesta.body).toMatchObject({ error: { codigo: 'RATE_LIMIT_EXCEDIDO' } });
  });

  it('desactiva la cuenta tras diez codigos incorrectos', async () => {
    const email = 'bloqueo@ejemplo.co';
    insertarUsuario(banco, { email, estado: 'A' });
    await request(app)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email })
      .expect(200);
    const codigo = codigoCorreo() === '000000' ? '000001' : '000000';
    for (let i = 0; i < 10; i += 1) {
      const respuesta = await request(app)
        .post(`${base}/auth/login/code`)
        .set('X-API-Key', clave)
        .send({ email, codigo })
        .expect(i === 9 ? 403 : 401);
      if (i === 9)
        expect(respuesta.body as unknown).toMatchObject({
          error: { codigo: 'CUENTA_DESACTIVADA' },
        });
    }
    expect(banco.estado.usuarios.find((u) => u.email === email)?.estado).toBe('D');
  });

  it.each([
    ['identificador', 1, 30, 'limite@ejemplo.co', 'LIMITE@EJEMPLO.CO'],
    ['IP', 10, 1, 'uno@ejemplo.co', 'dos@ejemplo.co'],
  ])('limita solicitudes de codigo por %s', async (_nombre, porCorreo, porIp, primero, segundo) => {
    const configLimite = {
      ...config,
      rateLimit: { ...config.rateLimit, loginCodePerIdentifier: porCorreo, loginCodePerIp: porIp },
    };
    const appLimite = createApp({
      config: configLimite,
      logger,
      tokenService: tokens,
      catalogoRepository: banco.catalogos,
      apiKeyService: createApiKeyService(banco.apiKeys),
      authService: createAuthService({
        usuarios: banco.usuarios,
        sesiones: banco.sesiones,
        tokens,
        correo: createMailService(banco.correo),
        codigos: createCodigoConfirmacionService({
          codigos: banco.codigos,
          usuarios: banco.usuarios,
          hasher,
          config: configLimite,
          logger,
        }),
        codigosAcceso: crearServicioCodigoAccesoDePrueba({
          banco,
          hasher,
          config: configLimite,
          logger,
        }),
        config: configLimite,
        logger,
      }),
    });
    await request(appLimite)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: primero })
      .expect(200);
    const respuesta = await request(appLimite)
      .post(`${base}/auth/login`)
      .set('X-API-Key', clave)
      .send({ email: segundo })
      .expect(429);
    expect(respuesta.body as unknown).toMatchObject({ error: { codigo: 'RATE_LIMIT_EXCEDIDO' } });
  });

  it('limita por correo normalizado despues de diez intentos', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post(`${base}/auth/login/code`)
        .set('X-API-Key', clave)
        .send({ email: 'limite@ejemplo.co', codigo: '123456' })
        .expect(401);
    }
    const respuesta = await request(app)
      .post(`${base}/auth/login/code`)
      .set('X-API-Key', clave)
      .send({ email: 'LIMITE@EJEMPLO.CO', codigo: '123456' })
      .expect(429);
    expect(
      z.object({ error: z.object({ codigo: z.string() }) }).parse(respuesta.body as unknown).error
        .codigo,
    ).toBe('RATE_LIMIT_EXCEDIDO');
  });
});
