/**
 * Tests for confirmation codes.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type * as Crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { createCodigoConfirmacionService } from '../../src/domain/codigo-confirmacion-service.js';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';
import { crearBancoEnMemoria, insertarUsuario } from '../helpers/in-memory.js';

vi.mock('node:crypto', async (importarOriginal) => {
  const original = await importarOriginal<typeof Crypto>();
  return { ...original, randomInt: () => 42 };
});

const preparar = (): {
  banco: ReturnType<typeof crearBancoEnMemoria>;
  usuario: ReturnType<typeof insertarUsuario>;
  hasher: ReturnType<typeof createPasswordHasher>;
  config: ReturnType<typeof configDePrueba>;
  servicio: ReturnType<typeof createCodigoConfirmacionService>;
} => {
  const banco = crearBancoEnMemoria();
  const usuario = insertarUsuario(banco, {
    email: 'prueba@ejemplo.com',
    passHash: 'hash',
    estado: 'C',
  });
  const hasher = createPasswordHasher();
  const config = configDePrueba();
  const servicio = createCodigoConfirmacionService({
    codigos: banco.codigos,
    usuarios: banco.usuarios,
    hasher,
    config,
    logger: createLogger('error'),
  });
  return { banco, usuario, hasher, config, servicio };
};

describe('codigos de confirmacion', () => {
  it('genera y valida un codigo sin consumirlo', async () => {
    const { banco, usuario, hasher, servicio } = preparar();
    const resultado = await servicio.generar(' PRUEBA@EJEMPLO.COM ');
    expect(resultado.codigo).toMatch(/^\d{6}$/);
    expect(banco.estado.codigos[0]?.codigoHash).not.toBe(resultado.codigo);
    expect(await hasher.verify(banco.estado.codigos[0]!.codigoHash, resultado.codigo)).toBe(true);
    expect(await servicio.validar(usuario.email, resultado.codigo)).toEqual({
      usuario,
      uuidCodigo: resultado.uuidCodigo,
    });
    expect(banco.estado.codigos[0]?.usadoEn).toBeNull();
  });
});

describe('generar', () => {
  it('genera seis digitos y conserva ceros iniciales', async () => {
    const { servicio, usuario } = preparar();
    const { codigo } = await servicio.generar(usuario.email);
    expect(codigo).toMatch(/^\d{6}$/);
    expect(codigo).toBe('000042');
  });
  it('persiste un hash verificable en lugar del codigo', async () => {
    const { servicio, usuario, banco, hasher } = preparar();
    const { codigo } = await servicio.generar(usuario.email);
    const hash = banco.estado.codigos[0]!.codigoHash;
    expect(hash).not.toBe(codigo);
    expect(await hasher.verify(hash, codigo)).toBe(true);
  });
  it('calcula el vencimiento con las horas configuradas', async () => {
    const { servicio, usuario, config } = preparar();
    config.confirmacion.ttlHours = 3;
    const antes = Date.now();
    const { expiraEn } = await servicio.generar(usuario.email);
    const despues = Date.now();
    expect(expiraEn.getTime()).toBeGreaterThanOrEqual(antes + 3 * 3600000);
    expect(expiraEn.getTime()).toBeLessThanOrEqual(despues + 3 * 3600000);
  });
  it('invalida el codigo anterior antes de guardar otro', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    await servicio.generar(usuario.email);
    expect(banco.estado.codigos[0]!.invalidado).toBe(true);
    expect(banco.estado.codigos.filter((c) => c.usadoEn === null && !c.invalidado)).toHaveLength(1);
  });
  it('rechaza un correo sin cuenta', async () => {
    const { servicio, banco } = preparar();
    await expect(servicio.generar('ausente@ejemplo.com')).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
      status: 404,
    });
    expect(banco.estado.codigos).toHaveLength(0);
  });
});

describe('validar', () => {
  it('detecta la confirmacion concurrente al registrar un intento', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    vi.spyOn(banco.codigos, 'registrarIntentoFallido').mockImplementation(async () => {
      usuario.estado = 'A';
      await banco.codigos.marcarUsado(banco.estado.codigos[0]!.uuid);
      return null;
    });
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CUENTA_YA_CONFIRMADA',
      status: 409,
    });
    expect(banco.estado.codigos[0]!.intentos).toBe(0);
  });
  it('rechaza un correo sin cuenta', async () => {
    const { servicio, banco } = preparar();
    await expect(servicio.validar('ausente@ejemplo.com', '000042')).rejects.toMatchObject({
      codigo: 'USUARIO_NO_ENCONTRADO',
      status: 404,
    });
    expect(banco.estado.codigos).toHaveLength(0);
  });
  it('rechaza una cuenta confirmada', async () => {
    const { servicio, usuario, banco } = preparar();
    usuario.estado = 'A';
    await expect(servicio.validar(usuario.email, '000042')).rejects.toMatchObject({
      codigo: 'CUENTA_YA_CONFIRMADA',
      status: 409,
    });
    expect(banco.estado.codigos).toHaveLength(0);
  });
  it('rechaza una cuenta sin codigo', async () => {
    const { servicio, usuario, banco } = preparar();
    await expect(servicio.validar(usuario.email, '000042')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_NO_EXISTE',
      status: 404,
    });
    expect(banco.estado.codigos).toHaveLength(0);
  });
  it('distingue un codigo vencido de uno incorrecto', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    const registro = banco.estado.codigos[0]!;
    registro.expiraEn = new Date(0);
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_VENCIDO',
      status: 400,
    });
    expect(registro.intentos).toBe(0);
    expect(registro.invalidado).toBe(false);
    expect(registro.usadoEn).toBeNull();
  });
  it('detecta el vencimiento al registrar un intento fallido', async () => {
    const { servicio, usuario, banco, hasher, config } = preparar();
    config.confirmacion.maxIntentos = 1;
    await servicio.generar(usuario.email);
    const registro = banco.estado.codigos[0]!;
    vi.spyOn(hasher, 'verify').mockImplementation(async () => {
      registro.expiraEn = new Date(0);
      return false;
    });
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_VENCIDO',
      status: 400,
    });
    expect(usuario.estado).toBe('C');
    expect(registro.intentos).toBe(0);
    expect(registro.invalidado).toBe(false);
    expect(registro.usadoEn).toBeNull();
  });
  it('rechaza cuando el intento ya no puede registrarse', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    vi.spyOn(banco.codigos, 'registrarIntentoFallido').mockResolvedValue(null);
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDADO',
      status: 429,
    });
    expect(banco.estado.codigos[0]!.intentos).toBe(0);
  });
  it('detecta el ultimo codigo vencido sin codigo vigente', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    banco.estado.codigos[0]!.expiraEn = new Date(0);
    vi.spyOn(banco.codigos, 'buscarNoConsumidoPorUsuario').mockResolvedValue(null);
    await expect(servicio.validar(usuario.email, '000042')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_VENCIDO',
      status: 400,
    });
    expect(banco.estado.codigos[0]!.intentos).toBe(0);
  });
  it('incrementa los intentos ante un codigo incorrecto', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDO',
      status: 400,
    });
    expect(banco.estado.codigos[0]!.intentos).toBe(1);
    expect(banco.estado.codigos[0]!.invalidado).toBe(false);
  });
  it('invalida atomicamente en el quinto intento', async () => {
    const { servicio, usuario, banco } = preparar();
    const { codigo } = await servicio.generar(usuario.email);
    for (let intento = 0; intento < 4; intento++) {
      await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
        codigo: 'CODIGO_CONFIRMACION_INVALIDO',
        status: 400,
      });
    }
    const original = banco.codigos.registrarIntentoFallido.bind(banco.codigos);
    let observado: { intentos: number; invalidado: boolean } | undefined;
    vi.spyOn(banco.codigos, 'registrarIntentoFallido').mockImplementation(async (...args) => {
      const resultado = await original(...args);
      const registro = banco.estado.codigos[0]!;
      observado = { intentos: registro.intentos, invalidado: registro.invalidado };
      return resultado;
    });
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDADO',
      status: 429,
    });
    expect(observado).toEqual({ intentos: 5, invalidado: true });
    await expect(servicio.validar(usuario.email, codigo)).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDADO',
      status: 429,
    });
    expect(usuario.estado).toBe('C');
  });
  it('invalida el codigo en el quinto intento fallido', async () => {
    const { servicio, usuario, banco } = preparar();
    await servicio.generar(usuario.email);
    for (let intento = 0; intento < 4; intento++) {
      await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
        codigo: 'CODIGO_CONFIRMACION_INVALIDO',
        status: 400,
      });
    }
    await expect(servicio.validar(usuario.email, '999999')).rejects.toMatchObject({
      codigo: 'CODIGO_CONFIRMACION_INVALIDADO',
      status: 429,
    });
    expect(banco.estado.codigos[0]!.intentos).toBe(5);
    expect(banco.estado.codigos[0]!.invalidado).toBe(true);
  });
});

describe('marcarUsado', () => {
  it('marca el codigo como usado', async () => {
    const { servicio, usuario, banco } = preparar();
    const { uuidCodigo } = await servicio.generar(usuario.email);
    await servicio.marcarUsado(uuidCodigo);
    expect(banco.estado.codigos[0]!.usadoEn).not.toBeNull();
  });
});
