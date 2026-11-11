/**
 * Pruebas de emision y validacion de credenciales de cliente.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createApiKeyService } from '../../src/domain/api-key-service.js';
import { PERMISOS } from '../../src/domain/entities.js';
import { sha256 } from '../../src/shared/crypto.js';
import { crearBancoEnMemoria, insertarApiKey } from '../helpers/in-memory.js';

describe('servicio de credenciales de cliente', () => {
  it('registra la instalacion y entrega la clave una sola vez', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);

    const { apiKey, clave } = await servicio.registrarInstalacion({
      nombre: 'App movil del paciente',
      tipoCliente: 'mobile',
    });

    expect(clave.startsWith('fvl_')).toBe(true);
    expect(apiKey.keyHash).toBe(sha256(clave));
    expect(apiKey.keyHash).not.toBe(clave);
    expect(banco.estado.apiKeys).toHaveLength(1);
  });

  it('entrega a la app movil los alcances del flujo de autenticacion', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);

    const { apiKey } = await servicio.registrarInstalacion({
      nombre: 'App movil del paciente',
      tipoCliente: 'mobile',
    });

    expect(apiKey.permisos).toContain(PERMISOS.authLogin);
    expect(apiKey.permisos).toContain(PERMISOS.authRegister);
    expect(apiKey.permisos).toContain(PERMISOS.authRefresh);
  });

  it('no entrega a un cliente web los alcances del flujo de inicio de sesion', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);

    const { apiKey } = await servicio.registrarInstalacion({
      nombre: 'Portal web sin BFF',
      tipoCliente: 'web',
    });

    expect(apiKey.permisos).not.toContain(PERMISOS.authLogin);
    expect(apiKey.permisos).toContain(PERMISOS.authMe);
  });

  it('autentica una credencial valida', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);
    insertarApiKey(banco, 'fvl_clave_valida', [PERMISOS.authLogin]);

    const apiKey = await servicio.autenticar('fvl_clave_valida');

    expect(apiKey.nombre).toBe('Cliente de prueba');
  });

  it('rechaza una credencial desconocida', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);

    await expect(servicio.autenticar('fvl_clave_desconocida')).rejects.toMatchObject({
      codigo: 'API_KEY_INVALIDA',
      status: 401,
    });
  });

  it('rechaza una credencial revocada', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);
    insertarApiKey(banco, 'fvl_clave_revocada', [PERMISOS.authLogin], true);

    await expect(servicio.autenticar('fvl_clave_revocada')).rejects.toMatchObject({
      codigo: 'API_KEY_REVOCADA',
      status: 401,
    });
  });

  it('verifica los alcances de la credencial', async () => {
    const banco = crearBancoEnMemoria();
    const servicio = createApiKeyService(banco.apiKeys);
    insertarApiKey(banco, 'fvl_clave_alcances', [PERMISOS.authLogin, PERMISOS.authMe]);

    const apiKey = await servicio.autenticar('fvl_clave_alcances');

    expect(servicio.tienePermiso(apiKey, PERMISOS.authLogin)).toBe(true);
    expect(servicio.tienePermiso(apiKey, PERMISOS.authMe)).toBe(true);
    expect(servicio.tienePermiso(apiKey, PERMISOS.authLogout)).toBe(false);
  });
});
