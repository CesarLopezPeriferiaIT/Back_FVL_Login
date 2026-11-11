/**
 * Emision y verificacion de los tokens firmados por el servicio.
 *
 * Se usan tres familias de tokens con secretos distintos: token de acceso para las peticiones
 * autenticadas, token de confirmacion de correo y token de reseteo de contrasena. La separacion
 * de secretos garantiza que un token de un tipo no pueda usarse como si fuera de otro.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../shared/errors.js';

/** Proposito funcional de un token, verificado en cada lectura para evitar usos cruzados. */
export type PropositoToken = 'access' | 'email-confirmation' | 'password-reset';

/** Contenido de un token de acceso. */
export interface ClaimsAcceso {
  sub: string;
  email: string;
  sid: string;
}

/** Contenido de un token de confirmacion de correo. */
export interface ClaimsConfirmacion {
  email: string;
}

/** Contenido de un token de reseteo de contrasena. */
export interface ClaimsReseteo {
  email: string;
  pwd: string;
}

/** Contrato de emision y verificacion de tokens. */
export interface TokenService {
  crearTokenAcceso(params: { uuidUsuario: string; email: string; sessionId: string }): string;
  verificarTokenAcceso(token: string): ClaimsAcceso;
  crearTokenConfirmacion(email: string): string;
  verificarTokenConfirmacion(token: string): ClaimsConfirmacion;
  crearTokenReseteo(email: string, huellaPassword: string): string;
  verificarTokenReseteo(token: string): ClaimsReseteo;
}

const ALGORITMO = 'HS256';

const mensajeTokenInvalido = 'El token proporcionado no es valido o ya expiro.';

/**
 * Verifica la firma y la vigencia de un token, y comprueba que su proposito sea el esperado.
 *
 * El estado HTTP distingue el uso de credenciales del uso de enlaces de correo: un token de
 * acceso invalido es un 401 porque el cliente no esta autenticado, mientras que un enlace de
 * confirmacion o de reseteo invalido es un 400 porque el dato recibido en la peticion no es valido.
 */
const verificarToken = (
  token: string,
  secret: string,
  opciones: VerifyOptions,
  proposito: PropositoToken,
  estado: number,
): JwtPayload => {
  let payload: string | JwtPayload;

  try {
    payload = jwt.verify(token, secret, opciones);
  } catch {
    throw new AppError('TOKEN_INVALIDO', mensajeTokenInvalido, estado);
  }

  if (typeof payload === 'string' || payload['purpose'] !== proposito) {
    throw new AppError('TOKEN_INVALIDO', mensajeTokenInvalido, estado);
  }

  return payload;
};

const exigirTexto = (valor: unknown): string => {
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new AppError('TOKEN_INVALIDO', mensajeTokenInvalido, 401);
  }
  return valor;
};

/**
 * Convierte una duracion de la configuracion en el tipo que espera la libreria de firma.
 */
const comoExpiresIn = (duracion: string): NonNullable<SignOptions['expiresIn']> =>
  duracion as NonNullable<SignOptions['expiresIn']>;

/**
 * Crea el servicio de tokens con los secretos y las vidas utiles de la configuracion.
 */
export const createTokenService = (config: AppConfig): TokenService => {
  const opcionesFirma: SignOptions = {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    algorithm: ALGORITMO,
  };

  const opcionesLectura: VerifyOptions = {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    algorithms: [ALGORITMO],
  };

  return {
    crearTokenAcceso: ({ uuidUsuario, email, sessionId }): string =>
      jwt.sign(
        { sub: uuidUsuario, email, sid: sessionId, purpose: 'access' satisfies PropositoToken },
        config.jwt.accessSecret,
        { ...opcionesFirma, expiresIn: comoExpiresIn(config.jwt.accessTtl) },
      ),

    verificarTokenAcceso: (token: string): ClaimsAcceso => {
      const payload = verificarToken(
        token,
        config.jwt.accessSecret,
        opcionesLectura,
        'access',
        401,
      );
      return {
        sub: exigirTexto(payload['sub']),
        email: exigirTexto(payload['email']),
        sid: exigirTexto(payload['sid']),
      };
    },

    crearTokenConfirmacion: (email: string): string =>
      jwt.sign(
        { email, purpose: 'email-confirmation' satisfies PropositoToken },
        config.jwt.confirmSecret,
        { ...opcionesFirma, expiresIn: comoExpiresIn(config.jwt.confirmTtl) },
      ),

    verificarTokenConfirmacion: (token: string): ClaimsConfirmacion => {
      const payload = verificarToken(
        token,
        config.jwt.confirmSecret,
        opcionesLectura,
        'email-confirmation',
        400,
      );
      return { email: exigirTexto(payload['email']) };
    },

    crearTokenReseteo: (email: string, huellaPassword: string): string =>
      jwt.sign(
        { email, pwd: huellaPassword, purpose: 'password-reset' satisfies PropositoToken },
        config.jwt.resetSecret,
        { ...opcionesFirma, expiresIn: comoExpiresIn(config.jwt.resetTtl) },
      ),

    verificarTokenReseteo: (token: string): ClaimsReseteo => {
      const payload = verificarToken(
        token,
        config.jwt.resetSecret,
        opcionesLectura,
        'password-reset',
        400,
      );
      return {
        email: exigirTexto(payload['email']),
        pwd: exigirTexto(payload['pwd']),
      };
    },
  };
};
