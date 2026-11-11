/**
 * Emision y validacion de las credenciales de cliente (API Key).
 *
 * El servicio solo persiste el hash SHA-256 de la clave. El valor en texto plano se devuelve
 * una unica vez, durante el registro de la instalacion, y el cliente debe guardarlo en un
 * almacen seguro del dispositivo.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';
import { PERMISOS } from './entities.js';
import type { ApiKey, Permiso, TipoCliente } from './entities.js';
import type { ApiKeyRepository } from './ports.js';
import { generarApiKey, prefijoDeClave, sha256 } from '../shared/crypto.js';
import { AppError } from '../shared/errors.js';

/**
 * Alcances entregados a cada tipo de cliente.
 *
 * Segun los lineamientos, las claves de la app movil y del BFF web pueden invocar las rutas del
 * flujo de inicio de sesion; el resto de clientes no reciben esos alcances.
 */
const PERMISOS_POR_TIPO_CLIENTE: Record<TipoCliente, Permiso[]> = {
  mobile: [
    PERMISOS.authRegister,
    PERMISOS.authLogin,
    PERMISOS.authConfirmEmail,
    PERMISOS.authRefresh,
    PERMISOS.authLogout,
    PERMISOS.authPasswordReset,
    PERMISOS.authMe,
  ],
  'web-bff': [
    PERMISOS.authRegister,
    PERMISOS.authLogin,
    PERMISOS.authConfirmEmail,
    PERMISOS.authRefresh,
    PERMISOS.authLogout,
    PERMISOS.authPasswordReset,
    PERMISOS.authMe,
  ],
  web: [PERMISOS.authMe],
};

/** Resultado del registro de una instalacion: la clave se expone una sola vez. */
export interface CredencialEmitida {
  apiKey: ApiKey;
  clave: string;
}

/** Contrato de gestion de credenciales de cliente. */
export interface ApiKeyService {
  registrarInstalacion(params: {
    nombre: string;
    tipoCliente: TipoCliente;
  }): Promise<CredencialEmitida>;
  autenticar(clave: string): Promise<ApiKey>;
  tienePermiso(apiKey: ApiKey, permiso: Permiso): boolean;
}

/**
 * Crea el servicio de credenciales de cliente.
 */
export const createApiKeyService = (repositorio: ApiKeyRepository): ApiKeyService => ({
  registrarInstalacion: async ({ nombre, tipoCliente }): Promise<CredencialEmitida> => {
    const clave = generarApiKey();
    const apiKey = await repositorio.create({
      uuid: randomUUID(),
      keyHash: sha256(clave),
      nombre,
      tipoCliente,
      permisos: PERMISOS_POR_TIPO_CLIENTE[tipoCliente] ?? [],
    });

    return { apiKey, clave };
  },

  autenticar: async (clave: string): Promise<ApiKey> => {
    const apiKey = await repositorio.findByHash(sha256(clave));

    if (!apiKey) {
      throw new AppError('API_KEY_INVALIDA', 'La API Key no es valida.', 401);
    }

    if (apiKey.revocado) {
      throw new AppError('API_KEY_REVOCADA', 'La API Key fue revocada.', 401);
    }

    return apiKey;
  },

  tienePermiso: (apiKey: ApiKey, permiso: Permiso): boolean => apiKey.permisos.includes(permiso),
});

/**
 * Identifica una credencial en los logs sin exponerla: solo sus primeros ocho caracteres.
 */
export const identificarClave = (clave: string): string => prefijoDeClave(clave);
