/**
 * Verify the business rules of the access PIN.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';
import { createPinService, LIMITE_INTENTOS_PIN } from '../../src/domain/pin-service.js';
import { crearBancoEnMemoria } from '../helpers/in-memory.js';

const PIN = '482915';

interface ServicioDePrueba {
  banco: ReturnType<typeof crearBancoEnMemoria>;
  servicio: ReturnType<typeof createPinService>;
}

const crearServicio = (): ServicioDePrueba => {
  const banco = crearBancoEnMemoria();
  const servicio = createPinService({
    pines: banco.pines,
    hasher: createPasswordHasher(),
  });
  return { banco, servicio };
};

describe('servicio de pin de acceso', () => {
  it('configura el pin y lo deja activo', async () => {
    const { banco, servicio } = crearServicio();

    const pin = await servicio.configurar({
      uuidUsuario: 'uuid-usuario',
      pin: PIN,
      dispositivo: 'equipo-1',
    });

    expect(pin.revocado).toBe(false);
    expect(pin.intentosFallidos).toBe(0);
    expect(pin.hash).not.toBe(PIN);
    expect(banco.estado.pines).toHaveLength(1);
    await expect(servicio.estaConfigurado('uuid-usuario')).resolves.toBe(true);
  });

  it('revoca el pin anterior cuando se configura uno nuevo', async () => {
    const { banco, servicio } = crearServicio();
    await servicio.configurar({ uuidUsuario: 'uuid-usuario', pin: PIN, dispositivo: 'equipo-1' });

    await servicio.configurar({
      uuidUsuario: 'uuid-usuario',
      pin: '123456',
      dispositivo: 'equipo-2',
    });

    const activos = banco.estado.pines.filter((pin) => !pin.revocado);
    expect(activos).toHaveLength(1);
    expect(activos[0]?.dispositivo).toBe('equipo-2');
  });

  it('verifica el pin correcto y reinicia el contador de intentos', async () => {
    const { banco, servicio } = crearServicio();
    await servicio.configurar({ uuidUsuario: 'uuid-usuario', pin: PIN, dispositivo: 'equipo-1' });
    const uuid = banco.estado.pines[0]?.uuid ?? '';
    await banco.pines.registrarIntentoFallido(uuid);

    await expect(
      servicio.verificar({ uuidUsuario: 'uuid-usuario', pin: PIN }),
    ).resolves.toBeUndefined();

    expect(banco.estado.pines[0]?.intentosFallidos).toBe(0);
    expect(banco.estado.pines[0]?.ultimoUso).not.toBeNull();
  });

  it('rechaza el pin incorrecto sin revocar todavia', async () => {
    const { banco, servicio } = crearServicio();
    await servicio.configurar({ uuidUsuario: 'uuid-usuario', pin: PIN, dispositivo: 'equipo-1' });

    await expect(
      servicio.verificar({ uuidUsuario: 'uuid-usuario', pin: '000000' }),
    ).rejects.toMatchObject({ codigo: 'PIN_INVALIDO', status: 401 });

    expect(banco.estado.pines[0]?.intentosFallidos).toBe(1);
    expect(banco.estado.pines[0]?.revocado).toBe(false);
  });

  it('revoca el pin al acumular los intentos permitidos', async () => {
    const { banco, servicio } = crearServicio();
    await servicio.configurar({ uuidUsuario: 'uuid-usuario', pin: PIN, dispositivo: 'equipo-1' });

    for (let intento = 1; intento < LIMITE_INTENTOS_PIN; intento += 1) {
      await expect(
        servicio.verificar({ uuidUsuario: 'uuid-usuario', pin: '000000' }),
      ).rejects.toMatchObject({ codigo: 'PIN_INVALIDO' });
    }

    await expect(
      servicio.verificar({ uuidUsuario: 'uuid-usuario', pin: '000000' }),
    ).rejects.toMatchObject({ codigo: 'PIN_REVOCADO', status: 403 });

    expect(banco.estado.pines[0]?.revocado).toBe(true);
    await expect(servicio.estaConfigurado('uuid-usuario')).resolves.toBe(false);
  });

  it('falla cuando la cuenta no tiene pin configurado', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.verificar({ uuidUsuario: 'uuid-usuario', pin: PIN }),
    ).rejects.toMatchObject({ codigo: 'PIN_NO_CONFIGURADO', status: 404 });
  });

  it('revoca el pin a peticion explicita', async () => {
    const { banco, servicio } = crearServicio();
    await servicio.configurar({ uuidUsuario: 'uuid-usuario', pin: PIN, dispositivo: 'equipo-1' });

    await servicio.revocar({ uuidUsuario: 'uuid-usuario' });

    expect(banco.estado.pines[0]?.revocado).toBe(true);
    await expect(servicio.estaConfigurado('uuid-usuario')).resolves.toBe(false);
  });
});
