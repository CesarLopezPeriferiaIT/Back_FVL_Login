/**
 * Tests for login codes.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it, vi } from 'vitest';
import { createCodigoLoginService } from '../../src/domain/codigo-login-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria, insertarUsuario } from '../helpers/in-memory.js';

const preparar = (): {
  banco: ReturnType<typeof crearBancoEnMemoria>;
  usuario: ReturnType<typeof insertarUsuario>;
  config: ReturnType<typeof configDePrueba>;
  hasher: ReturnType<typeof createPasswordHasher>;
  servicio: ReturnType<typeof createCodigoLoginService>;
} => {
  const banco = crearBancoEnMemoria();
  const usuario = insertarUsuario(banco, { email: 'prueba@ejemplo.com' });
  const config = configDePrueba();
  const hasher = createPasswordHasher();
  const servicio = createCodigoLoginService({
    codigos: banco.codigosLogin,
    usuarios: banco.usuarios,
    hasher,
    config,
    logger: createLogger('error'),
  });
  return { banco, usuario, config, hasher, servicio };
};

describe('codigos de acceso', () => {
  it('genera un codigo de seis digitos y almacena un hash', async () => {
    const banco = crearBancoEnMemoria();
    const usuario = insertarUsuario(banco, { email: 'prueba@ejemplo.com' });
    const hasher = createPasswordHasher();
    const servicio = createCodigoLoginService({
      codigos: banco.codigosLogin,
      usuarios: banco.usuarios,
      hasher,
      config: configDePrueba(),
      logger: createLogger('error'),
    });
    const { codigo } = await servicio.generar(usuario.email);
    expect(codigo).toMatch(/^\d{6}$/);
    const registro = await banco.codigosLogin.buscarNoConsumidoPorUsuario(usuario.uuid);
    expect(registro?.codigoHash).not.toBe(codigo);
    expect(await hasher.verify(registro!.codigoHash, codigo)).toBe(true);
  });

  it('respeta la vigencia y guarda solo el hash', async () => {
    const { servicio, usuario, config, banco, hasher } = preparar();
    config.loginCode.ttlMinutes = 3;
    const guardar = vi.spyOn(banco.codigosLogin, 'guardar');
    const antes = Date.now();
    const { codigo, expiraEn } = await servicio.generar(' PRUEBA@EJEMPLO.COM ');
    expect(expiraEn.getTime()).toBeGreaterThanOrEqual(antes + 180000);
    expect(expiraEn.getTime()).toBeLessThanOrEqual(Date.now() + 180000);
    const guardado = guardar.mock.calls[0]![0];
    expect(JSON.stringify(guardado)).not.toContain(codigo);
    expect(guardado.codigoHash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(guardado.codigoHash, codigo)).toBe(true);
    expect(guardado.uuidUsuario).toBe(usuario.uuid);
  });

  it('invalida el codigo anterior', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    await servicio.generar(usuario.email);
    expect(banco.estado.codigosLogin[0]!.invalidado).toBe(true);
    expect(banco.estado.codigosLogin[1]!.invalidado).toBe(false);
  });

  it('clasifica cuentas inexistentes sin revelar su existencia', async () => {
    const { servicio, banco } = preparar();
    await expect(servicio.generar('ausente@ejemplo.com')).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
      status: 404,
    });
    await expect(servicio.validar('ausente@ejemplo.com', '123456')).rejects.toMatchObject({
      codigo: 'CODIGO_ACCESO_NO_EXISTE',
      status: 401,
    });
    expect(await servicio.clasificarFallo('ausente@ejemplo.com')).toMatchObject({
      codigo: 'CODIGO_ACCESO_NO_EXISTE',
      status: 401,
    });
    expect(banco.estado.codigosLogin).toHaveLength(0);
  });

  it.each([
    ['C', 'CUENTA_POR_CONFIRMAR'],
    ['I', 'CUENTA_INACTIVA'],
    ['D', 'CUENTA_DESACTIVADA'],
  ] as const)('rechaza estado %s', async (estado, codigo) => {
    const { servicio, usuario, banco } = preparar();
    usuario.estado = estado;
    await expect(servicio.generar(usuario.email)).rejects.toMatchObject({ codigo, status: 403 });
    await expect(servicio.validar(usuario.email, '123456')).rejects.toMatchObject({
      codigo,
      status: 403,
    });
    expect(await servicio.clasificarFallo(usuario.email)).toMatchObject({ codigo, status: 403 });
    expect(banco.estado.codigosLogin).toHaveLength(0);
  });

  it('clasifica ausencia y vencimiento', async () => {
    const { servicio, usuario, banco } = preparar();
    expect(await servicio.clasificarFallo(usuario.email)).toMatchObject({
      codigo: 'CODIGO_ACCESO_NO_EXISTE',
      status: 401,
    });
    await servicio.generar(usuario.email);
    banco.estado.codigosLogin[0]!.expiraEn = new Date(0);
    await expect(servicio.validar(usuario.email, '123456')).rejects.toMatchObject({
      codigo: 'CODIGO_ACCESO_VENCIDO',
      status: 401,
    });
    expect(await servicio.clasificarFallo(usuario.email)).toMatchObject({
      codigo: 'CODIGO_ACCESO_VENCIDO',
      status: 401,
    });
    expect(banco.estado.codigosLogin[0]!.intentos).toBe(0);
  });

  it('cuenta intentos y clasifica la invalidacion al quinto', async () => {
    const { servicio, usuario, banco } = preparar();
    const { codigo } = await servicio.generar(usuario.email);
    const incorrecto = codigo === '999999' ? '000000' : '999999';
    expect(await servicio.clasificarFallo(usuario.email)).toMatchObject({
      codigo: 'CODIGO_ACCESO_INVALIDO',
      status: 401,
    });
    for (let intento = 1; intento <= 4; intento++) {
      await expect(servicio.validar(usuario.email, incorrecto)).rejects.toMatchObject({
        codigo: 'CODIGO_ACCESO_INVALIDO',
        status: 401,
      });
      expect(banco.estado.codigosLogin[0]!.intentos).toBe(intento);
    }
    await expect(servicio.validar(usuario.email, incorrecto)).rejects.toMatchObject({
      codigo: 'CODIGO_ACCESO_INVALIDADO',
      status: 401,
    });
    expect(banco.estado.codigosLogin[0]).toMatchObject({ intentos: 5, invalidado: true });
    expect(await servicio.clasificarFallo(usuario.email)).toMatchObject({
      codigo: 'CODIGO_ACCESO_INVALIDADO',
      status: 401,
    });
  });

  it('valida y consume un codigo vigente una sola vez', async () => {
    const { servicio, usuario, banco } = preparar();
    const { codigo } = await servicio.generar(usuario.email);
    const uuidCodigo = banco.estado.codigosLogin[0]!.uuid;
    await expect(servicio.validar(usuario.email, codigo)).resolves.toEqual({ usuario, uuidCodigo });
    await expect(servicio.marcarUsado(uuidCodigo)).resolves.toBe(true);
    await expect(servicio.marcarUsado(uuidCodigo)).resolves.toBe(false);
  });
});
