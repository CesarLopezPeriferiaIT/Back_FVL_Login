/**
 * Reglas de negocio del registro, la confirmacion de correo y el inicio de sesion.
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
import type { PasswordHasher } from './password-hasher.js';
import type { TokenService } from './token-service.js';
import { generarTokenAleatorio, sha256 } from '../shared/crypto.js';
import { duracionEnSegundos } from '../shared/duration.js';
import { normalizarEmail } from '../shared/email.js';
import { AppError, esClaveDuplicada } from '../shared/errors.js';
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

/** Contrato de la aplicacion para las operaciones de autenticacion. */
export interface AuthService {
  registrar(params: { email: string; password: string; tyc: boolean }): Promise<ResultadoRegistro>;
  iniciarSesion(params: { email: string; password: string }): Promise<ResultadoSesion>;
  confirmarCorreo(token: string): Promise<UsuarioPublico>;
  renovarSesion(tokenRefresh: string): Promise<ResultadoSesion>;
  cerrarSesion(sessionId: string): Promise<void>;
  solicitarReseteo(email: string): Promise<void>;
  verificarEnlaceReseteo(token: string): Promise<{ email: string }>;
  resetearContrasena(params: { token: string; nuevaPassword: string }): Promise<void>;
  cambiarContrasena(params: {
    uuidUsuario: string;
    sessionId: string;
    passwordActual: string;
    nuevaPassword: string;
  }): Promise<void>;
  consultarPerfil(uuidUsuario: string): Promise<UsuarioPublico>;
}

/** Dependencias que requiere el servicio de autenticacion. */
export interface AuthServiceDeps {
  usuarios: UsuarioRepository;
  sesiones: LogSessionRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  correo: MailService;
  config: AppConfig;
  logger: Logger;
}

/**
 * Huella de la contrasena vigente que se incluye en el token de reseteo.
 *
 * Permite invalidar el token cuando la contrasena ya cambio, sin necesidad de una tabla adicional
 * que guarde el historial de tokens consumidos.
 */
const huellaDePassword = (passHash: string): string => sha256(passHash).slice(0, 32);

/**
 * Crea el servicio de autenticacion con las dependencias indicadas.
 */
export const createAuthService = (deps: AuthServiceDeps): AuthService => {
  const { usuarios, sesiones, hasher, tokens, correo, config, logger } = deps;

  const duracionRefreshMs = config.refresh.ttlDays * 24 * 60 * 60 * 1000;

  const construirEnlace = (ruta: string, token: string): string =>
    `${config.publicBaseUrl}/backend/${config.ambiente}/v${config.apiVersion}/${ruta}?token=${encodeURIComponent(token)}`;

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

  /**
   * Resuelve el enlace de reseteo y devuelve la cuenta asociada.
   *
   * La huella de la contrasena vigente viaja dentro del token, de modo que un enlace ya utilizado
   * deja de coincidir en cuanto la contrasena cambia. Asi el enlace es de un solo uso sin
   * necesidad de una tabla adicional que guarde el historial de tokens consumidos.
   */
  const resolverEnlaceReseteo = async (token: string): Promise<Usuario> => {
    const claims = tokens.verificarTokenReseteo(token);
    const usuario = await usuarios.findByEmail(normalizarEmail(claims.email));

    if (!usuario || huellaDePassword(usuario.passHash) !== claims.pwd) {
      throw new AppError('TOKEN_INVALIDO', 'El enlace no es valido o ya fue utilizado.', 400);
    }

    return usuario;
  };

  return {
    registrar: async ({ email, password, tyc }): Promise<ResultadoRegistro> => {
      const correoNormalizado = normalizarEmail(email);
      const existente = await usuarios.findByEmail(correoNormalizado);

      if (existente) {
        throw new AppError('USUARIO_YA_EXISTE', 'El correo ya se encuentra registrado.', 409);
      }

      const passHash = await hasher.hash(password);

      let usuario: Usuario;
      try {
        usuario = await usuarios.create({
          uuid: randomUUID(),
          email: correoNormalizado,
          passHash,
          estado: 'C',
          tyc,
        });
      } catch (error) {
        if (esClaveDuplicada(error)) {
          throw new AppError('USUARIO_YA_EXISTE', 'El correo ya se encuentra registrado.', 409);
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

      const token = tokens.crearTokenConfirmacion(correoNormalizado);
      const enlace = construirEnlace('auth/confirm-email', token);
      const enviado = await enviarCorreo(() =>
        correo.enviarConfirmacion(correoNormalizado, enlace),
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

    confirmarCorreo: async (token: string): Promise<UsuarioPublico> => {
      const claims = tokens.verificarTokenConfirmacion(token);
      const usuario = await usuarios.findByEmail(normalizarEmail(claims.email));

      if (!usuario) {
        throw new AppError(
          'USUARIO_NO_ENCONTRADO',
          'No existe una cuenta asociada al enlace.',
          404,
        );
      }

      if (usuario.estado !== 'C') {
        throw new AppError('CUENTA_YA_CONFIRMADA', 'La cuenta ya fue confirmada.', 409);
      }

      await usuarios.updateEstado(usuario.uuid, 'A');
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

    solicitarReseteo: async (email: string): Promise<void> => {
      const correoNormalizado = normalizarEmail(email);
      const usuario = await usuarios.findByEmail(correoNormalizado);

      // La operacion termina igual exista o no la cuenta, para no revelar que correos estan
      // registrados. Las cuentas desactivadas o inactivas no reciben el enlace.
      if (!usuario || usuario.estado === 'D' || usuario.estado === 'I') {
        return;
      }

      const token = tokens.crearTokenReseteo(correoNormalizado, huellaDePassword(usuario.passHash));
      const enlace = construirEnlace('auth/reset-password', token);

      await enviarCorreo(() => correo.enviarReseteo(correoNormalizado, enlace));
    },

    verificarEnlaceReseteo: async (token: string): Promise<{ email: string }> => {
      const usuario = await resolverEnlaceReseteo(token);
      return { email: usuario.email };
    },

    resetearContrasena: async ({ token, nuevaPassword }): Promise<void> => {
      const usuario = await resolverEnlaceReseteo(token);
      const passHash = await hasher.hash(nuevaPassword);
      await usuarios.updatePassword(usuario.uuid, passHash);
      await sesiones.revocarSesionesDeUsuario(usuario.uuid);
    },

    cambiarContrasena: async ({
      uuidUsuario,
      sessionId,
      passwordActual,
      nuevaPassword,
    }): Promise<void> => {
      const usuario = await usuarios.findByUuid(uuidUsuario);

      if (!usuario) {
        throw new AppError('USUARIO_NO_ENCONTRADO', 'La cuenta no existe.', 404);
      }

      const coincide = await hasher.verify(usuario.passHash, passwordActual);

      if (!coincide) {
        // El usuario ya esta autenticado con su token de acceso: la contrasena actual es un dato
        // del formulario y su error es de validacion, no de autenticacion.
        throw new AppError('PASSWORD_ACTUAL_INVALIDA', 'La contrasena actual no es correcta.', 400);
      }

      const passHash = await hasher.hash(nuevaPassword);
      await usuarios.updatePassword(usuario.uuid, passHash);
      await sesiones.revocarSesionesDeUsuario(uuidUsuario, sessionId);
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
