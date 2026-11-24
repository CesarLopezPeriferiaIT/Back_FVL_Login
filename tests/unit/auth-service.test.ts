/**
 * Pruebas de las reglas de negocio del registro, la confirmacion y el inicio de sesion.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createAuthService, LIMITE_INTENTOS_FALLIDOS } from '../../src/domain/auth-service.js';
import type { AuthService } from '../../src/domain/auth-service.js';
import type { Usuario } from '../../src/domain/entities.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createTokenService } from '../../src/domain/token-service.js';
import type { AppConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria, insertarUsuario } from '../helpers/in-memory.js';
import type { BancoEnMemoria } from '../helpers/in-memory.js';

const PASSWORD = 'ClaveSegura1';
const UBICACION = { codigoDepartamento: '76', codigoMunicipio: '76001', codigoRol: 1 };

const hasher = createPasswordHasher();

const crearServicio = (): {
  banco: BancoEnMemoria;
  authService: AuthService;
  config: AppConfig;
} => {
  const banco = crearBancoEnMemoria();
  const config = configDePrueba();
  const authService = createAuthService({
    usuarios: banco.usuarios,
    sesiones: banco.sesiones,
    hasher,
    tokens: createTokenService(config),
    correo: createMailService(banco.correo),
    config,
    logger: createLogger('error'),
  });

  return { banco, authService, config };
};

const extraerToken = (texto: string): string => {
  const coincidencia = /token=([^\s]+)/.exec(texto);
  const token = coincidencia?.[1];

  if (token === undefined) {
    throw new Error('El mensaje de correo no contiene un token.');
  }

  return decodeURIComponent(token);
};

const registrarActivo = async (): Promise<{
  banco: BancoEnMemoria;
  authService: AuthService;
  usuario: Usuario;
}> => {
  const { banco, authService } = crearServicio();
  const usuario = insertarUsuario(banco, {
    email: 'usuario@ejemplo.co',
    passHash: await hasher.hash(PASSWORD),
    estado: 'A',
  });

  return { banco, authService, usuario };
};

describe('registro de cuenta', () => {
  it('crea la cuenta en estado por confirmar y envia el correo de confirmacion', async () => {
    const { banco, authService } = crearServicio();

    const resultado = await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });

    expect(resultado.usuario.estado).toBe('C');
    expect(resultado.correoConfirmacionEnviado).toBe(true);
    expect(banco.estado.usuarios).toHaveLength(1);
    expect(banco.estado.correos).toHaveLength(1);
    expect(banco.estado.correos[0]?.destinatario).toBe('nuevo@ejemplo.co');
    expect(banco.estado.correos[0]?.texto).toContain('confirm-email');
  });

  it('no envia el correo de confirmacion cuando no se aceptan los terminos', async () => {
    const { banco, authService } = crearServicio();

    const resultado = await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: false,
      ...UBICACION,
    });

    expect(resultado.correoConfirmacionEnviado).toBe(false);
    expect(resultado.usuario.estado).toBe('C');
    expect(banco.estado.correos).toHaveLength(0);
    expect(banco.estado.usuarios).toHaveLength(1);
  });

  it('normaliza el correo antes de persistirlo', async () => {
    const { banco, authService } = crearServicio();

    await authService.registrar({
      email: '  Nuevo@Ejemplo.CO ',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });

    expect(banco.estado.usuarios[0]?.email).toBe('nuevo@ejemplo.co');
  });

  it('almacena la contrasena cifrada y nunca en texto plano', async () => {
    const { banco, authService } = crearServicio();

    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });

    expect(banco.estado.usuarios[0]?.passHash).not.toBe(PASSWORD);
    await expect(hasher.verify(banco.estado.usuarios[0]?.passHash ?? '', PASSWORD)).resolves.toBe(
      true,
    );
  });

  it('rechaza un codigo de catalogo inexistente', async () => {
    const { banco, authService } = crearServicio();
    banco.usuarios.create = async () => {
      throw Object.assign(new Error('llave foranea'), { number: 547 });
    };

    await expect(
      authService.registrar({
        email: 'nuevo@ejemplo.co',
        password: PASSWORD,
        tyc: true,
        ...UBICACION,
      }),
    ).rejects.toMatchObject({ codigo: 'CATALOGO_INVALIDO', status: 400 });
  });

  it('rechaza un correo ya registrado', async () => {
    const { authService } = crearServicio();

    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });

    await expect(
      authService.registrar({
        email: 'nuevo@ejemplo.co',
        password: PASSWORD,
        tyc: true,
        ...UBICACION,
      }),
    ).rejects.toMatchObject({ codigo: 'USUARIO_YA_EXISTE', status: 409 });
  });
});

describe('confirmacion de correo', () => {
  it('deja la cuenta activa cuando el enlace es valido', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });

    const token = extraerToken(banco.estado.correos[0]?.texto ?? '');
    const usuario = await authService.confirmarCorreo(token);

    expect(usuario.estado).toBe('A');
    expect(banco.estado.usuarios[0]?.estado).toBe('A');
  });

  it('rechaza un enlace invalido', async () => {
    const { authService } = crearServicio();

    await expect(authService.confirmarCorreo('token-invalido')).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
      status: 400,
    });
  });

  it('rechaza confirmar una cuenta que ya fue confirmada', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      password: PASSWORD,
      tyc: true,
      ...UBICACION,
    });
    const token = extraerToken(banco.estado.correos[0]?.texto ?? '');

    await authService.confirmarCorreo(token);

    await expect(authService.confirmarCorreo(token)).rejects.toMatchObject({
      codigo: 'CUENTA_YA_CONFIRMADA',
      status: 409,
    });
  });
});

describe('inicio de sesion', () => {
  it('devuelve los tokens y registra la sesion con el refresh hasheado', async () => {
    const { banco, authService } = await registrarActivo();

    const resultado = await authService.iniciarSesion({
      email: 'usuario@ejemplo.co',
      password: PASSWORD,
    });

    expect(resultado.tokenAcceso).toBeTruthy();
    expect(resultado.tokenRefresh).toBeTruthy();
    expect(resultado.expiresIn).toBe(900);
    expect(banco.estado.sesiones).toHaveLength(1);
    expect(banco.estado.sesiones[0]?.successful).toBe(true);
    expect(banco.estado.sesiones[0]?.refreshTokenHash).not.toBe(resultado.tokenRefresh);
  });

  it('no registra intento cuando el correo no existe', async () => {
    const { banco, authService } = crearServicio();

    await expect(
      authService.iniciarSesion({ email: 'nadie@ejemplo.co', password: PASSWORD }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });

    expect(banco.estado.sesiones).toHaveLength(0);
  });

  it('registra el intento fallido cuando la contrasena no coincide', async () => {
    const { banco, authService } = await registrarActivo();

    await expect(
      authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: 'ClaveErronea1' }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });

    expect(banco.estado.sesiones).toHaveLength(1);
    expect(banco.estado.sesiones[0]?.successful).toBe(false);
    expect(banco.estado.sesiones[0]?.refreshTokenHash).toBeNull();
  });

  it('desactiva la cuenta al alcanzar el limite de intentos fallidos', async () => {
    const { banco, authService, usuario } = await registrarActivo();

    for (let intento = 1; intento < LIMITE_INTENTOS_FALLIDOS; intento += 1) {
      await expect(
        authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: 'ClaveErronea1' }),
      ).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });
    }

    expect(usuario.estado).toBe('A');

    await expect(
      authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: 'ClaveErronea1' }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_DESACTIVADA', status: 403 });

    expect(usuario.estado).toBe('D');
    expect(banco.estado.sesiones.filter((sesion) => !sesion.successful)).toHaveLength(
      LIMITE_INTENTOS_FALLIDOS,
    );
  });

  it('reinicia el contador de intentos despues de un acceso exitoso', async () => {
    const { authService } = await registrarActivo();

    await expect(
      authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: 'ClaveErronea1' }),
    ).rejects.toThrow();
    await authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: PASSWORD });

    await expect(
      authService.iniciarSesion({ email: 'usuario@ejemplo.co', password: 'ClaveErronea1' }),
    ).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', status: 401 });
  });

  it('bloquea el acceso a una cuenta por confirmar', async () => {
    const { banco, authService } = crearServicio();
    insertarUsuario(banco, {
      email: 'pendiente@ejemplo.co',
      passHash: await hasher.hash(PASSWORD),
      estado: 'C',
    });

    await expect(
      authService.iniciarSesion({ email: 'pendiente@ejemplo.co', password: PASSWORD }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_POR_CONFIRMAR', status: 403 });
  });

  it('bloquea el acceso a una cuenta desactivada', async () => {
    const { banco, authService } = crearServicio();
    insertarUsuario(banco, {
      email: 'desactivada@ejemplo.co',
      passHash: await hasher.hash(PASSWORD),
      estado: 'D',
    });

    await expect(
      authService.iniciarSesion({ email: 'desactivada@ejemplo.co', password: PASSWORD }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_DESACTIVADA', status: 403 });
  });

  it('bloquea el acceso a una cuenta inactiva', async () => {
    const { banco, authService } = crearServicio();
    insertarUsuario(banco, {
      email: 'inactiva@ejemplo.co',
      passHash: await hasher.hash(PASSWORD),
      estado: 'I',
    });

    await expect(
      authService.iniciarSesion({ email: 'inactiva@ejemplo.co', password: PASSWORD }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_INACTIVA', status: 403 });
  });
});

describe('renovacion y cierre de sesion', () => {
  it('rota el refresh token al renovar la sesion', async () => {
    const { banco, authService } = await registrarActivo();
    const inicial = await authService.iniciarSesion({
      email: 'usuario@ejemplo.co',
      password: PASSWORD,
    });

    const renovada = await authService.renovarSesion(inicial.tokenRefresh);

    expect(renovada.tokenRefresh).not.toBe(inicial.tokenRefresh);
    expect(renovada.tokenAcceso).toBeTruthy();
    expect(banco.estado.sesiones[0]?.rotadoEn).not.toBeNull();
  });

  it('invalida el refresh token anterior a la rotacion', async () => {
    const { authService } = await registrarActivo();
    const inicial = await authService.iniciarSesion({
      email: 'usuario@ejemplo.co',
      password: PASSWORD,
    });

    await authService.renovarSesion(inicial.tokenRefresh);

    await expect(authService.renovarSesion(inicial.tokenRefresh)).rejects.toMatchObject({
      codigo: 'SESION_INVALIDA',
      status: 401,
    });
  });

  it('rechaza un refresh token desconocido', async () => {
    const { authService } = await registrarActivo();

    await expect(authService.renovarSesion('token-inexistente')).rejects.toMatchObject({
      codigo: 'SESION_INVALIDA',
      status: 401,
    });
  });

  it('revoca la sesion al cerrarla', async () => {
    const { banco, authService } = await registrarActivo();
    const inicial = await authService.iniciarSesion({
      email: 'usuario@ejemplo.co',
      password: PASSWORD,
    });

    await authService.cerrarSesion(banco.estado.sesiones[0]?.uuid ?? '');

    expect(banco.estado.sesiones[0]?.revokedAt).not.toBeNull();
    await expect(authService.renovarSesion(inicial.tokenRefresh)).rejects.toMatchObject({
      codigo: 'SESION_INVALIDA',
      status: 401,
    });
  });
});

describe('consulta del perfil', () => {
  it('devuelve los datos publicos de la cuenta', async () => {
    const { authService, usuario } = await registrarActivo();

    const perfil = await authService.consultarPerfil(usuario.uuid);

    expect(perfil.uuid).toBe(usuario.uuid);
    expect(perfil.email).toBe('usuario@ejemplo.co');
    expect(perfil).not.toHaveProperty('passHash');
  });

  it('falla cuando la cuenta no existe', async () => {
    const { authService } = crearServicio();

    await expect(authService.consultarPerfil('uuid-inexistente')).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
      status: 404,
    });
  });
});
