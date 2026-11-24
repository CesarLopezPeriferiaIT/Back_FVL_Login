/**
 * Business rules for registration, email confirmation, and login.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import { toUsuarioPublico } from './entities.js';
import type { Usuario, UsuarioPublico } from './entities.js';
import type { LogSessionRepository, UsuarioRepository } from './ports.js';
import type { MailService } from './mail-service.js';
import type { CodigoConfirmacionService } from './codigo-confirmacion-service.js';
import type { PasswordHasher } from './password-hasher.js';
import type { TokenService } from './token-service.js';
import { generarTokenAleatorio, sha256 } from '../shared/crypto.js';
import { duracionEnSegundos } from '../shared/duration.js';
import { normalizarEmail } from '../shared/email.js';
import { AppError, esClaveDuplicada, esLlaveForaneaInvalida } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';

/** Numero de intentos fallidos consecutivos que desactivan la cuenta. */
export const LIMITE_INTENTOS_FALLIDOS = 10;

/** Resultado del registro de una cuenta. */
export interface ResultadoRegistro {
  usuario: UsuarioPublico;
  correoConfirmacionEnviado: boolean;
}

/** Resultado de una sesion iniciada o renovada. */
export interface ResultadoSesion {
  tokenAcceso: string;
  tokenRefresh: string;
  expiresIn: number;
  refreshExpiresAt: Date;
  usuario: UsuarioPublico;
}

/** Datos que la persona entrega al crear su cuenta. */
export interface DatosRegistro {
  email: string;
  tyc: boolean;
  codigoDepartamento: string;
  codigoMunicipio: string;
  codigoRol: number;
}

/** Contrato de la aplicacion para las operaciones de autenticacion. */
export interface AuthService {
  registrar(params: DatosRegistro): Promise<ResultadoRegistro>;
  iniciarSesion(params: { email: string; password: string }): Promise<ResultadoSesion>;
  confirmarCodigo(params: { email: string; codigo: string }): Promise<UsuarioPublico>;
  renovarSesion(tokenRefresh: string): Promise<ResultadoSesion>;
  cerrarSesion(sessionId: string): Promise<void>;
  consultarPerfil(uuidUsuario: string): Promise<UsuarioPublico>;
}

/** Dependencias que requiere el servicio de autenticacion. */
export interface AuthServiceDeps {
  usuarios: UsuarioRepository;
  sesiones: LogSessionRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  correo: MailService;
  codigos: CodigoConfirmacionService;
  config: AppConfig;
  logger: Logger;
}

/**
 * Crea el servicio de autenticacion con las dependencias indicadas.
 */
export const createAuthService = (deps: AuthServiceDeps): AuthService => {
  const { usuarios, sesiones, hasher, tokens, correo, codigos, config, logger } = deps;

  const duracionRefreshMs = config.refresh.ttlDays * 24 * 60 * 60 * 1000;

  const enviarCorreo = async (accion: () => Promise<void>): Promise<boolean> => {
    try {
      await accion();
      return true;
    } catch (error) {
      logger.error('No fue posible enviar el correo', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  // Hash de una contrasena aleatoria: permite igualar el tiempo de respuesta cuando el correo
  // no existe, para no revelar por analisis de tiempos que cuentas estan registradas.
  let hashComparativo: string | null = null;
  const obtenerHashComparativo = async (): Promise<string> => {
    if (hashComparativo === null) {
      hashComparativo = await hasher.hash(generarTokenAleatorio(16));
    }
    return hashComparativo;
  };

  const construirResultadoSesion = (
    usuario: Usuario,
    sessionId: string,
    tokenRefresh: string,
    refreshExpiresAt: Date,
  ): ResultadoSesion => ({
    tokenAcceso: tokens.crearTokenAcceso({
      uuidUsuario: usuario.uuid,
      email: usuario.email,
      sessionId,
    }),
    tokenRefresh,
    expiresIn: duracionEnSegundos(config.jwt.accessTtl),
    refreshExpiresAt,
    usuario: toUsuarioPublico(usuario),
  });

  const crearSesion = async (usuario: Usuario): Promise<ResultadoSesion> => {
    const tokenRefresh = generarTokenAleatorio();
    const refreshExpiresAt = new Date(Date.now() + duracionRefreshMs);
    const sesion = await sesiones.registrarSesion(
      usuario.uuid,
      sha256(tokenRefresh),
      refreshExpiresAt,
    );

    return construirResultadoSesion(usuario, sesion.uuid, tokenRefresh, refreshExpiresAt);
  };

  return {
    registrar: async ({
      email,
      tyc,
      codigoDepartamento,
      codigoMunicipio,
      codigoRol,
    }): Promise<ResultadoRegistro> => {
      const correoNormalizado = normalizarEmail(email);
      const existente = await usuarios.findByEmail(correoNormalizado);

      if (existente) {
        throw new AppError('USUARIO_YA_EXISTE', 'El correo ya se encuentra registrado.', 409);
      }

      let usuario: Usuario;
      try {
        usuario = await usuarios.create({
          uuid: randomUUID(),
          email: correoNormalizado,
          estado: 'C',
          tyc,
          codigoDepartamento,
          codigoMunicipio,
          codigoRol,
        });
      } catch (error) {
        if (esClaveDuplicada(error)) {
          throw new AppError('USUARIO_YA_EXISTE', 'El correo ya se encuentra registrado.', 409);
        }
        if (esLlaveForaneaInvalida(error)) {
          throw new AppError(
            'CATALOGO_INVALIDO',
            'El departamento, el municipio o el rol no existe en el catalogo.',
            400,
          );
        }
        throw error;
      }

      // Sin aceptacion de terminos no se envia el correo de confirmacion: la cuenta queda en estado
      // por confirmar y no avanza, para no dejar registros a medio completar.
      if (!tyc) {
        logger.warn(
          'Cuenta creada sin aceptacion de terminos, no se envio correo de confirmacion',
          {
            uuidUsuario: usuario.uuid,
          },
        );
        return { usuario: toUsuarioPublico(usuario), correoConfirmacionEnviado: false };
      }

      const { codigo, expiraEn } = await codigos.generar(correoNormalizado);
      const enviado = await enviarCorreo(() =>
        correo.enviarCodigoConfirmacion(correoNormalizado, codigo, expiraEn),
      );

      return { usuario: toUsuarioPublico(usuario), correoConfirmacionEnviado: enviado };
    },

    iniciarSesion: async ({ email, password }): Promise<ResultadoSesion> => {
      const correoNormalizado = normalizarEmail(email);
      const usuario = await usuarios.findByEmail(correoNormalizado);

      if (!usuario) {
        await hasher.verify(await obtenerHashComparativo(), password);
        throw new AppError('CREDENCIALES_INVALIDAS', 'Correo o contrasena incorrectos.', 401);
      }

      if (usuario.estado === 'D') {
        throw new AppError(
          'CUENTA_DESACTIVADA',
          'La cuenta fue desactivada por intentos fallidos de inicio de sesion.',
          403,
        );
      }

      if (usuario.estado === 'C') {
        throw new AppError(
          'CUENTA_POR_CONFIRMAR',
          'La cuenta aun no ha sido confirmada con el correo electronico.',
          403,
        );
      }

      if (usuario.estado === 'I') {
        throw new AppError('CUENTA_INACTIVA', 'La cuenta se encuentra inactiva.', 403);
      }

      const coincide = await hasher.verify(usuario.passHash, password);

      if (!coincide) {
        await sesiones.registrarIntentoFallido(usuario.uuid);
        const fallidos = await sesiones.contarIntentosFallidosDesdeUltimoExito(usuario.uuid);

        if (fallidos >= LIMITE_INTENTOS_FALLIDOS) {
          await usuarios.updateEstado(usuario.uuid, 'D');
          logger.warn('Cuenta desactivada por superar el limite de intentos fallidos', {
            uuidUsuario: usuario.uuid,
            intentosFallidos: fallidos,
          });
          throw new AppError(
            'CUENTA_DESACTIVADA',
            'La cuenta fue desactivada por intentos fallidos de inicio de sesion.',
            403,
          );
        }

        throw new AppError('CREDENCIALES_INVALIDAS', 'Correo o contrasena incorrectos.', 401);
      }

      return crearSesion(usuario);
    },

    confirmarCodigo: async ({
      email,
      codigo,
    }: {
      email: string;
      codigo: string;
    }): Promise<UsuarioPublico> => {
      const { usuario, uuidCodigo } = await codigos.validar(email, codigo);

      const activado = await usuarios.activarConCodigoVigente(usuario.uuid, uuidCodigo);
      if (!activado) {
        throw await codigos.clasificarFallo(email);
      }
      await codigos.marcarUsado(uuidCodigo);

      return toUsuarioPublico({ ...usuario, estado: 'A' });
    },

    renovarSesion: async (tokenRefresh: string): Promise<ResultadoSesion> => {
      const sesion = await sesiones.buscarSesionPorHash(sha256(tokenRefresh));
      const ahora = new Date();

      if (
        !sesion ||
        sesion.revokedAt !== null ||
        sesion.refreshExpiresAt === null ||
        sesion.refreshExpiresAt <= ahora
      ) {
        throw new AppError('SESION_INVALIDA', 'La sesion no es valida o ha expirado.', 401);
      }

      const usuario = await usuarios.findByUuid(sesion.uuidUsuario);

      if (!usuario) {
        throw new AppError('USUARIO_NO_ENCONTRADO', 'La cuenta no existe.', 404);
      }

      if (usuario.estado !== 'A') {
        await sesiones.revocarSesion(sesion.uuid);
        throw new AppError('CUENTA_NO_ACTIVA', 'La cuenta no se encuentra activa.', 403);
      }

      const nuevoTokenRefresh = generarTokenAleatorio();
      const refreshExpiresAt = new Date(Date.now() + duracionRefreshMs);

      await sesiones.rotarRefresh(sesion.uuid, sha256(nuevoTokenRefresh), refreshExpiresAt);

      return construirResultadoSesion(usuario, sesion.uuid, nuevoTokenRefresh, refreshExpiresAt);
    },

    cerrarSesion: async (sessionId: string): Promise<void> => {
      await sesiones.revocarSesion(sessionId);
    },

    consultarPerfil: async (uuidUsuario: string): Promise<UsuarioPublico> => {
      const usuario = await usuarios.findByUuid(uuidUsuario);

      if (!usuario) {
        throw new AppError('USUARIO_NO_ENCONTRADO', 'La cuenta no existe.', 404);
      }

      return toUsuarioPublico(usuario);
    },
  };
};
