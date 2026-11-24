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
import type { AppConfig } from '../../src/config/env.js';
import { createCodigoLoginService } from '../../src/domain/codigo-login-service.js';
import type { CodigoLoginService } from '../../src/domain/codigo-login-service.js';
import type { PasswordHasher } from '../../src/domain/password-hasher.js';
import type { Logger } from '../../src/shared/logger.js';
import type {
  ApiKey,
  CodigoConfirmacion,
  CodigoAcceso,
  EstadoUsuario,
  LogSession,
  Usuario,
} from '../../src/domain/entities.js';
import type {
  ApiKeyRepository,
  CatalogoRepository,
  CodigoConfirmacionRepository,
  CodigoLoginRepository,
  LogSessionRepository,
  MailSender,
  MensajeCorreo,
  NuevaApiKey,
  UsuarioRepository,
} from '../../src/domain/ports.js';
import { sha256 } from '../../src/shared/crypto.js';

/** Estado observable del banco en memoria. */
export interface EstadoBanco {
  codigos: CodigoConfirmacion[];
  codigosLogin: CodigoAcceso[];
  usuarios: Usuario[];
  sesiones: LogSession[];
  apiKeys: ApiKey[];
  correos: MensajeCorreo[];
}

/** Conjunto de dobles que representa la persistencia durante una prueba. */
export interface BancoEnMemoria {
  codigos: CodigoConfirmacionRepository;
  codigosLogin: CodigoLoginRepository;
  usuarios: UsuarioRepository;
  sesiones: LogSessionRepository;
  apiKeys: ApiKeyRepository;
  correo: MailSender;
  catalogos: CatalogoRepository;
  estado: EstadoBanco;
}

/** Crea el servicio de codigos de acceso para las pruebas. */
export const crearServicioCodigoAccesoDePrueba = (params: {
  banco: BancoEnMemoria;
  hasher: PasswordHasher;
  config: AppConfig;
  logger: Logger;
}): CodigoLoginService =>
  createCodigoLoginService({
    codigos: params.banco.codigosLogin,
    usuarios: params.banco.usuarios,
    hasher: params.hasher,
    config: params.config,
    logger: params.logger,
  });

/**
 * Crea un banco en memoria con los repositorios vacios.
 */
export const crearBancoEnMemoria = (): BancoEnMemoria => {
  const estado: EstadoBanco = {
    codigos: [],
    codigosLogin: [],
    usuarios: [],
    sesiones: [],
    apiKeys: [],
    correos: [],
  };

  const codigos: CodigoConfirmacionRepository = {
    guardar: async (codigo) => {
      estado.codigos.push(codigo);
    },
    buscarNoConsumidoPorUsuario: async (uuid) =>
      [...estado.codigos]
        .reverse()
        .find((c) => c.uuidUsuario === uuid && c.usadoEn === null && !c.invalidado) ?? null,
    buscarUltimoPorUsuario: async (uuid) =>
      [...estado.codigos].reverse().find((c) => c.uuidUsuario === uuid) ?? null,
    registrarIntentoFallido: async (uuid, maxIntentos) => {
      const codigo = estado.codigos.find((c) => c.uuid === uuid);
      if (!codigo || codigo.usadoEn !== null || codigo.invalidado || codigo.expiraEn <= new Date())
        return null;
      codigo.intentos++;
      if (codigo.intentos >= maxIntentos) codigo.invalidado = true;
      return { intentos: codigo.intentos, invalidado: codigo.invalidado };
    },
    marcarUsado: async (uuid) => {
      const codigo = estado.codigos.find((c) => c.uuid === uuid);
      if (codigo) codigo.usadoEn = new Date();
    },
    invalidar: async (uuid) => {
      const codigo = estado.codigos.find((c) => c.uuid === uuid);
      if (codigo) codigo.invalidado = true;
    },
  };

  const codigosLogin: CodigoLoginRepository = {
    guardar: async (codigo) => {
      estado.codigosLogin.push(codigo);
    },
    buscarNoConsumidoPorUsuario: async (uuid) =>
      [...estado.codigosLogin]
        .reverse()
        .find((c) => c.uuidUsuario === uuid && c.usadoEn === null && !c.invalidado) ?? null,
    buscarUltimoPorUsuario: async (uuid) =>
      [...estado.codigosLogin].reverse().find((c) => c.uuidUsuario === uuid) ?? null,
    registrarIntentoFallido: async (uuid, maxIntentos) => {
      const codigo = estado.codigosLogin.find((c) => c.uuid === uuid);
      if (!codigo || codigo.usadoEn !== null || codigo.invalidado || codigo.expiraEn <= new Date())
        return null;
      codigo.intentos++;
      if (codigo.intentos >= maxIntentos) codigo.invalidado = true;
      return { intentos: codigo.intentos, invalidado: codigo.invalidado };
    },
    marcarUsado: async (uuid) => {
      const codigo = estado.codigosLogin.find((c) => c.uuid === uuid);
      if (!codigo || codigo.usadoEn !== null || codigo.invalidado || codigo.expiraEn <= new Date())
        return false;
      codigo.usadoEn = new Date();
      return true;
    },
    invalidar: async (uuid) => {
      const codigo = estado.codigosLogin.find((c) => c.uuid === uuid);
      if (codigo) codigo.invalidado = true;
    },
  };

  const usuarios: UsuarioRepository = {
    findByEmail: async (email: string) =>
      estado.usuarios.find((usuario) => usuario.email === email) ?? null,

    findByUuid: async (uuid: string) =>
      estado.usuarios.find((usuario) => usuario.uuid === uuid) ?? null,

    create: async (nuevoUsuario) => {
      const usuario: Usuario = {
        uuid: nuevoUsuario.uuid,
        email: nuevoUsuario.email,
        passHash: '',
        estado: nuevoUsuario.estado,
        fechaCreacion: new Date(),
        fechaModificacion: new Date(),
        tyc: nuevoUsuario.tyc,
      };
      estado.usuarios.push(usuario);
      return usuario;
    },

    activarConCodigoVigente: async (uuidUsuario, uuidCodigo) => {
      const usuario = estado.usuarios.find((item) => item.uuid === uuidUsuario);
      const codigo = estado.codigos.find((item) => item.uuid === uuidCodigo);
      const ahora = new Date();
      if (
        !usuario ||
        usuario.estado !== 'C' ||
        !codigo ||
        codigo.uuidUsuario !== uuidUsuario ||
        codigo.usadoEn !== null ||
        codigo.invalidado ||
        codigo.expiraEn <= ahora
      )
        return false;
      usuario.estado = 'A';
      usuario.fechaModificacion = ahora;
      return true;
    },

    updateEstado: async (uuid: string, nuevoEstado: EstadoUsuario) => {
      const usuario = estado.usuarios.find((item) => item.uuid === uuid);
      if (usuario) {
        usuario.estado = nuevoEstado;
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

  const catalogos: CatalogoRepository = {
    listarRoles: async () => [
      { codigo: 1, nombre: 'Medico General', areaServicio: 'Urgencias' },
      { codigo: 2, nombre: 'Enfermero', areaServicio: 'Consulta Externa' },
    ],
    listarDepartamentos: async () => [
      { codigo: '05', nombre: 'ANTIOQUIA' },
      { codigo: '76', nombre: 'VALLE DEL CAUCA' },
    ],
    listarMunicipios: async (codigoDepartamento) =>
      [
        { codigo: '05001', nombre: 'MEDELLIN', codigoDepartamento: '05' },
        { codigo: '76001', nombre: 'CALI', codigoDepartamento: '76' },
        { codigo: '76109', nombre: 'BUENAVENTURA', codigoDepartamento: '76' },
      ].filter(
        (municipio) =>
          codigoDepartamento === undefined || municipio.codigoDepartamento === codigoDepartamento,
      ),
  };

  return { codigos, codigosLogin, usuarios, sesiones, apiKeys, correo, catalogos, estado };
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
