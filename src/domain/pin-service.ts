/**
 * Reglas de negocio del pin de acceso de una cuenta.
 *
 * El pin lo escribe la persona en la aplicacion y se compara en el dispositivo, de modo que nunca
 * viaja al servidor en cada apertura. Aqui se guarda un verificador argon2id que permite
 * reconfigurarlo, revocarlo desde otro dispositivo y usarlo como segunda confirmacion en
 * operaciones sensibles.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';
import type { PinAcceso } from './entities.js';
import type { PinRepository } from './ports.js';
import type { PasswordHasher } from './password-hasher.js';
import { AppError } from '../shared/errors.js';

/**
 * Intentos fallidos que revocan el pin.
 *
 * El pin se revoca y no se desactiva la cuenta: el bloqueo de la cuenta protege el acceso con
 * contrasena, mientras que el pin solo protege el dispositivo.
 */
export const LIMITE_INTENTOS_PIN = 5;

/** Contrato de la aplicacion para el pin de acceso. */
export interface PinService {
  configurar(params: { uuidUsuario: string; pin: string; dispositivo: string }): Promise<PinAcceso>;
  verificar(params: { uuidUsuario: string; pin: string }): Promise<void>;
  revocar(params: { uuidUsuario: string }): Promise<void>;
  estaConfigurado(uuidUsuario: string): Promise<boolean>;
}

/** Dependencias que requiere el servicio de pines. */
export interface PinServiceDeps {
  pines: PinRepository;
  hasher: PasswordHasher;
}

/**
 * Crea el servicio de pines de acceso.
 */
export const createPinService = (deps: PinServiceDeps): PinService => {
  const { pines, hasher } = deps;

  return {
    configurar: async ({
      uuidUsuario,
      pin,
      dispositivo,
    }: {
      uuidUsuario: string;
      pin: string;
      dispositivo: string;
    }): Promise<PinAcceso> => {
      // El pin anterior se revoca en lugar de borrarse, para conservar el historial de cambios.
      await pines.revocarActivos(uuidUsuario);

      return pines.crear({
        uuid: randomUUID(),
        uuidUsuario,
        dispositivo,
        hash: await hasher.hash(pin),
      });
    },

    verificar: async ({
      uuidUsuario,
      pin,
    }: {
      uuidUsuario: string;
      pin: string;
    }): Promise<void> => {
      const activo = await pines.buscarActivo(uuidUsuario);

      if (!activo) {
        throw new AppError('PIN_NO_CONFIGURADO', 'No hay un pin de acceso configurado.', 404);
      }

      const coincide = await hasher.verify(activo.hash, pin);

      if (coincide) {
        await pines.registrarUso(activo.uuid);
        return;
      }

      // El contador se lee antes de incrementarlo: con un repositorio que devuelve objetos vivos,
      // leerlo despues contaria un intento de mas y revocaria el pin antes de tiempo.
      const intentosPrevios = activo.intentosFallidos;
      await pines.registrarIntentoFallido(activo.uuid);

      if (intentosPrevios + 1 >= LIMITE_INTENTOS_PIN) {
        await pines.revocarActivos(uuidUsuario);
        throw new AppError(
          'PIN_REVOCADO',
          'El pin de acceso fue revocado por intentos fallidos.',
          403,
        );
      }

      throw new AppError('PIN_INVALIDO', 'El pin de acceso no es correcto.', 401);
    },

    revocar: async ({ uuidUsuario }: { uuidUsuario: string }): Promise<void> => {
      await pines.revocarActivos(uuidUsuario);
    },

    estaConfigurado: async (uuidUsuario: string): Promise<boolean> =>
      (await pines.buscarActivo(uuidUsuario)) !== null,
  };
};
