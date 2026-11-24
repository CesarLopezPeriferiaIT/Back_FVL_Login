/**
 * Issue and verify access tokens for authenticated requests.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../shared/errors.js';

/** Proposito funcional de un token, verificado en cada lectura para evitar usos cruzados. */
export type PropositoToken = 'access';

/** Contenido de un token de acceso. */
export interface ClaimsAcceso {
  sub: string;
  email: string;
  sid: string;
}

/** Contrato de emision y verificacion de tokens. */
export interface TokenService {
  crearTokenAcceso(params: { uuidUsuario: string; email: string; sessionId: string }): string;
  verificarTokenAcceso(token: string): ClaimsAcceso;
}

const ALGORITMO = 'HS256';

const mensajeTokenInvalido = 'El token proporcionado no es valido o ya expiro.';

/**
 * Verifica la firma y la vigencia de un token, y comprueba que su proposito sea el esperado.
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
  };
};
