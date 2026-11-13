/**
 * Dobles en memoria de los puertos del dominio para las pruebas automatizadas.
 *
 * Reproducen la semántica de las consultas SQL, en particular el conteo de intentos fallidos
 * posteriores al último acceso exitoso.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';
import type {
  ApiKey,
  EstadoUsuario,
  LogSession,
  PinAcceso,
  Usuario,
} from '../../src/domain/entities.js';
import type {
  ApiKeyRepository,
  NuevoPin,
  PinRepository,
  LogSessionRepository,
  MailSender,
  MensajeCorreo,
  NuevaApiKey,
  UsuarioRepository,
} from '../../src/domain/ports.js';
import { sha256 } from '../../src/shared/crypto.js';

/** Estado observable del banco en memoria. */
export interface EstadoBanco {
  usuarios: Usuario[];
  sesiones: LogSession[];
  apiKeys: ApiKey[];
  pines: PinAcceso[];
  correos: MensajeCorreo[];
}

/** Conjunto de dobles que representa la persistencia durante una prueba. */
export interface BancoEnMemoria {
  usuarios: UsuarioRepository;
  sesiones: LogSessionRepository;
  apiKeys: ApiKeyRepository;
  pines: PinRepository;
  correo: MailSender;
  estado: EstadoBanco;
}

/**
 * Crea un banco en memoria con los repositorios vacios.
 */
export const crearBancoEnMemoria = (): BancoEnMemoria => {
  const estado: EstadoBanco = { usuarios: [], sesiones: [], apiKeys: [], pines: [], correos: [] };

  const usuarios: UsuarioRepository = {
    findByEmail: async (email: string) =>
      estado.usuarios.find((usuario) => usuario.email === email) ?? null,

    findByUuid: async (uuid: string) =>
      estado.usuarios.find((usuario) => usuario.uuid === uuid) ?? null,

    create: async (nuevoUsuario) => {
      const usuario: Usuario = {
        uuid: nuevoUsuario.uuid,
        email: nuevoUsuario.email,
        passHash: nuevoUsuario.passHash,
        estado: nuevoUsuario.estado,
        fechaCreacion: new Date(),
        fechaModificacion: new Date(),
        tyc: nuevoUsuario.tyc,
      };
      estado.usuarios.push(usuario);
      return usuario;
    },

    updateEstado: async (uuid: string, nuevoEstado: EstadoUsuario) => {
      const usuario = estado.usuarios.find((item) => item.uuid === uuid);
      if (usuario) {
        usuario.estado = nuevoEstado;
        usuario.fechaModificacion = new Date();
      }
    },

    updatePassword: async (uuid: string, passHash: string) => {
      const usuario = estado.usuarios.find((item) => item.uuid === uuid);
      if (usuario) {
        usuario.passHash = passHash;
        usuario.fechaModificacion = new Date();
      }
    },
  };

  const sesiones: LogSessionRepository = {
    registrarIntentoFallido: async (uuidUsuario: string) => {
      estado.sesiones.push({
        uuid: randomUUID(),
        uuidUsuario,
        successful: false,
        timestampIntento: new Date(),
        refreshTokenHash: null,
        refreshExpiresAt: null,
        revokedAt: null,
        rotadoEn: null,
      });
    },

    registrarSesion: async (uuidUsuario, refreshTokenHash, refreshExpiresAt) => {
      const sesion: LogSession = {
        uuid: randomUUID(),
        uuidUsuario,
        successful: true,
        timestampIntento: new Date(),
        refreshTokenHash,
        refreshExpiresAt,
        revokedAt: null,
        rotadoEn: null,
      };
      estado.sesiones.push(sesion);
      return sesion;
    },

    rotarRefresh: async (uuid, refreshTokenHash, refreshExpiresAt) => {
      const sesion = estado.sesiones.find((item) => item.uuid === uuid);
      if (sesion && sesion.revokedAt === null) {
        sesion.refreshTokenHash = refreshTokenHash;
        sesion.refreshExpiresAt = refreshExpiresAt;
        sesion.rotadoEn = new Date();
      }
    },

    revocarSesion: async (uuid: string) => {
      const sesion = estado.sesiones.find((item) => item.uuid === uuid);
      if (sesion && sesion.revokedAt === null) {
        sesion.revokedAt = new Date();
      }
    },

    revocarSesionesDeUsuario: async (uuidUsuario, exceptoSessionUuid) => {
      estado.sesiones.forEach((sesion) => {
        const esDeOtroUsuario = sesion.uuidUsuario !== uuidUsuario;
        const esLaSesionExcluida =
          exceptoSessionUuid !== undefined && sesion.uuid === exceptoSessionUuid;
        const estaRevocada = sesion.revokedAt !== null;
        const tieneRefresh = sesion.refreshTokenHash !== null;
        if (!esDeOtroUsuario && !esLaSesionExcluida && !estaRevocada && tieneRefresh) {
          sesion.revokedAt = new Date();
        }
      });
    },

    contarIntentosFallidosDesdeUltimoExito: async (uuidUsuario: string) => {
      const propias = estado.sesiones.filter((sesion) => sesion.uuidUsuario === uuidUsuario);
      // El conteo sigue el orden de insercion, igual que el orden temporal de la consulta SQL,
      // para que la prueba no dependa de la resolucion del reloj.
      const ultimoIndiceExito = propias.reduce(
        (ultimo, sesion, indice) => (sesion.successful ? indice : ultimo),
        -1,
      );
      return propias.slice(ultimoIndiceExito + 1).filter((sesion) => !sesion.successful).length;
    },

    buscarSesionPorHash: async (refreshTokenHash) =>
      estado.sesiones.find((sesion) => sesion.refreshTokenHash === refreshTokenHash) ?? null,
  };

  const apiKeys: ApiKeyRepository = {
    findByHash: async (keyHash) =>
      estado.apiKeys.find((clave) => clave.keyHash === keyHash) ?? null,

    create: async (nuevaApiKey: NuevaApiKey) => {
      const apiKey: ApiKey = {
        uuid: nuevaApiKey.uuid,
        keyHash: nuevaApiKey.keyHash,
        nombre: nuevaApiKey.nombre,
        tipoCliente: nuevaApiKey.tipoCliente,
        permisos: nuevaApiKey.permisos,
        revocado: false,
        fechaCreacion: new Date(),
        fechaModificacion: new Date(),
        ultimoUso: null,
      };
      estado.apiKeys.push(apiKey);
      return apiKey;
    },

    registrarUso: async (uuid: string) => {
      const apiKey = estado.apiKeys.find((clave) => clave.uuid === uuid);
      if (apiKey) {
        apiKey.ultimoUso = new Date();
      }
    },
  };

  const correo: MailSender = {
    enviar: async (mensaje: MensajeCorreo) => {
      estado.correos.push(mensaje);
    },
  };

  const pines: PinRepository = {
    buscarActivo: async (uuidUsuario) =>
      estado.pines.find((pin) => pin.uuidUsuario === uuidUsuario && !pin.revocado) ?? null,
    crear: async (pin: NuevoPin) => {
      const nuevo: PinAcceso = {
        uuid: pin.uuid,
        uuidUsuario: pin.uuidUsuario,
        dispositivo: pin.dispositivo,
        hash: pin.hash,
        intentosFallidos: 0,
        revocado: false,
        fechaCreacion: new Date(),
        fechaModificacion: new Date(),
        ultimoUso: null,
      };
      estado.pines.push(nuevo);
      return nuevo;
    },
    registrarIntentoFallido: async (uuid) => {
      const pin = estado.pines.find((item) => item.uuid === uuid);
      if (pin) {
        pin.intentosFallidos += 1;
        pin.fechaModificacion = new Date();
      }
    },
    registrarUso: async (uuid) => {
      const pin = estado.pines.find((item) => item.uuid === uuid);
      if (pin) {
        pin.intentosFallidos = 0;
        pin.ultimoUso = new Date();
        pin.fechaModificacion = new Date();
      }
    },
    revocarActivos: async (uuidUsuario) => {
      estado.pines
        .filter((pin) => pin.uuidUsuario === uuidUsuario && !pin.revocado)
        .forEach((pin) => {
          pin.revocado = true;
          pin.fechaModificacion = new Date();
        });
    },
  };

  return { usuarios, sesiones, apiKeys, pines, correo, estado };
};

/**
 * Inserta una cuenta de usuario directamente en el banco en memoria.
 */
export const insertarUsuario = (
  banco: BancoEnMemoria,
  usuario: Partial<Usuario> & { email: string; passHash: string },
): Usuario => {
  const completo: Usuario = {
    uuid: usuario.uuid ?? randomUUID(),
    email: usuario.email,
    passHash: usuario.passHash,
    estado: usuario.estado ?? 'A',
    fechaCreacion: usuario.fechaCreacion ?? new Date(),
    fechaModificacion: usuario.fechaModificacion ?? new Date(),
    tyc: usuario.tyc ?? true,
  };
  banco.estado.usuarios.push(completo);
  return completo;
};

/**
 * Inserta una credencial de cliente directamente en el banco en memoria.
 */
export const insertarApiKey = (
  banco: BancoEnMemoria,
  clave: string,
  permisos: ApiKey['permisos'],
  revocado = false,
): ApiKey => {
  const apiKey: ApiKey = {
    uuid: randomUUID(),
    keyHash: sha256(clave),
    nombre: 'Cliente de prueba',
    tipoCliente: 'mobile',
    permisos,
    revocado,
    fechaCreacion: new Date(),
    fechaModificacion: new Date(),
    ultimoUso: null,
  };
  banco.estado.apiKeys.push(apiKey);
  return apiKey;
};
