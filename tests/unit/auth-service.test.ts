/**
 * Pruebas de las reglas de negocio del registro, la confirmacion y el inicio de sesion.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createAuthService } from '../../src/domain/auth-service.js';
import type { AuthService } from '../../src/domain/auth-service.js';
import type { Usuario } from '../../src/domain/entities.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createCodigoConfirmacionService } from '../../src/domain/codigo-confirmacion-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createTokenService } from '../../src/domain/token-service.js';
import type { AppConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import {
  crearBancoEnMemoria,
  insertarUsuario,
  crearServicioCodigoAccesoDePrueba,
} from '../helpers/in-memory.js';
import type { BancoEnMemoria } from '../helpers/in-memory.js';

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
    tokens: createTokenService(config),
    correo: createMailService(banco.correo),
    codigos: createCodigoConfirmacionService({
      codigos: banco.codigos,
      usuarios: banco.usuarios,
      hasher,
      config,
      logger: createLogger('error'),
    }),
    codigosAcceso: crearServicioCodigoAccesoDePrueba({
      banco,
      hasher,
      config,
      logger: createLogger('error'),
    }),
    config,
    logger: createLogger('error'),
  });

  return { banco, authService, config };
};

const extraerCodigo = (texto: string): string => {
  const codigo = /^\d{6}$/m.exec(texto)?.[0];
  if (codigo === undefined) throw new Error('El correo no contiene un codigo.');
  return codigo;
};

const registrarActivo = async (): Promise<{
  banco: BancoEnMemoria;
  authService: AuthService;
  usuario: Usuario;
}> => {
  const { banco, authService } = crearServicio();
  const usuario = insertarUsuario(banco, {
    email: 'usuario@ejemplo.co',
    estado: 'A',
  });

  return { banco, authService, usuario };
};

describe('confirmacion con codigo', () => {
  it('detecta el vencimiento entre comparacion y activacion', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'vence@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const activar = banco.usuarios.activarConCodigoVigente.bind(banco.usuarios);
    banco.usuarios.activarConCodigoVigente = async (uuid, uuidCodigo) => {
      banco.estado.codigos[0]!.expiraEn = new Date(0);
      return activar(uuid, uuidCodigo);
    };
    await expect(
      authService.confirmarCodigo({ email: 'vence@ejemplo.co', codigo }),
    ).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_VENCIDO',
      status: 400,
    });
    expect(banco.estado.usuarios[0]?.estado).toBe('C');
    expect(banco.estado.codigos[0]?.usadoEn).toBeNull();
    expect(banco.estado.codigos[0]?.intentos).toBe(0);
  });
  it('rechaza la validacion en vuelo si el codigo se invalida', async () => {
    const banco = crearBancoEnMemoria();
    const config = configDePrueba();
    let liberar = (): void => {};
    let avisar = (): void => {};
    const bloqueado = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const iniciado = new Promise<void>((resolve) => {
      avisar = resolve;
    });
    let correcto = '';
    const hasherBloqueante = {
      hash: (valor: string) => hasher.hash(valor),
      verify: async (hash: string, valor: string): Promise<boolean> => {
        if (valor === correcto) {
          avisar();
          await bloqueado;
        }
        return hasher.verify(hash, valor);
      },
    };
    const codigos = createCodigoConfirmacionService({
      codigos: banco.codigos,
      usuarios: banco.usuarios,
      hasher: hasherBloqueante,
      config,
      logger: createLogger('error'),
    });
    const authService = createAuthService({
      usuarios: banco.usuarios,
      sesiones: banco.sesiones,
      tokens: createTokenService(config),
      correo: createMailService(banco.correo),
      codigos,
      codigosAcceso: crearServicioCodigoAccesoDePrueba({
        banco,
        hasher: hasherBloqueante,
        config,
        logger: createLogger('error'),
      }),
      config,
      logger: createLogger('error'),
    });
    const usuario = insertarUsuario(banco, {
      email: 'carrera@ejemplo.co',
      estado: 'C',
    });
    correcto = (await codigos.generar(usuario.email)).codigo;
    const incorrecto = correcto === '000000' ? '000001' : '000000';
    const enVuelo = authService.confirmarCodigo({ email: usuario.email, codigo: correcto });
    await iniciado;
    for (let intento = 0; intento < 4; intento += 1) {
      await expect(
        authService.confirmarCodigo({ email: usuario.email, codigo: incorrecto }),
      ).rejects.toMatchObject({ codigo: 'CODIGO_CONFIRMACION_INVALIDO', status: 400 });
    }
    await expect(
      authService.confirmarCodigo({ email: usuario.email, codigo: incorrecto }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_CONFIRMACION_INVALIDADO', status: 429 });
    liberar();
    await expect(enVuelo).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDADO',
      status: 429,
    });
    expect(usuario.estado).toBe('C');
    expect(banco.estado.codigos[0]?.usadoEn).toBeNull();
  });
  it('rechaza la segunda confirmacion concurrente como cuenta confirmada', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'carrera@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const activar = banco.usuarios.activarConCodigoVigente.bind(banco.usuarios);
    let liberar = (): void => {};
    let avisar = (): void => {};
    const espera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const iniciado = new Promise<void>((resolve) => {
      avisar = resolve;
    });
    let primera = true;
    banco.usuarios.activarConCodigoVigente = async (uuid, uuidCodigo) => {
      if (primera) {
        primera = false;
        avisar();
        await espera;
      }
      return activar(uuid, uuidCodigo);
    };
    const segunda = authService.confirmarCodigo({ email: 'carrera@ejemplo.co', codigo });
    await iniciado;
    const resultado = await authService.confirmarCodigo({ email: 'carrera@ejemplo.co', codigo });
    expect(resultado.estado).toBe('A');
    liberar();
    await expect(segunda).rejects.toMatchObject({ codigo: 'CUENTA_YA_CONFIRMADA', status: 409 });
    expect(banco.estado.usuarios[0]?.estado).toBe('A');
    expect(banco.estado.codigos[0]?.usadoEn).not.toBeNull();
  });
  it('activa la cuenta antes de consumir el codigo', async () => {
    const { banco, authService, config } = crearServicio();
    const usuario = insertarUsuario(banco, {
      email: 'codigo@ejemplo.co',
      estado: 'C',
    });
    const codigos = createCodigoConfirmacionService({
      codigos: banco.codigos,
      usuarios: banco.usuarios,
      hasher,
      config,
      logger: createLogger('error'),
    });
    const generado = await codigos.generar(usuario.email);
    const marcarUsado = banco.codigos.marcarUsado.bind(banco.codigos);
    banco.codigos.marcarUsado = async (uuid: string) => {
      expect(usuario.estado).toBe('A');
      await marcarUsado(uuid);
    };
    const resultado = await authService.confirmarCodigo({
      email: usuario.email,
      codigo: generado.codigo,
    });
    expect(resultado.estado).toBe('A');
    expect(usuario.estado).toBe('A');
    expect(banco.estado.codigos[0]?.usadoEn).not.toBeNull();
  });
});

describe('registro de cuenta', () => {
  it('crea la cuenta en estado por confirmar y envia el correo de confirmacion', async () => {
    const { banco, authService } = crearServicio();

    const resultado = await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });

    expect(resultado.usuario.estado).toBe('C');
    expect(resultado.correoConfirmacionEnviado).toBe(true);
    expect(banco.estado.usuarios).toHaveLength(1);
    expect(banco.estado.correos).toHaveLength(1);
    expect(banco.estado.correos[0]?.destinatario).toBe('nuevo@ejemplo.co');
    expect(extraerCodigo(banco.estado.correos[0]?.texto ?? '')).toMatch(/^\d{6}$/);
  });

  it('no envia el correo de confirmacion cuando no se aceptan los terminos', async () => {
    const { banco, authService } = crearServicio();

    const resultado = await authService.registrar({
      email: 'nuevo@ejemplo.co',
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
      tyc: true,
      ...UBICACION,
    });

    expect(banco.estado.usuarios[0]?.email).toBe('nuevo@ejemplo.co');
  });

  it('rechaza un codigo de catalogo inexistente', async () => {
    const { banco, authService } = crearServicio();
    banco.usuarios.create = async () => {
      throw Object.assign(new Error('llave foranea'), { number: 547 });
    };

    await expect(
      authService.registrar({
        email: 'nuevo@ejemplo.co',
        tyc: true,
        ...UBICACION,
      }),
    ).rejects.toMatchObject({ codigo: 'CATALOGO_INVALIDO', status: 400 });
  });

  it('rechaza un correo ya registrado', async () => {
    const { authService } = crearServicio();

    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });

    await expect(
      authService.registrar({
        email: 'nuevo@ejemplo.co',
        tyc: true,
        ...UBICACION,
      }),
    ).rejects.toMatchObject({ codigo: 'USUARIO_YA_EXISTE', status: 409 });
  });
});

describe('confirmacion de correo', () => {
  it('deja la cuenta activa cuando el codigo es valido', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });

    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const usuario = await authService.confirmarCodigo({ email: 'nuevo@ejemplo.co', codigo });

    expect(usuario.estado).toBe('A');
    expect(banco.estado.usuarios[0]?.estado).toBe('A');
  });

  it('rechaza un codigo incorrecto sin activar ni consumir la cuenta', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    await expect(
      authService.confirmarCodigo({
        email: 'nuevo@ejemplo.co',
        codigo: codigo === '000000' ? '000001' : '000000',
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_CONFIRMACION_INVALIDO', status: 400 });
    expect(banco.estado.usuarios[0]?.estado).toBe('C');
    expect(banco.estado.codigos[0]?.usadoEn).toBeNull();
  });

  it('rechaza un codigo vencido sin activar ni consumir la cuenta', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const registro = banco.estado.codigos[0];
    if (!registro) throw new Error('Codigo no encontrado');
    registro.expiraEn = new Date(0);
    await expect(
      authService.confirmarCodigo({ email: 'nuevo@ejemplo.co', codigo }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_CONFIRMACION_VENCIDO', status: 400 });
    expect(banco.estado.usuarios[0]?.estado).toBe('C');
    expect(registro.usadoEn).toBeNull();
    expect(registro.intentos).toBe(0);
  });

  it('rechaza confirmar una cuenta que ya fue confirmada', async () => {
    const { banco, authService } = crearServicio();
    await authService.registrar({
      email: 'nuevo@ejemplo.co',
      tyc: true,
      ...UBICACION,
    });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');

    await authService.confirmarCodigo({ email: 'nuevo@ejemplo.co', codigo });

    await expect(
      authService.confirmarCodigo({ email: 'nuevo@ejemplo.co', codigo }),
    ).rejects.toMatchObject({
      codigo: 'CUENTA_YA_CONFIRMADA',
      status: 409,
    });
  });
});

describe('inicio de sesion con codigo', () => {
  it('devuelve correo no enviado si falla la entrega', async () => {
    const { banco, authService, usuario } = await registrarActivo();
    banco.correo.enviar = async () => {
      throw new Error('fallo de correo');
    };
    await expect(authService.solicitarCodigoAcceso({ email: usuario.email })).resolves.toEqual({
      correoEnviado: false,
    });
    expect(banco.estado.correos).toHaveLength(0);
  });

  it.each([
    ['C', 'CUENTA_POR_CONFIRMAR'],
    ['I', 'CUENTA_INACTIVA'],
    ['D', 'CUENTA_DESACTIVADA'],
  ] as const)('rechaza solicitar codigo para estado %s', async (estado, codigo) => {
    const { banco, authService } = crearServicio();
    const usuario = insertarUsuario(banco, { email: 'estado@ejemplo.co', estado });
    await expect(authService.solicitarCodigoAcceso({ email: usuario.email })).rejects.toMatchObject(
      {
        codigo,
        status: 403,
      },
    );
    expect(banco.estado.correos).toHaveLength(0);
    expect(banco.estado.codigosLogin).toHaveLength(0);
  });

  it('registra el intento de un codigo incorrecto', async () => {
    const { banco, authService, usuario } = await registrarActivo();
    await authService.solicitarCodigoAcceso({ email: usuario.email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    await expect(
      authService.iniciarSesionConCodigo({
        email: usuario.email,
        codigo: codigo === '000000' ? '000001' : '000000',
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_ACCESO_INVALIDO', status: 401 });
    expect(banco.estado.sesiones).toHaveLength(1);
    expect(banco.estado.sesiones[0]?.successful).toBe(false);
    expect(banco.estado.sesiones[0]?.uuidUsuario).toBe(usuario.uuid);
  });

  it('clasifica el codigo consumido durante la validacion', async () => {
    const { banco, authService, usuario } = await registrarActivo();
    await authService.solicitarCodigoAcceso({ email: usuario.email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const marcarUsado = banco.codigosLogin.marcarUsado.bind(banco.codigosLogin);
    banco.codigosLogin.marcarUsado = async (uuid) => {
      expect(await marcarUsado(uuid)).toBe(true);
      return marcarUsado(uuid);
    };
    await expect(
      authService.iniciarSesionConCodigo({ email: usuario.email, codigo }),
    ).rejects.toMatchObject({
      codigo: 'CODIGO_ACCESO_NO_EXISTE',
      status: 401,
    });
    expect(banco.estado.sesiones.filter((sesion) => sesion.successful)).toHaveLength(0);
  });

  it('envia el codigo y permite iniciar sesion', async () => {
    const { banco, authService, usuario } = await registrarActivo();
    await expect(
      authService.solicitarCodigoAcceso({ email: ' USUARIO@EJEMPLO.CO ' }),
    ).resolves.toEqual({ correoEnviado: true });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const sesion = await authService.iniciarSesionConCodigo({ email: usuario.email, codigo });
    expect(sesion.tokenAcceso).toBeTruthy();
    expect(sesion.tokenRefresh).toBeTruthy();
    expect(sesion.usuario.uuid).toBe(usuario.uuid);
    expect(banco.estado.sesiones[0]?.successful).toBe(true);
  });
  it('cuenta errores y desactiva al decimo', async () => {
    const { banco, authService, usuario } = await registrarActivo();
    await authService.solicitarCodigoAcceso({ email: usuario.email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const incorrecto = codigo === '000000' ? '000001' : '000000';
    for (let i = 0; i < 9; i++) {
      await expect(
        authService.iniciarSesionConCodigo({ email: usuario.email, codigo: incorrecto }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      authService.iniciarSesionConCodigo({ email: usuario.email, codigo: incorrecto }),
    ).rejects.toMatchObject({ codigo: 'CUENTA_DESACTIVADA', status: 403 });
    expect(usuario.estado).toBe('D');
    expect(banco.estado.sesiones).toHaveLength(10);
  });
  it('no cuenta un correo desconocido', async () => {
    const { banco, authService } = crearServicio();
    await expect(
      authService.iniciarSesionConCodigo({ email: 'nadie@ejemplo.co', codigo: '123456' }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_ACCESO_NO_EXISTE', status: 401 });
    expect(banco.estado.sesiones).toHaveLength(0);
  });
  it('responde igual para un correo desconocido sin enviar correo', async () => {
    const { banco, authService } = crearServicio();
    await expect(authService.solicitarCodigoAcceso({ email: 'nadie@ejemplo.co' })).resolves.toEqual(
      {
        correoEnviado: true,
      },
    );
    expect(banco.estado.correos).toHaveLength(0);
  });
});

describe('renovacion y cierre de sesion', () => {
  it('rota el refresh token al renovar la sesion', async () => {
    const { banco, authService } = await registrarActivo();
    const email = 'usuario@ejemplo.co';
    await authService.solicitarCodigoAcceso({ email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const inicial = await authService.iniciarSesionConCodigo({ email, codigo });

    const renovada = await authService.renovarSesion(inicial.tokenRefresh);

    expect(renovada.tokenRefresh).not.toBe(inicial.tokenRefresh);
    expect(renovada.tokenAcceso).toBeTruthy();
    expect(banco.estado.sesiones[0]?.rotadoEn).not.toBeNull();
  });

  it('invalida el refresh token anterior a la rotacion', async () => {
    const { banco, authService } = await registrarActivo();
    const email = 'usuario@ejemplo.co';
    await authService.solicitarCodigoAcceso({ email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const inicial = await authService.iniciarSesionConCodigo({ email, codigo });

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
    const email = 'usuario@ejemplo.co';
    await authService.solicitarCodigoAcceso({ email });
    const codigo = extraerCodigo(banco.estado.correos[0]?.texto ?? '');
    const inicial = await authService.iniciarSesionConCodigo({ email, codigo });

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
